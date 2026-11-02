import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "../testSupport.js";
import { hashPassword } from "./passwords.js";
import { flagDefaultPasswords, seedDefaultUsers } from "./seed.js";

describe("seedDefaultUsers", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the three default users and warns", async () => {
    const { app, stores } = createTestContext();

    await expect(seedDefaultUsers(stores.users)).resolves.toBe(true);

    const users = await stores.users.list();
    expect(users.map(({ username, role, source }) => [username, role, source])).toEqual([
      ["admin", "ADMIN", "local"],
      ["manager", "MANAGER", "local"],
      ["user", "USER", "local"],
    ]);
    expect(console.warn).toHaveBeenCalledOnce();
    for (const username of ["admin", "manager", "user"]) {
      const res = await request(app).post(API_PATHS.login).send({ username, password: username });
      expect(res.status).toBe(200);
    }
  });

  it("stores hashes instead of the passwords", async () => {
    const { stores } = createTestContext();

    await seedDefaultUsers(stores.users);

    for (const user of await stores.users.list()) {
      expect(user.passwordHash).toMatch(/^scrypt\$/);
    }
  });

  it("does nothing if a user exists", async () => {
    const { stores } = createTestContext();
    await stores.users.create({
      username: "other",
      displayName: "Other",
      email: null,
      role: "ADMIN",
      source: "local",
      passwordHash: "hash",
    });

    await expect(seedDefaultUsers(stores.users)).resolves.toBe(false);

    expect(await stores.users.count()).toBe(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not run twice", async () => {
    const { stores } = createTestContext();
    await seedDefaultUsers(stores.users);

    await expect(seedDefaultUsers(stores.users)).resolves.toBe(false);

    expect(await stores.users.count()).toBe(3);
  });

  it("demands a password change from the default users", async () => {
    const { stores } = createTestContext();

    await seedDefaultUsers(stores.users);

    const users = await stores.users.list();
    expect(users.map((user) => user.mustChangePassword)).toEqual([true, true, true]);
  });
});

describe("flagDefaultPasswords", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createUnflagged() {
    const { stores } = createTestContext();
    await seedDefaultUsers(stores.users);
    for (const { id } of await stores.users.list()) {
      await stores.users.update(id, { mustChangePassword: false });
    }
    vi.mocked(console.warn).mockClear();
    return stores.users;
  }

  it("flags default users that still have their default password", async () => {
    const users = await createUnflagged();

    await expect(flagDefaultPasswords(users)).resolves.toEqual(["admin", "manager", "user"]);

    const flags = (await users.list()).map((user) => user.mustChangePassword);
    expect(flags).toEqual([true, true, true]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("leaves a changed password alone", async () => {
    const users = await createUnflagged();
    const admin = await users.findByUsername("admin");
    await users.update(admin?.id ?? "", { passwordHash: await hashPassword("etwas-anderes") });

    await expect(flagDefaultPasswords(users)).resolves.toEqual(["manager", "user"]);

    expect((await users.findByUsername("admin"))?.mustChangePassword).toBe(false);
  });

  it("ignores IAM users and other names", async () => {
    const { stores } = createTestContext();
    const { users } = stores;
    const iam = await users.create({
      username: "admin",
      displayName: "IAM",
      email: null,
      role: "ADMIN",
      source: "oidc",
      oidcIssuer: "https://idp.example",
      oidcSubject: "sub",
    });
    const other = await users.create({
      username: "other",
      displayName: "Other",
      email: null,
      role: "USER",
      source: "local",
      passwordHash: await hashPassword("other"),
    });

    await expect(flagDefaultPasswords(users)).resolves.toEqual([]);

    expect((await users.findById(iam.id))?.mustChangePassword).toBe(false);
    expect((await users.findById(other.id))?.mustChangePassword).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not repeat itself for users already flagged", async () => {
    const { stores } = createTestContext();
    await seedDefaultUsers(stores.users);
    vi.mocked(console.warn).mockClear();

    await expect(flagDefaultPasswords(stores.users)).resolves.toEqual([]);

    expect(console.warn).not.toHaveBeenCalled();
  });
});
