import { API_PATHS, adminUserPath, type Role } from "@c2r/shared";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/passwords.js";
import { SESSION_COOKIE, startSession } from "../auth/sessions.js";
import { createFreshlySeededContext, createSeededContext, loginAs } from "../testSupport.js";

const NEW_PASSWORD = "neues-passwort";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

type Method = "get" | "post" | "put" | "patch" | "delete";

function changeOwn(agent: ReturnType<typeof request.agent>, currentPassword: string) {
  return agent.put(API_PATHS.ownPassword).send({ currentPassword, newPassword: NEW_PASSWORD });
}

function login(app: Express, username: string, password: string) {
  return request(app).post(API_PATHS.login).send({ username, password });
}

describe("barrier until the password is changed", () => {
  it.each<[Method, string]>([
    ["get", API_PATHS.hello],
    ["get", API_PATHS.materials],
    ["post", API_PATHS.materials],
    ["get", `${API_PATHS.materials}/${UNKNOWN_ID}`],
    ["patch", `${API_PATHS.storageLocations}/${UNKNOWN_ID}`],
    ["get", API_PATHS.storageLocations],
    ["get", API_PATHS.consumptions],
    ["post", API_PATHS.consumptions],
    ["delete", `${API_PATHS.consumptions}/${UNKNOWN_ID}`],
    ["get", API_PATHS.orders],
    ["post", API_PATHS.orders],
    ["get", API_PATHS.adminUsers],
    ["post", API_PATHS.adminUsers],
    ["delete", adminUserPath(UNKNOWN_ID)],
    ["get", API_PATHS.adminOidcSettings],
    ["put", API_PATHS.adminOidcSettings],
    ["get", "/api/ADMIN/users"],
  ])("answers %s %s with 403", async (method, path) => {
    const { app } = await createFreshlySeededContext();
    const agent = await loginAs(app, "admin");

    const res = await agent[method](path).send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: expect.any(String) });
  });

  it("answers 403 before looking at the body", async () => {
    const { app } = await createFreshlySeededContext();
    const agent = await loginAs(app, "admin");

    for (const path of [API_PATHS.materials, API_PATHS.adminUsers]) {
      const res = await agent.post(path).set("Content-Type", "application/json").send("{broken");
      expect(res.status).toBe(403);
    }
  });

  it("keeps login, me, logout and the public routes usable", async () => {
    const { app } = await createFreshlySeededContext();
    const agent = request.agent(app);

    const loggedIn = await agent.post(API_PATHS.login).send({ username: "user", password: "user" });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.mustChangePassword).toBe(true);

    const me = await agent.get(API_PATHS.me);
    expect(me.status).toBe(200);
    expect(me.body.mustChangePassword).toBe(true);

    expect((await agent.get(API_PATHS.authProviders)).status).toBe(200);
    expect((await agent.get(API_PATHS.health)).status).toBe(200);
    expect((await agent.post(API_PATHS.logout)).status).toBe(204);
    expect((await agent.get(API_PATHS.me)).status).toBe(401);
  });

  it("still answers 401 without a session", async () => {
    const { app } = await createFreshlySeededContext();

    expect((await request(app).get(API_PATHS.hello)).status).toBe(401);
    expect((await request(app).get(API_PATHS.adminUsers)).status).toBe(401);
  });

  it.each<[string, Role]>([
    ["admin", "ADMIN"],
    ["manager", "MANAGER"],
    ["user", "USER"],
  ])("opens everything for %s after the change", async (name, role) => {
    const { app } = await createFreshlySeededContext();
    const agent = await loginAs(app, name);
    expect((await agent.get(API_PATHS.materials)).status).toBe(403);

    const res = await changeOwn(agent, name);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role, mustChangePassword: false });
    expect((await agent.get(API_PATHS.hello)).status).toBe(200);
    expect((await agent.get(API_PATHS.materials)).status).toBe(200);
    expect((await agent.get(API_PATHS.adminUsers)).status).toBe(role === "ADMIN" ? 200 : 403);
  });

  it("applies to running sessions at once", async () => {
    const { app, stores } = await createSeededContext();
    const agent = await loginAs(app, "user");
    const user = await stores.users.findByUsername("user");
    expect((await agent.get(API_PATHS.hello)).status).toBe(200);

    await stores.users.update(user?.id ?? "", { mustChangePassword: true });

    expect((await agent.get(API_PATHS.hello)).status).toBe(403);
  });

  it("lifts the barrier when an administrator sets the password", async () => {
    const { app, stores } = await createFreshlySeededContext();
    const admin = await stores.users.findByUsername("admin");
    await stores.users.update(admin?.id ?? "", { mustChangePassword: false });
    const adminAgent = await loginAs(app, "admin");
    const user = await stores.users.findByUsername("user");

    await adminAgent
      .put(`${adminUserPath(user?.id ?? "")}/password`)
      .send({ password: NEW_PASSWORD });

    const agent = request.agent(app);
    await agent.post(API_PATHS.login).send({ username: "user", password: NEW_PASSWORD });
    expect((await agent.get(API_PATHS.hello)).status).toBe(200);
  });
});

describe("PUT /api/auth/password", () => {
  it("changes the password and returns the user", async () => {
    const { app, stores } = await createFreshlySeededContext();
    const agent = await loginAs(app, "user");
    const before = await stores.users.findByUsername("user");

    const res = await changeOwn(agent, "user");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: before?.id,
      username: "user",
      displayName: "Benutzer",
      email: null,
      role: "USER",
      source: "local",
      mustChangePassword: false,
    });
    expect(res.text).not.toMatch(/scrypt|passwordHash/);
    expect((await login(app, "user", "user")).status).toBe(401);
    expect((await login(app, "user", NEW_PASSWORD)).status).toBe(200);
  });

  it("ends all sessions of the user and issues a new one", async () => {
    const { app, stores } = await createSeededContext();
    const agent = await loginAs(app, "user");
    const other = await loginAs(app, "user");
    const bystander = await loginAs(app, "manager");
    const user = await stores.users.findByUsername("user");
    const oldHashes = stores.sessions.all().map((session) => session.tokenHash);

    const res = await changeOwn(agent, "user");

    const cookie = res.get("Set-Cookie")?.find((value) => value.startsWith(SESSION_COOKIE));
    expect(cookie).toMatch(/HttpOnly/);
    expect((await other.get(API_PATHS.me)).status).toBe(401);
    expect((await bystander.get(API_PATHS.me)).status).toBe(200);
    expect((await agent.get(API_PATHS.me)).status).toBe(200);
    const own = stores.sessions.all().filter((session) => session.userId === user?.id);
    expect(own).toHaveLength(1);
    expect(oldHashes).not.toContain(own[0]?.tokenHash);
  });

  it("marks the new cookie Secure when PUBLIC_URL uses https", async () => {
    const { app } = await createSeededContext({ publicUrl: "https://refill.example.org" });
    const loggedIn = await login(app, "user", "user");
    const cookie = loggedIn.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";

    const res = await request(app)
      .put(API_PATHS.ownPassword)
      .set("Cookie", cookie)
      .send({ currentPassword: "user", newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.get("Set-Cookie")?.[0]).toMatch(/Secure/);
  });

  it("answers a wrong current password with 400 and changes nothing", async () => {
    const { app, stores } = await createFreshlySeededContext();
    const agent = await loginAs(app, "user");
    const before = await stores.users.findByUsername("user");

    const res = await changeOwn(agent, "falsch");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: expect.any(String) });
    expect(await stores.users.findByUsername("user")).toEqual(before);
    expect((await agent.get(API_PATHS.me)).status).toBe(200);
  });

  it("rejects a new password equal to the current one", async () => {
    const { app, stores } = await createSeededContext();
    const user = await stores.users.findByUsername("user");
    await stores.users.update(user?.id ?? "", {
      passwordHash: await hashPassword(NEW_PASSWORD),
      mustChangePassword: true,
    });
    const agent = request.agent(app);
    await agent.post(API_PATHS.login).send({ username: "user", password: NEW_PASSWORD });

    const res = await changeOwn(agent, NEW_PASSWORD);

    expect(res.status).toBe(400);
    expect((await stores.users.findByUsername("user"))?.mustChangePassword).toBe(true);
  });

  it.each([
    ["a missing current password", { newPassword: NEW_PASSWORD }],
    ["an object as current password", { currentPassword: { $ne: "" }, newPassword: NEW_PASSWORD }],
    ["a missing new password", { currentPassword: "user" }],
    ["a short new password", { currentPassword: "user", newPassword: "kurz" }],
    ["an object as new password", { currentPassword: "user", newPassword: { length: 20 } }],
    ["an array as body", ["user", NEW_PASSWORD]],
  ])("rejects %s with 400", async (_name, body) => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");

    const res = await agent.put(API_PATHS.ownPassword).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: expect.any(String) });
  });

  it("answers IAM users with 409, whatever the body", async () => {
    const { app, stores } = await createSeededContext();
    const iam = await stores.users.create({
      username: "iam",
      displayName: "IAM",
      email: null,
      role: "USER",
      source: "oidc",
      oidcIssuer: "https://idp.example",
      oidcSubject: "sub",
    });
    const agent = request.agent(app);
    const cookies: string[] = [];
    await startSession(
      stores.sessions,
      {
        cookie: (name: string, value: string) => cookies.push(`${name}=${value}`),
      } as never,
      iam.id,
      false,
    );
    const cookie = cookies[0] ?? "";

    const valid = await agent
      .put(API_PATHS.ownPassword)
      .set("Cookie", cookie)
      .send({ currentPassword: "egal-egal", newPassword: NEW_PASSWORD });
    const broken = await agent
      .put(API_PATHS.ownPassword)
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .send("{broken");

    expect(valid.status).toBe(409);
    expect(broken.status).toBe(409);
    expect((await stores.users.findById(iam.id))?.passwordHash).toBeNull();
  });

  it("answers 401 without a session, whatever the body", async () => {
    const { app } = await createSeededContext();
    const put = () => request(app).put(API_PATHS.ownPassword);

    const responses = await Promise.all([
      put().send({ currentPassword: "user", newPassword: NEW_PASSWORD }),
      put().set("Content-Type", "application/json").send("{broken"),
      put().send({ newPassword: "x".repeat(200 * 1024) }),
      put().set("Content-Type", "application/json; charset=foo").send("{}"),
      request(app).put("/api/AUTH/password").send({}),
    ]);

    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(401));
  });

  it.each([
    ["a malformed body", "application/json", "{broken", 400],
    ["an unknown charset", "application/json; charset=foo", "{}", 415],
    ["a body too large", "application/json", JSON.stringify({ a: "x".repeat(200 * 1024) }), 413],
  ])("answers %s with a session as the parser demands", async (_name, type, body, status) => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");

    const res = await agent.put(API_PATHS.ownPassword).set("Content-Type", type).send(body);

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ message: expect.any(String) });
  });

  it("lets only the first of two simultaneous changes succeed", async () => {
    const { app, stores } = await createSeededContext();
    const first = await loginAs(app, "user");
    const second = await loginAs(app, "user");

    const responses = await Promise.all([
      first.put(API_PATHS.ownPassword).send({ currentPassword: "user", newPassword: "erstes-pw" }),
      second
        .put(API_PATHS.ownPassword)
        .send({ currentPassword: "user", newPassword: "zweites-pw" }),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 400]);
    expect(stores.sessions.all()).toHaveLength(1);
  });
});

describe("limit of failed password changes", () => {
  const invalid = { currentPassword: "user" };

  it("blocks after ten failures, also the correct password", async () => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");

    expect((await changeOwn(agent, "falsch")).status).toBe(400);
    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect((await agent.put(API_PATHS.ownPassword).send(invalid)).status).toBe(400);
    }

    const blocked = await changeOwn(agent, "user");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: expect.any(String) });
    expect((await login(app, "user", "user")).status).toBe(200);
  });

  it("does not count successful changes", async () => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await agent.put(API_PATHS.ownPassword).send(invalid);
    }

    expect((await changeOwn(agent, "user")).status).toBe(200);

    expect((await agent.put(API_PATHS.ownPassword).send(invalid)).status).toBe(400);
    expect((await agent.put(API_PATHS.ownPassword).send(invalid)).status).toBe(429);
  });

  it("does not count requests without a session", async () => {
    const { app } = await createSeededContext();
    for (let attempt = 0; attempt < 11; attempt += 1) {
      expect((await request(app).put(API_PATHS.ownPassword).send(invalid)).status).toBe(401);
    }

    const agent = await loginAs(app, "user");

    expect((await agent.put(API_PATHS.ownPassword).send(invalid)).status).toBe(400);
  });

  it("does not share its counter with the login", async () => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await agent.put(API_PATHS.ownPassword).send(invalid);
    }

    expect((await login(app, "manager", "manager")).status).toBe(200);
  });

  it("counts per client behind the TLS proxy of an https PUBLIC_URL", async () => {
    const { app } = await createSeededContext({ publicUrl: "https://refill.example.org" });
    const loggedIn = await login(app, "user", "user");
    const cookie = loggedIn.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";
    const putFrom = (ip: string) =>
      request(app)
        .put(API_PATHS.ownPassword)
        .set("Cookie", cookie)
        .set("X-Forwarded-For", ip)
        .send(invalid);

    for (let attempt = 0; attempt < 10; attempt += 1) await putFrom("203.0.113.1");

    expect((await putFrom("203.0.113.1")).status).toBe(429);
    expect((await putFrom("203.0.113.2")).status).toBe(400);
  });
});
