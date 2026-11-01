import { API_PATHS, adminUserPasswordPath, adminUserPath } from "@c2r/shared";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, SESSION_TTL_MS, hashSessionToken } from "../auth/sessions.js";
import { createSeededContext, loginAs } from "../testSupport.js";

function setCookieHeader(res: request.Response): string {
  const header = res.get("Set-Cookie")?.find((cookie) => cookie.startsWith(SESSION_COOKIE));
  if (!header) throw new Error("Session cookie is missing");
  return header;
}

function login(app: Express, username: string, password: string) {
  return request(app).post(API_PATHS.login).send({ username, password });
}

describe("login, me and logout", () => {
  it("signs in, reports the user and signs out", async () => {
    const { app, stores } = await createSeededContext();
    const agent = request.agent(app);

    const loggedIn = await agent
      .post(API_PATHS.login)
      .send({ username: "admin", password: "admin" });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body).toEqual({
      id: expect.any(String),
      username: "admin",
      displayName: "Administrator",
      email: null,
      role: "ADMIN",
      source: "local",
    });

    const me = await agent.get(API_PATHS.me);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(loggedIn.body);

    expect((await agent.post(API_PATHS.logout)).status).toBe(204);
    expect((await agent.get(API_PATHS.me)).status).toBe(401);
    expect(stores.sessions.all()).toEqual([]);
  });

  it("succeeds on logout without a session", async () => {
    const { app } = await createSeededContext();

    expect((await request(app).post(API_PATHS.logout)).status).toBe(204);
  });

  it("sets the session cookie with the agreed attributes", async () => {
    const { app } = await createSeededContext();

    const cookie = setCookieHeader(await login(app, "admin", "admin"));

    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_TTL_MS / 1000}`));
    expect(cookie).not.toMatch(/Secure/);
  });

  it("marks the cookie Secure when PUBLIC_URL uses https", async () => {
    const { app } = await createSeededContext({ publicUrl: "https://refill.example.org" });

    expect(setCookieHeader(await login(app, "admin", "admin"))).toMatch(/Secure/);
  });

  it("keeps only the hash of the token", async () => {
    const { app, stores } = await createSeededContext();

    const cookie = setCookieHeader(await login(app, "admin", "admin"));

    const token = /^c2r_session=([^;]+)/.exec(cookie)?.[1] ?? "";
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const [session] = stores.sessions.all();
    expect(session?.tokenHash).toBe(hashSessionToken(token));
    expect(session?.tokenHash).not.toBe(token);
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
  });

  it("rejects an expired session even before the TTL index removed it", async () => {
    const { app, stores } = await createSeededContext();
    const user = await stores.users.findByUsername("user");
    await stores.sessions.create({
      tokenHash: hashSessionToken("expired"),
      userId: user?.id ?? "",
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).get(API_PATHS.me).set("Cookie", `${SESSION_COOKIE}=expired`);

    expect(res.status).toBe(401);
  });

  it("answers wrong credentials with the same message", async () => {
    const { app, stores } = await createSeededContext();
    await stores.users.create({
      username: "iam",
      displayName: "IAM",
      email: null,
      role: "USER",
      source: "oidc",
      oidcIssuer: "https://idp.example",
      oidcSubject: "sub",
    });

    const wrongPassword = await login(app, "admin", "wrong");
    const unknownUser = await login(app, "nobody", "wrong");
    const iamUser = await login(app, "iam", "wrong");

    for (const res of [wrongPassword, unknownUser, iamUser]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(wrongPassword.body);
      expect(res.get("Set-Cookie")).toBeUndefined();
    }
  });

  it.each([
    [{ username: { $ne: null }, password: "admin" }],
    [{ username: "admin", password: { $ne: null } }],
    [{ username: "admin" }],
    [["admin", "admin"]],
  ])("rejects the malformed body %j", async (body) => {
    const { app } = await createSeededContext();

    const res = await request(app).post(API_PATHS.login).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: expect.any(String) });
  });
});

describe("protection of routes", () => {
  it.each([
    ["get", API_PATHS.hello],
    ["get", API_PATHS.me],
    ["get", API_PATHS.adminUsers],
    ["post", API_PATHS.adminUsers],
    ["patch", adminUserPath("1")],
    ["delete", adminUserPath("1")],
    ["put", adminUserPasswordPath("1")],
    ["get", API_PATHS.adminOidcSettings],
    ["put", API_PATHS.adminOidcSettings],
    ["get", "/api/ADMIN/users"],
  ] as const)("answers %s %s without a session with 401", async (method, path) => {
    const { app } = await createSeededContext();

    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: expect.any(String) });
  });

  it.each(["manager", "user"])("answers admin routes for %s with 403", async (name) => {
    const { app, stores } = await createSeededContext();
    const agent = await loginAs(app, name);
    const admin = await stores.users.findByUsername("admin");
    const adminId = admin?.id ?? "";

    const responses = await Promise.all([
      agent.get(API_PATHS.adminUsers),
      agent.post(API_PATHS.adminUsers).send({}),
      agent.patch(adminUserPath(adminId)).send({ role: "USER" }),
      agent.delete(adminUserPath(adminId)),
      agent.put(adminUserPasswordPath(adminId)).send({ password: "longenough" }),
      agent.get(API_PATHS.adminOidcSettings),
      agent.put(API_PATHS.adminOidcSettings).send({}),
    ]);

    expect(responses.map((res) => res.status)).toEqual(Array(7).fill(403));
    expect(await stores.users.findByUsername("admin")).toEqual(admin);
  });

  it("lets every role read the greeting", async () => {
    const { app } = await createSeededContext();

    for (const name of ["admin", "manager", "user"]) {
      const agent = await loginAs(app, name);
      expect((await agent.get(API_PATHS.hello)).status).toBe(200);
    }
  });

  it("applies a role change to running sessions at once", async () => {
    const { app, stores } = await createSeededContext();
    const agent = await loginAs(app, "manager");
    const manager = await stores.users.findByUsername("manager");

    expect((await agent.get(API_PATHS.adminUsers)).status).toBe(403);
    await stores.users.update(manager?.id ?? "", { role: "ADMIN" });

    expect((await agent.get(API_PATHS.adminUsers)).status).toBe(200);
    expect((await agent.get(API_PATHS.me)).body.role).toBe("ADMIN");
  });
});

describe("login rate limit", () => {
  it("blocks after ten failures, also for correct credentials", async () => {
    const { app } = await createSeededContext();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login(app, "admin", "wrong")).status).toBe(401);
    }

    const blocked = await login(app, "admin", "admin");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: expect.any(String) });
  });

  it("does not count successful logins", async () => {
    const { app } = await createSeededContext();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await login(app, "admin", "admin")).status).toBe(200);
    }
  });

  it("limits only the login route", async () => {
    const { app } = await createSeededContext();
    for (let attempt = 0; attempt < 10; attempt += 1) await login(app, "admin", "wrong");

    expect((await request(app).get(API_PATHS.me)).status).toBe(401);
    expect((await request(app).post(API_PATHS.logout)).status).toBe(204);
  });

  it("keeps the counters of two apps apart", async () => {
    const first = await createSeededContext();
    for (let attempt = 0; attempt < 10; attempt += 1) await login(first.app, "admin", "wrong");
    const second = await createSeededContext();

    expect((await login(first.app, "admin", "admin")).status).toBe(429);
    expect((await login(second.app, "admin", "admin")).status).toBe(200);
  });

  it("counts per client behind the TLS proxy of an https PUBLIC_URL", async () => {
    const { app } = await createSeededContext({ publicUrl: "https://refill.example.org" });
    const loginFrom = (ip: string) =>
      request(app)
        .post(API_PATHS.login)
        .set("X-Forwarded-For", ip)
        .send({ username: "admin", password: "wrong" });

    for (let attempt = 0; attempt < 10; attempt += 1) await loginFrom("203.0.113.1");

    expect((await loginFrom("203.0.113.1")).status).toBe(429);
    expect((await loginFrom("203.0.113.2")).status).toBe(401);
  });
});

describe("authentication providers", () => {
  it("is public and reports no provider without settings", async () => {
    const { app } = await createSeededContext();

    const res = await request(app).get(API_PATHS.authProviders);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ oidc: null });
  });
});
