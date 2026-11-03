import { setTimeout as delay } from "node:timers/promises";
import { API_PATHS, type Movement } from "@c2r/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface Scenario {
  context: Context;
  admin: Agent;
  materialId: string;
  storageLocationId: string;
  movement: { materialId: string; storageLocationId: string; quantity: number };
}

async function createScenario(): Promise<Scenario> {
  const context = await createSeededContext();
  const admin = await loginAs(context.app, "admin");
  const material = await admin.post(API_PATHS.materials).send({ name: "Schraube" });
  const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle 1" });
  const materialId: string = material.body.id;
  const storageLocationId: string = location.body.id;
  return {
    context,
    admin,
    materialId,
    storageLocationId,
    movement: { materialId, storageLocationId, quantity: 2 },
  };
}

describe.each([
  { label: "consumptions", path: API_PATHS.consumptions, extraFields: {} },
  { label: "orders", path: API_PATHS.orders, extraFields: { requestedBy: [] } },
])("$label", ({ path, extraFields }) => {
  let scenario: Scenario;
  let admin: Agent;

  const create = async () => {
    const res = await admin.post(path).send(scenario.movement);
    expect(res.status).toBe(201);
    return res.body as Movement;
  };

  beforeEach(async () => {
    scenario = await createScenario();
    admin = scenario.admin;
  });

  it("creates a record with exactly the contract's fields", async () => {
    const res = await admin.post(path).send(scenario.movement);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ...scenario.movement,
      id: expect.stringMatching(GUID),
      number: 1,
      createdAt: expect.stringMatching(ISO_TEXT),
      updatedAt: expect.stringMatching(ISO_TEXT),
      createdBy: { id: expect.any(String), displayName: "Administrator" },
      ...extraFields,
    });
  });

  it("lists by ascending number and reads a single record", async () => {
    const first = await create();
    const second = await create();

    expect((await admin.get(path)).body).toEqual([first, second]);
    expect((await admin.get(`${path}/${second.id}`)).body).toEqual(second);
  });

  it("updates single fields", async () => {
    const record = await create();
    const other = await admin.post(API_PATHS.materials).send({ name: "Mutter" });

    const quantity = await admin.patch(`${path}/${record.id}`).send({ quantity: 0.5 });
    expect(quantity.status).toBe(200);
    expect(quantity.body).toMatchObject({ materialId: scenario.materialId, quantity: 0.5 });

    const material = await admin.patch(`${path}/${record.id}`).send({ materialId: other.body.id });
    expect(material.status).toBe(200);
    expect(material.body).toMatchObject({ materialId: other.body.id, quantity: 0.5 });
  });

  it("deletes a record", async () => {
    const record = await create();

    expect((await admin.delete(`${path}/${record.id}`)).status).toBe(204);
    expect((await admin.get(`${path}/${record.id}`)).status).toBe(404);
  });

  it("does not reuse the number of a deleted last record", async () => {
    await create();
    const second = await create();
    expect(second.number).toBe(2);

    await admin.delete(`${path}/${second.id}`);

    expect((await create()).number).toBe(3);
  });

  it("ignores id and number in the body", async () => {
    const created = await admin
      .post(path)
      .send({ ...scenario.movement, id: UNKNOWN_ID, number: 99 });
    expect(created.body.id).not.toBe(UNKNOWN_ID);
    expect(created.body.number).toBe(1);

    const patched = await admin
      .patch(`${path}/${created.body.id}`)
      .send({ quantity: 3, id: UNKNOWN_ID, number: 99 });
    expect(patched.body.id).toBe(created.body.id);
    expect(patched.body.number).toBe(1);
  });

  it.each([[0.5], [1.25], [0.001], [1000]])("accepts the quantity %d", async (quantity) => {
    const res = await admin.post(path).send({ ...scenario.movement, quantity });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(quantity);
  });

  it.each([[0], [-1], ["1"], [null], [true], [[1]], [{ $gt: 0 }]])(
    "rejects the quantity %j",
    async (quantity) => {
      const res = await admin.post(path).send({ ...scenario.movement, quantity });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Menge/);

      const record = await create();
      const patch = await admin.patch(`${path}/${record.id}`).send({ quantity });
      expect(patch.status).toBe(400);
    },
  );

  it("rejects a missing and an infinite quantity", async () => {
    const missing = await admin.post(path).send({ ...scenario.movement, quantity: undefined });
    expect(missing.status).toBe(400);

    // JSON.parse reads 1e999 as Infinity
    const infinite = await admin
      .post(path)
      .set("Content-Type", "application/json")
      .send(
        `{"materialId":"${scenario.materialId}","storageLocationId":"${scenario.storageLocationId}","quantity":1e999}`,
      );
    expect(infinite.status).toBe(400);
  });

  describe.each(["materialId", "storageLocationId"] as const)("reference %s", (field) => {
    it.each([
      ["unknown", UNKNOWN_ID, /unbekannt/],
      ["no GUID", "keine-guid", /GUID/],
      ["null", null, /GUID/],
      ["an object", { $ne: null }, /GUID/],
    ])("rejects a value that is %s", async (_label, value, message) => {
      const res = await admin.post(path).send({ ...scenario.movement, [field]: value });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);

      const record = await create();
      const patch = await admin.patch(`${path}/${record.id}`).send({ [field]: value });
      expect(patch.status).toBe(400);
      expect(patch.body.message).toMatch(message);
      expect((await admin.get(`${path}/${record.id}`)).body[field]).toBe(scenario[field]);
    });

    it("is required on create", async () => {
      const res = await admin.post(path).send({ ...scenario.movement, [field]: undefined });

      expect(res.status).toBe(400);
    });

    it("is stored in lower case when written in upper case", async () => {
      const res = await admin
        .post(path)
        .send({ ...scenario.movement, [field]: scenario[field].toUpperCase() });

      expect(res.status).toBe(201);
      expect(res.body[field]).toBe(scenario[field]);
    });
  });

  it("rejects a patch without a change", async () => {
    const record = await create();

    expect((await admin.patch(`${path}/${record.id}`).send({})).status).toBe(400);
    expect((await admin.patch(`${path}/${record.id}`).send({ number: 5 })).status).toBe(400);
  });

  it.each([
    ["GET", "get"],
    ["PATCH", "patch"],
    ["DELETE", "delete"],
  ] as const)("answers %s with 404 for an unknown and a non-GUID id", async (_label, method) => {
    for (const id of [UNKNOWN_ID, "keine-guid"]) {
      const res = await admin[method](`${path}/${id}`).send({ quantity: 1 });

      expect(res.status).toBe(404);
    }
  });

  it("prefers the 404 of the record over the 400 of a reference", async () => {
    const res = await admin.patch(`${path}/${UNKNOWN_ID}`).send({ materialId: UNKNOWN_ID });

    expect(res.status).toBe(404);
  });
});

describe("numbers", () => {
  it("are counted per entity", async () => {
    const { admin, movement } = await createScenario();

    const consumption = await admin.post(API_PATHS.consumptions).send(movement);
    const secondConsumption = await admin.post(API_PATHS.consumptions).send(movement);
    const order = await admin.post(API_PATHS.orders).send(movement);

    expect(consumption.body.number).toBe(1);
    expect(secondConsumption.body.number).toBe(2);
    expect(order.body.number).toBe(1);
  });
});

describe.each([
  { label: "material", path: API_PATHS.materials, idOf: (s: Scenario) => s.materialId },
  {
    label: "storage location",
    path: API_PATHS.storageLocations,
    idOf: (s: Scenario) => s.storageLocationId,
  },
])("deleting a used $label", ({ path, idOf }) => {
  describe.each([
    { via: "a consumption", movements: API_PATHS.consumptions },
    { via: "an order", movements: API_PATHS.orders },
  ])("via $via", ({ movements }) => {
    it("answers 409 until the movement is deleted", async () => {
      const scenario = await createScenario();
      const { admin, movement } = scenario;
      const id = idOf(scenario);
      const used = await admin.post(movements).send(movement);

      const blocked = await admin.delete(`${path}/${id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/verwendet/);
      expect((await admin.get(`${path}/${id}`)).status).toBe(200);

      await admin.delete(`${movements}/${used.body.id}`);

      expect((await admin.delete(`${path}/${id}`)).status).toBe(204);
    });

    it("is possible once the movement points elsewhere", async () => {
      const scenario = await createScenario();
      const { admin, movement } = scenario;
      const id = idOf(scenario);
      const used = await admin.post(movements).send(movement);
      const other = await admin.post(path).send({ name: "Anderes" });
      const field = path === API_PATHS.materials ? "materialId" : "storageLocationId";

      await admin.patch(`${movements}/${used.body.id}`).send({ [field]: other.body.id });

      expect((await admin.delete(`${path}/${id}`)).status).toBe(204);
    });
  });
});

// The stores are slowed down at the point between check and write. Without one lock shared by all
// routers, the delete and the write would overlap and leave a movement without its master record.
describe("master record deletion racing a movement", () => {
  const SLOW_MS = 40;

  // Adds a pause after the original method, in the gap before the dependent write
  function slowDown<Key extends string>(
    store: Record<Key, (...args: never[]) => Promise<unknown>>,
    method: Key,
  ): void {
    const original = store[method];
    store[method] = (async (...args: never[]) => {
      const result = await original(...args);
      await delay(SLOW_MS);
      return result;
    }) as (typeof store)[Key];
  }

  async function expectNoOrphan(
    scenario: Scenario,
    deleteStatus: number,
    createStatus: number,
    movements: string,
    masterPath: string,
    masterId: string,
  ): Promise<void> {
    const { admin } = scenario;
    const list = (await admin.get(movements)).body as Movement[];
    const masterExists = (await admin.get(`${masterPath}/${masterId}`)).status === 200;

    expect([
      [204, 400],
      [409, 201],
    ]).toContainEqual([deleteStatus, createStatus]);
    expect(masterExists).toBe(deleteStatus !== 204);
    expect(list).toHaveLength(createStatus === 201 ? 1 : 0);
  }

  describe.each([
    {
      label: "consumption and material",
      movements: API_PATHS.consumptions,
      storeName: "consumptions",
      masterPath: API_PATHS.materials,
      masterStore: "materials",
      idOf: (s: Scenario) => s.materialId,
    },
    {
      label: "consumption and storage location",
      movements: API_PATHS.consumptions,
      storeName: "consumptions",
      masterPath: API_PATHS.storageLocations,
      masterStore: "storageLocations",
      idOf: (s: Scenario) => s.storageLocationId,
    },
    {
      label: "order and material",
      movements: API_PATHS.orders,
      storeName: "orders",
      masterPath: API_PATHS.materials,
      masterStore: "materials",
      idOf: (s: Scenario) => s.materialId,
    },
    {
      label: "order and storage location",
      movements: API_PATHS.orders,
      storeName: "orders",
      masterPath: API_PATHS.storageLocations,
      masterStore: "storageLocations",
      idOf: (s: Scenario) => s.storageLocationId,
    },
  ] as const)("$label", ({ movements, storeName, masterPath, masterStore, idOf }) => {
    it("stays consistent when the usage check is slow", async () => {
      const scenario = await createScenario();
      const { admin, movement, context } = scenario;
      const id = idOf(scenario);
      slowDown(context.stores[storeName], "countByReference");

      const [deleted, created] = await Promise.all([
        admin.delete(`${masterPath}/${id}`),
        admin.post(movements).send(movement),
      ]);

      await expectNoOrphan(scenario, deleted.status, created.status, movements, masterPath, id);
    });

    it("stays consistent when the reference check is slow", async () => {
      const scenario = await createScenario();
      const { admin, movement, context } = scenario;
      const id = idOf(scenario);
      slowDown(context.stores[masterStore], "findById");

      const [created, deleted] = await Promise.all([
        admin.post(movements).send(movement),
        admin.delete(`${masterPath}/${id}`),
      ]);

      await expectNoOrphan(scenario, deleted.status, created.status, movements, masterPath, id);
    });
  });

  it("releases the lock after a rejected reference", async () => {
    const { admin, movement } = await createScenario();

    const rejected = await admin
      .post(API_PATHS.consumptions)
      .send({ ...movement, materialId: UNKNOWN_ID });
    expect(rejected.status).toBe(400);

    expect((await admin.post(API_PATHS.consumptions).send(movement)).status).toBe(201);
  });
});
