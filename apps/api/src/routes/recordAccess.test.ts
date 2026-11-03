import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;
type Method = "get" | "post" | "put" | "patch" | "delete";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const ALL_PATHS = [
  API_PATHS.materials,
  API_PATHS.storageLocations,
  API_PATHS.consumptions,
  API_PATHS.orders,
];
const RESTRICTED_PATHS = [API_PATHS.materials, API_PATHS.storageLocations, API_PATHS.orders];

describe.each(ALL_PATHS)("%s without a session", (path) => {
  let context: Context;

  beforeEach(async () => {
    context = await createSeededContext();
  });

  it.each<[Method, string]>([
    ["get", ""],
    ["post", ""],
    ["put", ""],
    ["get", `/${UNKNOWN_ID}`],
    ["patch", `/${UNKNOWN_ID}`],
    ["delete", `/${UNKNOWN_ID}`],
    ["put", `/${UNKNOWN_ID}`],
    ["get", "/keine-guid"],
    ["patch", "/keine-guid"],
    ["delete", "/keine-guid"],
    ["delete", "/%E0%A4%A"],
  ])("answers %s %s with 401", async (method, suffix) => {
    const res = await request(context.app)[method](`${path}${suffix}`).send({});

    expect(res.status).toBe(401);
    expect(res.body.message).toEqual(expect.any(String));
  });

  it("answers 401 for an invalid body as well", async () => {
    const res = await request(context.app).post(path).send({ name: "", quantity: -1 });

    expect(res.status).toBe(401);
  });

  it("answers 401 for a body that cannot be parsed", async () => {
    const malformed = await request(context.app)
      .post(path)
      .set("Content-Type", "application/json")
      .send("{broken");
    const tooLarge = await request(context.app)
      .post(path)
      .send({ name: "x".repeat(200 * 1024) });

    expect(malformed.status).toBe(401);
    expect(tooLarge.status).toBe(401);
  });

  it("answers 401 for an unknown charset and on PATCH", async () => {
    const charset = await request(context.app)
      .post(path)
      .set("Content-Type", "application/json; charset=foo")
      .send("{}");
    const patch = await request(context.app)
      .patch(`${path}/${UNKNOWN_ID}`)
      .set("Content-Type", "application/json")
      .send("{broken");

    expect(charset.status).toBe(401);
    expect(patch.status).toBe(401);
  });

  it("writes nothing", async () => {
    await request(context.app).post(path).send({ name: "Neu" });

    expect(await context.stores.materials.list()).toEqual([]);
    expect(await context.stores.storageLocations.list()).toEqual([]);
  });
});

describe("roles", () => {
  let context: Context;
  let admin: Agent;
  let user: Agent;
  let manager: Agent;
  let materialId: string;
  let storageLocationId: string;
  let movement: { materialId: string; storageLocationId: string; quantity: number };

  const validBody = (path: string): object => {
    if (path === API_PATHS.materials) return { name: "Mutter", unit: "Stück" };
    if (path === API_PATHS.storageLocations) return { name: "Halle 2" };
    return movement;
  };

  beforeEach(async () => {
    context = await createSeededContext();
    admin = await loginAs(context.app, "admin");
    manager = await loginAs(context.app, "manager");
    user = await loginAs(context.app, "user");
    const material = await admin.post(API_PATHS.materials).send({ name: "Schraube" });
    const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle 1" });
    materialId = material.body.id;
    storageLocationId = location.body.id;
    movement = { materialId, storageLocationId, quantity: 1 };
  });

  describe.each(RESTRICTED_PATHS)("%s as USER", (path) => {
    it("answers 403 on every write, before the body and the id are looked at", async () => {
      const existing = await admin.post(path).send(validBody(path));
      const item = `${path}/${existing.body.id}`;

      expect((await user.post(path).send(validBody(path))).status).toBe(403);
      expect((await user.post(path).send({})).status).toBe(403);
      expect((await user.patch(item).send(validBody(path))).status).toBe(403);
      expect((await user.patch(item).send({})).status).toBe(403);
      expect((await user.delete(item)).status).toBe(403);
      expect((await user.patch(`${path}/${UNKNOWN_ID}`).send({})).status).toBe(403);
      expect((await user.delete(`${path}/${UNKNOWN_ID}`)).status).toBe(403);
      expect((await user.patch(`${path}/keine-guid`).send({})).status).toBe(403);
      expect((await user.delete(`${path}/keine-guid`)).status).toBe(403);
      expect((await user.delete(`${path}/%E0%A4%A`)).status).toBe(403);

      expect((await admin.get(item)).status).toBe(200);
    });

    it("answers 403 for a body that cannot be parsed", async () => {
      const res = await user.post(path).set("Content-Type", "application/json").send("{broken");

      expect(res.status).toBe(403);
    });

    it("answers 403 for an unknown charset, a body too large and on PATCH", async () => {
      const charset = await user
        .post(path)
        .set("Content-Type", "application/json; charset=foo")
        .send("{}");
      const tooLarge = await user.post(path).send({ name: "x".repeat(200 * 1024) });
      const patch = await user
        .patch(`${path}/${UNKNOWN_ID}`)
        .set("Content-Type", "application/json")
        .send("{broken");

      expect(charset.status).toBe(403);
      expect(tooLarge.status).toBe(403);
      expect(patch.status).toBe(403);
    });

    it(path === API_PATHS.orders ? "cannot read either" : "can read", async () => {
      const existing = await admin.post(path).send(validBody(path));
      const expected = path === API_PATHS.orders ? 403 : 200;

      expect((await user.get(path)).status).toBe(expected);
      expect((await user.get(`${path}/${existing.body.id}`)).status).toBe(expected);
      expect((await user.head(path)).status).toBe(expected);
    });
  });

  it("answers USER 403 on reading orders before the id is looked at", async () => {
    expect((await user.get(`${API_PATHS.orders}/${UNKNOWN_ID}`)).status).toBe(403);
    expect((await user.get(`${API_PATHS.orders}/keine-guid`)).status).toBe(403);
  });

  it("lets ADMIN and MANAGER read orders", async () => {
    const existing = await admin.post(API_PATHS.orders).send(movement);

    for (const agent of [admin, manager]) {
      expect((await agent.get(API_PATHS.orders)).status).toBe(200);
      expect((await agent.get(`${API_PATHS.orders}/${existing.body.id}`)).status).toBe(200);
    }
  });

  describe.each(RESTRICTED_PATHS)("%s as ADMIN and MANAGER", (path) => {
    it("allows writing", async () => {
      for (const agent of [admin, manager]) {
        const created = await agent.post(path).send(
          path === API_PATHS.orders
            ? movement
            : {
                name: `Neu ${agent === admin ? "a" : "m"}`,
              },
        );
        expect(created.status).toBe(201);
        const item = `${path}/${created.body.id}`;
        const patch = path === API_PATHS.orders ? { quantity: 2 } : { name: `${created.body.id}` };
        expect((await agent.patch(item).send(patch)).status).toBe(200);
        expect((await agent.delete(item)).status).toBe(204);
      }
    });
  });

  describe("consumptions", () => {
    it.each(["admin", "manager", "user"])("can be written as %s", async (name) => {
      const agent = await loginAs(context.app, name);
      const created = await agent.post(API_PATHS.consumptions).send(movement);
      expect(created.status).toBe(201);
      const item = `${API_PATHS.consumptions}/${created.body.id}`;
      expect((await agent.get(item)).status).toBe(200);
      expect((await agent.patch(item).send({ quantity: 2.5 })).status).toBe(200);
      expect((await agent.delete(item)).status).toBe(204);
    });

    it("validates and answers 404 for USER, as there is no role barrier", async () => {
      expect((await user.post(API_PATHS.consumptions).send({})).status).toBe(400);
      expect((await user.delete(`${API_PATHS.consumptions}/${UNKNOWN_ID}`)).status).toBe(404);
    });
  });

  it.each(ALL_PATHS)(
    "answers 400 for a malformed body on %s when allowed to write",
    async (path) => {
      const res = await admin.post(path).set("Content-Type", "application/json").send("{broken");

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.any(String));
    },
  );

  it.each(ALL_PATHS)("reports parser errors on %s when allowed to write", async (path) => {
    const charset = await admin
      .post(path)
      .set("Content-Type", "application/json; charset=foo")
      .send("{}");
    const tooLarge = await admin.post(path).send({ name: "x".repeat(200 * 1024) });
    const patch = await admin
      .patch(`${path}/${UNKNOWN_ID}`)
      .set("Content-Type", "application/json")
      .send("{broken");

    expect(charset.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(patch.status).toBe(400);
  });

  it.each(["\u0000", "\ud800"])("rejects the character %j in a name", async (character) => {
    const res = await admin.post(API_PATHS.materials).send({ name: `x${character}` });

    expect(res.status).toBe(400);
  });

  it("applies a role change at once", async () => {
    const stored = await context.stores.users.findByUsername("manager");
    await context.stores.users.update(stored?.id ?? "", { role: "USER" });

    expect((await manager.post(API_PATHS.materials).send({ name: "Neu" })).status).toBe(403);
  });
});
