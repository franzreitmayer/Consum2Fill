import { API_PATHS, adminUserPasswordPath, adminUserPath } from "@c2r/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createSeededContext, loginAs, TEST_ISSUER } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;

const newUser = {
  username: "neu",
  displayName: "Neu",
  email: "neu@example.org",
  role: "USER",
  password: "langes-passwort",
};

describe("admin users", () => {
  let context: Context;
  let admin: Awaited<ReturnType<typeof loginAs>>;

  async function idOf(username: string): Promise<string> {
    const user = await context.stores.users.findByUsername(username);
    if (!user) throw new Error(`Unknown user ${username}`);
    return user.id;
  }

  function createIamUser() {
    return context.stores.users.create({
      username: "iam",
      displayName: "IAM",
      email: null,
      role: "USER",
      source: "oidc",
      oidcIssuer: TEST_ISSUER,
      oidcSubject: "sub-iam",
    });
  }

  beforeEach(async () => {
    context = await createSeededContext();
    admin = await loginAs(context.app, "admin");
  });

  describe("list", () => {
    it("lists all users without secrets", async () => {
      const res = await admin.get(API_PATHS.adminUsers);

      expect(res.status).toBe(200);
      expect(res.body.map((user: { username: string }) => user.username)).toEqual([
        "admin",
        "manager",
        "user",
      ]);
      expect(Object.keys(res.body[0]).sort()).toEqual(
        ["displayName", "email", "id", "role", "source", "username"].sort(),
      );
      expect(res.text).not.toMatch(/scrypt|passwordHash/);
    });
  });

  describe("create", () => {
    it("creates a local user who can sign in", async () => {
      const res = await admin.post(API_PATHS.adminUsers).send(newUser);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        username: "neu",
        displayName: "Neu",
        email: "neu@example.org",
        role: "USER",
        source: "local",
      });
      const login = await request(context.app)
        .post(API_PATHS.login)
        .send({ username: "neu", password: newUser.password });
      expect(login.status).toBe(200);
    });

    it("defaults a missing email to null", async () => {
      const res = await admin.post(API_PATHS.adminUsers).send({ ...newUser, email: undefined });

      expect(res.body.email).toBeNull();
    });

    it("answers a taken username with 409", async () => {
      const res = await admin.post(API_PATHS.adminUsers).send({ ...newUser, username: "user" });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it.each([
      ["no username", { username: undefined }],
      ["blank username", { username: "   " }],
      ["object as username", { username: { $ne: null } }],
      ["no displayName", { displayName: "" }],
      ["number as email", { email: 1 }],
      ["unknown role", { role: "manager" }],
      ["array as role", { role: ["ADMIN"] }],
      ["short password", { password: "kurz" }],
      ["object as password", { password: { length: 20 } }],
    ])("rejects %s with 400", async (_name, change) => {
      const res = await admin.post(API_PATHS.adminUsers).send({ ...newUser, ...change });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: expect.any(String) });
      expect(await context.stores.users.count()).toBe(3);
    });
  });

  describe("update", () => {
    it("changes the given fields only", async () => {
      const id = await idOf("user");

      const res = await admin
        .patch(adminUserPath(id))
        .send({ displayName: "Neuer Name", email: "a@example.org", role: "MANAGER" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id,
        username: "user",
        displayName: "Neuer Name",
        email: "a@example.org",
        role: "MANAGER",
        source: "local",
      });
    });

    it("clears the email with null", async () => {
      const id = await idOf("user");
      await admin.patch(adminUserPath(id)).send({ email: "a@example.org" });

      const res = await admin.patch(adminUserPath(id)).send({ email: null });

      expect(res.body.email).toBeNull();
    });

    it("answers a taken username with 409", async () => {
      const res = await admin.patch(adminUserPath(await idOf("user"))).send({ username: "admin" });

      expect(res.status).toBe(409);
    });

    it("answers an unknown id with 404", async () => {
      const res = await admin.patch(adminUserPath("unknown")).send({ role: "USER" });

      expect(res.status).toBe(404);
    });

    it("answers an undecodable id with 404", async () => {
      const res = await admin.patch(`${API_PATHS.adminUsers}/%E0%A4%A`).send({ role: "USER" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it.each([
      ["an empty body", {}],
      ["only unknown fields", { passwordHash: "x", source: "oidc" }],
      ["a blank username", { username: " " }],
      ["an unknown role", { role: "ROOT" }],
      ["an object as displayName", { displayName: { $gt: "" } }],
    ])("rejects %s with 400", async (_name, body) => {
      const res = await admin.patch(adminUserPath(await idOf("user"))).send(body);

      expect(res.status).toBe(400);
    });

    it("ignores attempts to change protected fields", async () => {
      const id = await idOf("user");
      const before = await context.stores.users.findById(id);

      await admin
        .patch(adminUserPath(id))
        .send({ displayName: "Neu", passwordHash: "x", source: "oidc" });

      const after = await context.stores.users.findById(id);
      expect(after?.passwordHash).toBe(before?.passwordHash);
      expect(after?.source).toBe("local");
    });

    it("lets IAM users change their role only", async () => {
      const { id } = await createIamUser();

      expect((await admin.patch(adminUserPath(id)).send({ role: "MANAGER" })).status).toBe(200);
      for (const body of [
        { username: "x" },
        { displayName: "x" },
        { email: null },
        { role: "USER", displayName: "x" },
      ]) {
        expect((await admin.patch(adminUserPath(id)).send(body)).status).toBe(409);
      }
      const stored = await context.stores.users.findById(id);
      expect(stored).toMatchObject({ username: "iam", displayName: "IAM", role: "MANAGER" });
    });
  });

  describe("last administrator", () => {
    it("rejects deleting the own account with the id in upper case", async () => {
      const id = await idOf("admin");
      await context.stores.users.create({
        username: "second",
        displayName: "Second",
        email: null,
        role: "ADMIN",
        source: "local",
        passwordHash: "x",
      });

      const res = await admin.delete(adminUserPath(id.toUpperCase()));

      expect(res.status).toBe(409);
      expect(await context.stores.users.findById(id)).not.toBeNull();
    });

    it("keeps the last local administrator while an IAM administrator exists", async () => {
      const iam = await context.stores.users.create({
        username: "iam-admin",
        displayName: "IAM",
        email: null,
        role: "ADMIN",
        source: "oidc",
        oidcIssuer: TEST_ISSUER,
        oidcSubject: "iam-admin",
      });

      const demoted = await admin.patch(adminUserPath(await idOf("admin"))).send({ role: "USER" });
      const removed = await admin.delete(adminUserPath(iam.id));

      expect(demoted.status).toBe(409);
      expect(removed.status).toBe(204);
    });

    it("keeps the role of the last administrator", async () => {
      const id = await idOf("admin");

      const res = await admin.patch(adminUserPath(id)).send({ role: "USER" });

      expect(res.status).toBe(409);
      expect((await context.stores.users.findById(id))?.role).toBe("ADMIN");
    });

    it("allows other changes to the last administrator", async () => {
      const res = await admin
        .patch(adminUserPath(await idOf("admin")))
        .send({ role: "ADMIN", displayName: "Chef" });

      expect(res.status).toBe(200);
    });

    it("lets an administrator step down when another one remains", async () => {
      await admin.patch(adminUserPath(await idOf("manager"))).send({ role: "ADMIN" });

      const res = await admin.patch(adminUserPath(await idOf("admin"))).send({ role: "USER" });

      expect(res.status).toBe(200);
      expect((await admin.get(API_PATHS.adminUsers)).status).toBe(403);
    });

    it("survives two administrators deleting each other at once", async () => {
      const managerId = await idOf("manager");
      const adminId = await idOf("admin");
      await admin.patch(adminUserPath(managerId)).send({ role: "ADMIN" });
      const second = await loginAs(context.app, "manager");
      // Holds the first write back until both requests have passed the session check
      const { delete: remove } = context.stores.users;
      context.stores.users.delete = async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return remove(id);
      };

      const statuses = (
        await Promise.all([
          admin.delete(adminUserPath(managerId)),
          second.delete(adminUserPath(adminId)),
        ])
      ).map((res) => res.status);

      expect(statuses.sort()).toEqual([204, 409]);
      expect(await context.stores.users.countByRole("ADMIN")).toBe(1);
    });

    it("survives two administrators demoting each other at once", async () => {
      const managerId = await idOf("manager");
      const adminId = await idOf("admin");
      await admin.patch(adminUserPath(managerId)).send({ role: "ADMIN" });
      const second = await loginAs(context.app, "manager");
      const { update } = context.stores.users;
      context.stores.users.update = async (id, patch) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return update(id, patch);
      };

      const responses = await Promise.all([
        admin.patch(adminUserPath(managerId)).send({ role: "USER" }),
        second.patch(adminUserPath(adminId)).send({ role: "USER" }),
      ]);

      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(await context.stores.users.countByRole("ADMIN")).toBe(1);
    });
  });

  describe("delete", () => {
    it("deletes a user and ends the running sessions", async () => {
      const agent = await loginAs(context.app, "user");
      const id = await idOf("user");

      expect((await admin.delete(adminUserPath(id))).status).toBe(204);

      expect(await context.stores.users.findById(id)).toBeNull();
      expect(context.stores.sessions.all().filter((s) => s.userId === id)).toEqual([]);
      expect((await agent.get(API_PATHS.me)).status).toBe(401);
    });

    it("refuses to delete the own account", async () => {
      const id = await idOf("admin");

      expect((await admin.delete(adminUserPath(id))).status).toBe(409);
      expect(await context.stores.users.findById(id)).not.toBeNull();
    });

    it("answers an unknown id with 404", async () => {
      expect((await admin.delete(adminUserPath("unknown"))).status).toBe(404);
    });
  });

  describe("set password", () => {
    it("replaces the password and ends the sessions of the user", async () => {
      const agent = await loginAs(context.app, "user");
      const otherAdminSession = await admin.get(API_PATHS.me);
      expect(otherAdminSession.status).toBe(200);

      const res = await admin
        .put(adminUserPasswordPath(await idOf("user")))
        .send({ password: "neues-passwort" });

      expect(res.status).toBe(204);
      expect((await agent.get(API_PATHS.me)).status).toBe(401);
      expect((await admin.get(API_PATHS.me)).status).toBe(200);
      const oldLogin = await request(context.app)
        .post(API_PATHS.login)
        .send({ username: "user", password: "user" });
      expect(oldLogin.status).toBe(401);
      const newLogin = await request(context.app)
        .post(API_PATHS.login)
        .send({ username: "user", password: "neues-passwort" });
      expect(newLogin.status).toBe(200);
    });

    it.each([[{}], [{ password: "kurz" }], [{ password: 12345678 }]])(
      "rejects %j with 400",
      async (body) => {
        const res = await admin.put(adminUserPasswordPath(await idOf("user"))).send(body);

        expect(res.status).toBe(400);
      },
    );

    it("answers an unknown id with 404", async () => {
      const res = await admin
        .put(adminUserPasswordPath("unknown"))
        .send({ password: "neues-passwort" });

      expect(res.status).toBe(404);
    });

    it("answers IAM users with 409", async () => {
      const { id } = await createIamUser();

      const res = await admin.put(adminUserPasswordPath(id)).send({ password: "neues-passwort" });

      expect(res.status).toBe(409);
    });
  });
});
