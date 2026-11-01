import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "../testSupport.js";
import { seedDefaultUsers } from "./seed.js";

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
});
