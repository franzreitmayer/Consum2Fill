import { randomUUID } from "node:crypto";
import {
  API_PATHS,
  MAX_CONSUMPTIONS_PER_ORDER,
  orderDeliveredPath,
  type Consumption,
  type Order,
} from "@c2r/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;
type Method = "get" | "post" | "patch" | "delete" | "head";

const path = API_PATHS.orders;
const fromPath = API_PATHS.ordersFromConsumptions;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

interface Movement {
  materialId: string;
  storageLocationId: string;
  quantity: number;
}

interface Scenario {
  context: Context;
  admin: Agent;
  manager: Agent;
  user: Agent;
  other: Agent;
  body: Movement;
  otherMaterialId: string;
  otherLocationId: string;
  idOf: (username: string) => Promise<string>;
}

async function createScenario(): Promise<Scenario> {
  const context = await createSeededContext();
  const template = await context.stores.users.findByUsername("user");
  await context.stores.users.create({
    username: "other",
    displayName: "Andere Person",
    email: null,
    role: "USER",
    source: "local",
    passwordHash: template?.passwordHash ?? "",
  });
  const other = request.agent(context.app);
  await other.post(API_PATHS.login).send({ username: "other", password: "user" });

  const admin = await loginAs(context.app, "admin");
  const material = await admin.post(API_PATHS.materials).send({ name: "Schraube" });
  const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle 1" });
  const otherMaterial = await admin.post(API_PATHS.materials).send({ name: "Mutter" });
  const otherLocation = await admin.post(API_PATHS.storageLocations).send({ name: "Halle 2" });
  return {
    context,
    admin,
    manager: await loginAs(context.app, "manager"),
    user: await loginAs(context.app, "user"),
    other,
    body: { materialId: material.body.id, storageLocationId: location.body.id, quantity: 2 },
    otherMaterialId: otherMaterial.body.id,
    otherLocationId: otherLocation.body.id,
    idOf: async (username) => {
      const stored = await context.stores.users.findByUsername(username);
      if (!stored) throw new Error(`Unknown user ${username}`);
      return stored.id;
    },
  };
}

async function consume(agent: Agent, body: object): Promise<Consumption> {
  const res = await agent.post(API_PATHS.consumptions).send(body);
  expect(res.status).toBe(201);
  return res.body as Consumption;
}

// A consumption from before createdBy, as the store holds it: without the field
async function consumeLegacy({ context, body }: Scenario): Promise<Consumption> {
  const record = await context.stores.consumptions.create(body as never);
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function orderAs(agent: Agent, body: object): Promise<Order> {
  const res = await agent.post(path).send(body);
  expect(res.status).toBe(201);
  return res.body as Order;
}

function refsOf(...records: Consumption[]) {
  return records.map(({ id, updatedAt }) => ({ id, updatedAt }));
}

// Everything the domain stores hold, to show that a rejected request changed nothing
async function snapshot({ context }: Scenario) {
  return {
    consumptions: await context.stores.consumptions.list(),
    orders: await context.stores.orders.list(),
  };
}

// A hold on the domain lock: the first read of a material waits until the gate opens
function holdLockOnMaterialRead({ context }: Scenario) {
  const { materials } = context.stores;
  const { findById } = materials;
  let reached = () => undefined as void;
  let open = () => undefined as void;
  const entered = new Promise<void>((resolve) => (reached = resolve));
  const opened = new Promise<void>((resolve) => (open = resolve));
  materials.findById = async (id) => {
    materials.findById = findById;
    reached();
    await opened;
    return findById(id);
  };
  return { entered, open };
}

// Resolves once the session guard of the next request has read the user
function nextUserRead({ context }: Scenario): Promise<void> {
  const { users } = context.stores;
  const { findById } = users;
  return new Promise((resolve) => {
    users.findById = async (id) => {
      users.findById = findById;
      const user = await findById(id);
      resolve();
      return user;
    };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("access to orders", () => {
  let scenario: Scenario;
  let order: Order;
  let consumption: Consumption;

  beforeEach(async () => {
    scenario = await createScenario();
    order = await orderAs(scenario.admin, scenario.body);
    consumption = await consume(scenario.user, scenario.body);
  });

  const requests = (): [Method, string, object | undefined][] => [
    ["get", path, undefined],
    ["head", path, undefined],
    ["get", `${path}/${order.id}`, undefined],
    ["get", `${path}/${UNKNOWN_ID}`, undefined],
    ["get", `${path}/keine-guid`, undefined],
    ["post", path, scenario.body],
    ["post", path, {}],
    ["patch", `${path}/${order.id}`, { quantity: 3 }],
    ["patch", `${path}/keine-guid`, {}],
    ["delete", `${path}/${order.id}`, undefined],
    ["delete", `${path}/${UNKNOWN_ID}`, undefined],
    ["post", fromPath, { consumptions: refsOf(consumption), quantity: 1 }],
    ["post", fromPath, { consumptions: [], quantity: -1 }],
    ["post", fromPath, undefined],
    ["post", orderDeliveredPath(order.id), undefined],
    ["post", orderDeliveredPath(UNKNOWN_ID), undefined],
    ["post", orderDeliveredPath("keine-guid"), undefined],
  ];

  it("answers 401 without a session on every endpoint, and nothing changes", async () => {
    const before = await snapshot(scenario);
    const anonymous = request(scenario.context.app);

    for (const [method, url, body] of requests()) {
      const res = await anonymous[method](url).send(body);
      expect([method, url, res.status]).toEqual([method, url, 401]);
    }
    expect(await snapshot(scenario)).toEqual(before);
  });

  it("answers USER 403 on every endpoint, also on reading, and nothing changes", async () => {
    const before = await snapshot(scenario);

    for (const [method, url, body] of requests()) {
      const res = await scenario.user[method](url).send(body);
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
    expect(await snapshot(scenario)).toEqual(before);
  });

  it.each([
    ["no session", undefined, 401],
    ["USER", "user", 403],
  ] as const)(
    "answers %s before a body that cannot be parsed is looked at",
    async (_label, name, status) => {
      const agent = name ? scenario[name] : request(scenario.context.app);

      for (const url of [fromPath, orderDeliveredPath(order.id)]) {
        const res = await agent.post(url).set("Content-Type", "application/json").send("{broken");
        expect(res.status).toBe(status);
      }
    },
  );

  it("lets ADMIN and MANAGER use every endpoint", async () => {
    for (const agent of [scenario.admin, scenario.manager]) {
      const created = await orderAs(agent, scenario.body);
      expect((await agent.get(path)).status).toBe(200);
      expect((await agent.get(`${path}/${created.id}`)).status).toBe(200);
      expect((await agent.patch(`${path}/${created.id}`).send({ quantity: 3 })).status).toBe(200);
      expect((await agent.post(orderDeliveredPath(created.id))).status).toBe(204);
      const source = await consume(scenario.user, scenario.body);
      const fromSource = await agent
        .post(fromPath)
        .send({ consumptions: refsOf(source), quantity: 1 });
      expect(fromSource.status).toBe(201);
      expect((await agent.delete(`${path}/${fromSource.body.id}`)).status).toBe(204);
    }
  });

  it("applies a role change at once, also to reading", async () => {
    await scenario.context.stores.users.update(await scenario.idOf("manager"), { role: "USER" });

    expect((await scenario.manager.get(path)).status).toBe(403);
    expect((await scenario.manager.post(orderDeliveredPath(order.id))).status).toBe(403);
  });
});

describe("createdBy and requestedBy of orders", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  it.each([
    ["admin", "Administrator"],
    ["manager", "Manager"],
  ] as const)("come from the session of %s, with an empty list", async (name, displayName) => {
    const created = await orderAs(scenario[name], scenario.body);

    expect(created.createdBy).toEqual({ id: await scenario.idOf(name), displayName });
    expect(created.requestedBy).toEqual([]);
    expect((await scenario.admin.get(`${path}/${created.id}`)).body).toEqual(created);
  });

  it.each([
    ["another user", { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" }],
    ["null", null],
    ["an object with unknown fields", { $set: { role: "ADMIN" } }],
  ])("ignore %s in the body of a POST", async (_label, value) => {
    const created = await orderAs(scenario.manager, {
      ...scenario.body,
      createdBy: value,
      requestedBy: [{ number: 1, createdBy: value }],
    });

    expect(created.createdBy).toEqual({
      id: await scenario.idOf("manager"),
      displayName: "Manager",
    });
    expect(created.requestedBy).toEqual([]);
  });

  it("are ignored in the body of a POST from consumptions", async () => {
    const source = await consume(scenario.user, scenario.body);
    const createdBy = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" };

    const res = await scenario.manager.post(fromPath).send({
      consumptions: refsOf(source),
      quantity: 1,
      createdBy,
      requestedBy: [{ number: 99, createdBy }],
    });

    expect(res.status).toBe(201);
    expect(res.body.createdBy).toEqual({
      id: await scenario.idOf("manager"),
      displayName: "Manager",
    });
    expect(res.body.requestedBy).toEqual([{ number: source.number, createdBy: source.createdBy }]);
  });

  it("stay unchanged by a PATCH, which ignores them in the body", async () => {
    const source = await consume(scenario.user, scenario.body);
    const created = await scenario.manager
      .post(fromPath)
      .send({ consumptions: refsOf(source), quantity: 1 });
    const item = `${path}/${created.body.id}`;
    const foreign = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" };

    const patched = await scenario.admin
      .patch(item)
      .send({ quantity: 3, createdBy: foreign, requestedBy: [] });

    expect(patched.status).toBe(200);
    expect(patched.body.quantity).toBe(3);
    expect(patched.body.createdBy).toEqual(created.body.createdBy);
    expect(patched.body.requestedBy).toEqual(created.body.requestedBy);
    expect(
      (await scenario.admin.patch(item).send({ createdBy: foreign, requestedBy: [] })).status,
    ).toBe(400);
  });

  it("do not follow a later rename of the user", async () => {
    const created = await orderAs(scenario.manager, scenario.body);
    await scenario.context.stores.users.update(await scenario.idOf("manager"), {
      displayName: "Neuer Name",
    });

    const patched = await scenario.manager.patch(`${path}/${created.id}`).send({ quantity: 3 });

    expect(patched.body.createdBy.displayName).toBe("Manager");
  });

  it("are null and an empty list for an order from before the fields", async () => {
    const legacy = await scenario.context.stores.orders.create(scenario.body as never);

    const item = await scenario.admin.get(`${path}/${legacy.id}`);
    expect(item.status).toBe(200);
    expect(item.body).toMatchObject({ createdBy: null, requestedBy: [] });
    const list = (await scenario.manager.get(path)).body as Order[];
    expect(list.map(({ createdBy, requestedBy }) => ({ createdBy, requestedBy }))).toEqual([
      { createdBy: null, requestedBy: [] },
    ]);
    const patched = await scenario.manager.patch(`${path}/${legacy.id}`).send({ quantity: 5 });
    expect(patched.body).toMatchObject({ quantity: 5, createdBy: null, requestedBy: [] });
  });
});

describe("POST /api/orders/from-consumptions", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  it("creates one order from several consumptions and deletes them", async () => {
    const { manager, user, other, body, context } = scenario;
    const first = await consume(user, { ...body, quantity: 1.1 });
    const second = await consume(other, { ...body, quantity: 2.2 });
    const legacy = await consumeLegacy(scenario);
    const untouched = await consume(user, { ...body, materialId: scenario.otherMaterialId });

    const res = await manager
      .post(fromPath)
      .send({ consumptions: refsOf(legacy, first, second), quantity: 3.3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      number: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      storageLocationId: body.storageLocationId,
      materialId: body.materialId,
      quantity: 3.3,
      createdBy: { id: await scenario.idOf("manager"), displayName: "Manager" },
      requestedBy: [
        { number: first.number, createdBy: first.createdBy },
        { number: second.number, createdBy: second.createdBy },
        { number: legacy.number, createdBy: null },
      ],
    });
    expect(first.createdBy?.displayName).toBe("Benutzer");
    expect(second.createdBy?.displayName).toBe("Andere Person");
    expect((await manager.get(`${path}/${res.body.id}`)).body).toEqual(res.body);
    expect((await context.stores.consumptions.list()).map(({ id }) => id)).toEqual([untouched.id]);
  });

  it("accepts ids in upper case", async () => {
    const source = await consume(scenario.user, scenario.body);

    const res = await scenario.admin.post(fromPath).send({
      consumptions: [{ id: source.id.toUpperCase(), updatedAt: source.updatedAt }],
      quantity: 2,
    });

    expect(res.status).toBe(201);
    expect(await scenario.context.stores.consumptions.findById(source.id)).toBeNull();
  });

  it("accepts the largest allowed number of consumptions", async () => {
    const sources: Consumption[] = [];
    for (let i = 0; i < MAX_CONSUMPTIONS_PER_ORDER; i += 1) {
      sources.push(await consume(scenario.user, scenario.body));
    }

    const res = await scenario.admin
      .post(fromPath)
      .send({ consumptions: refsOf(...sources), quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.requestedBy).toHaveLength(MAX_CONSUMPTIONS_PER_ORDER);
    expect(await scenario.context.stores.consumptions.list()).toEqual([]);
  });

  describe("rejects with 400 and changes nothing", () => {
    let source: Consumption;
    let ref: { id: string; updatedAt: string };

    beforeEach(async () => {
      source = await consume(scenario.user, scenario.body);
      ref = refsOf(source)[0] ?? { id: "", updatedAt: "" };
    });

    async function expectRejected(body: unknown, message: RegExp): Promise<void> {
      const before = await snapshot(scenario);

      const res = await scenario.admin.post(fromPath).send(body as object);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
      expect(await snapshot(scenario)).toEqual(before);
    }

    it.each([
      ["a list", [], /JSON-Objekt/],
      ["no list of consumptions", { quantity: 1 }, /Liste/],
      ["an object as list", { consumptions: { 0: {} }, quantity: 1 }, /Liste/],
      ["an empty list", { consumptions: [], quantity: 1 }, /mindestens ein Verbrauch/],
    ])("for %s", async (_label, body, message) => {
      await expectRejected(body, message);
    });

    it("for more consumptions than allowed", async () => {
      const consumptions: { id: string; updatedAt: string }[] = Array.from(
        { length: MAX_CONSUMPTIONS_PER_ORDER + 1 },
        () => ({
          id: randomUUID(),
          updatedAt: ref.updatedAt,
        }),
      );
      consumptions[0] = ref;

      await expectRejected({ consumptions, quantity: 1 }, /höchstens 100/);
    });

    it.each([
      ["the same spelling", (id: string) => id],
      ["another case", (id: string) => id.toUpperCase()],
    ])("for a consumption given twice, in %s", async (_label, spell) => {
      await expectRejected(
        { consumptions: [ref, { ...ref, id: spell(ref.id) }], quantity: 1 },
        /nur einmal/,
      );
    });

    it.each([
      ["no GUID", "keine-guid"],
      ["null", null],
      ["an object", { $ne: null }],
      ["missing", undefined],
    ])("for an id that is %s", async (_label, id) => {
      await expectRejected({ consumptions: [ref, { ...ref, id }], quantity: 1 }, /GUID/);
    });

    it.each([
      ["missing", undefined],
      ["a number", 1],
      ["null", null],
      ["an object", { $gt: "" }],
    ])("for an updatedAt that is %s", async (_label, updatedAt) => {
      await expectRejected({ consumptions: [{ ...ref, updatedAt }], quantity: 1 }, /updatedAt/);
    });

    it.each([["text"], [null], [[1]]])("for the entry %j", async (entry) => {
      await expectRejected({ consumptions: [entry], quantity: 1 }, /JSON-Objekt|GUID/);
    });

    it.each([[0], [-1], ["1"], [null], [true], [undefined], [{ $gt: 0 }]])(
      "for the quantity %j",
      async (quantity) => {
        await expectRejected({ consumptions: [ref], quantity }, /Menge/);
      },
    );

    it("for an infinite quantity", async () => {
      const before = await snapshot(scenario);

      const res = await scenario.admin
        .post(fromPath)
        .set("Content-Type", "application/json")
        .send(`{"consumptions":[${JSON.stringify(ref)}],"quantity":1e999}`);

      expect(res.status).toBe(400);
      expect(await snapshot(scenario)).toEqual(before);
    });

    it.each([
      ["material", (s: Scenario) => ({ ...s.body, materialId: s.otherMaterialId })],
      ["storage location", (s: Scenario) => ({ ...s.body, storageLocationId: s.otherLocationId })],
    ])("for consumptions of another %s", async (_label, bodyOf) => {
      const mixed = await consume(scenario.other, bodyOf(scenario));

      await expectRejected(
        { consumptions: refsOf(source, mixed), quantity: 1 },
        /dasselbe Material und denselben Lagerort/,
      );
    });
  });

  it("answers 404 for a consumption deleted in the meantime and changes nothing", async () => {
    const kept = await consume(scenario.user, scenario.body);
    const gone = await consume(scenario.user, scenario.body);
    await scenario.user.delete(`${API_PATHS.consumptions}/${gone.id}`);
    const before = await snapshot(scenario);

    for (const consumptions of [
      refsOf(kept, gone),
      [...refsOf(kept), { id: UNKNOWN_ID, updatedAt: kept.updatedAt }],
    ]) {
      const res = await scenario.admin.post(fromPath).send({ consumptions, quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/nicht gefunden/);
    }
    expect(await snapshot(scenario)).toEqual(before);
  });

  it("answers 409 for a consumption changed in the meantime and changes nothing", async () => {
    const kept = await consume(scenario.user, scenario.body);
    const changed = await consume(scenario.user, scenario.body);
    const read = refsOf(kept, changed);
    // The stored date must move, also on a fast machine
    await new Promise((resolve) => setTimeout(resolve, 5));
    const patched = await scenario.user
      .patch(`${API_PATHS.consumptions}/${changed.id}`)
      .send({ quantity: 9 });
    expect(patched.body.updatedAt).not.toBe(changed.updatedAt);
    const before = await snapshot(scenario);

    const res = await scenario.admin.post(fromPath).send({ consumptions: read, quantity: 1 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/geändert/);
    expect(await snapshot(scenario)).toEqual(before);
  });

  it("answers 409 for an updatedAt in another spelling", async () => {
    const source = await consume(scenario.user, scenario.body);
    const otherSpelling = source.updatedAt.replace(/\.\d{3}Z$/, "Z");
    const before = await snapshot(scenario);

    const res = await scenario.admin
      .post(fromPath)
      .send({ consumptions: [{ id: source.id, updatedAt: otherSpelling }], quantity: 1 });

    expect(res.status).toBe(409);
    expect(await snapshot(scenario)).toEqual(before);
  });

  it("prefers 404 over 409 and 409 over a mixed material", async () => {
    const source = await consume(scenario.user, scenario.body);
    const mixed = await consume(scenario.user, {
      ...scenario.body,
      materialId: scenario.otherMaterialId,
    });
    const stale = { id: mixed.id, updatedAt: new Date(0).toISOString() };

    const missing = await scenario.admin.post(fromPath).send({
      consumptions: [...refsOf(source), stale, { id: UNKNOWN_ID, updatedAt: source.updatedAt }],
      quantity: 1,
    });
    const changed = await scenario.admin
      .post(fromPath)
      .send({ consumptions: [...refsOf(source), stale], quantity: 1 });

    expect(missing.status).toBe(404);
    expect(changed.status).toBe(409);
  });

  describe("with a request queued for the lock", () => {
    async function occupyLock(): Promise<{ finish: () => Promise<void> }> {
      const { entered, open } = holdLockOnMaterialRead(scenario);
      const holder = scenario.admin
        .post(API_PATHS.consumptions)
        .send(scenario.body)
        .then((res) => res);
      await entered;
      return {
        finish: async () => {
          open();
          expect((await holder).status).toBe(201);
        },
      };
    }

    it.each([
      ["a role taken away", "role", 403],
      ["a user deleted", "delete", 401],
    ] as const)("counts %s while waiting", async (_label, change, status) => {
      const { context, manager } = scenario;
      const source = await consume(scenario.user, scenario.body);
      const lock = await occupyLock();
      const guardRead = nextUserRead(scenario);

      const queued = manager
        .post(fromPath)
        .send({ consumptions: refsOf(source), quantity: 1 })
        .then((res) => res);
      await guardRead;
      const managerId = await scenario.idOf("manager");
      if (change === "role") await context.stores.users.update(managerId, { role: "USER" });
      else await context.stores.users.delete(managerId);
      await lock.finish();

      expect((await queued).status).toBe(status);
      expect(await context.stores.consumptions.findById(source.id)).not.toBeNull();
      expect(await context.stores.orders.list()).toEqual([]);
    });
  });

  describe("when deleting a consumption fails", () => {
    function failDeleteAt(call: number) {
      const { consumptions } = scenario.context.stores;
      const original = consumptions.delete;
      let calls = 0;
      const failure = new Error("Speicher nicht erreichbar");
      consumptions.delete = async (id) => {
        calls += 1;
        if (calls === call) throw failure;
        return original(id);
      };
      return { restoreDelete: () => (consumptions.delete = original) };
    }

    it.each([1, 2, 3])(
      "puts all consumptions back unchanged and removes the order, failing at delete %i",
      async (call) => {
        const { context, admin, user, other } = scenario;
        const sources = [
          await consume(user, scenario.body),
          await consume(other, scenario.body),
          await consumeLegacy(scenario),
        ];
        const before = await context.stores.consumptions.list();
        const { restoreDelete } = failDeleteAt(call);
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

        const res = await admin
          .post(fromPath)
          .send({ consumptions: refsOf(...sources), quantity: 1 });

        expect(res.status).toBe(500);
        expect(errors).toHaveBeenCalled();
        restoreDelete();
        expect(await context.stores.consumptions.list()).toEqual(before);
        expect(await context.stores.orders.list()).toEqual([]);
        // The restored records answer exactly as before, with their creator and dates
        const list = (await admin.get(API_PATHS.consumptions)).body as Consumption[];
        expect(list).toEqual(sources);
        // Numbers are not reused, and the next attempt succeeds
        expect((await consume(user, scenario.body)).number).toBe(4);
        const retry = await admin
          .post(fromPath)
          .send({ consumptions: refsOf(...sources), quantity: 1 });
        expect(retry.status).toBe(201);
      },
    );
  });
});

describe("POST /api/orders/{id}/delivered", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  it.each(["admin", "manager"] as const)("removes the order as %s with 204", async (name) => {
    const kept = await orderAs(scenario.admin, scenario.body);
    const delivered = await orderAs(scenario.admin, scenario.body);
    const consumption = await consume(scenario.user, scenario.body);

    const res = await scenario[name].post(orderDeliveredPath(delivered.id));

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect((await scenario.admin.get(`${path}/${delivered.id}`)).status).toBe(404);
    expect(((await scenario.admin.get(path)).body as Order[]).map(({ id }) => id)).toEqual([
      kept.id,
    ]);
    expect(await scenario.context.stores.consumptions.findById(consumption.id)).not.toBeNull();
  });

  it("accepts an id in upper case", async () => {
    const order = await orderAs(scenario.admin, scenario.body);

    expect((await scenario.admin.post(orderDeliveredPath(order.id.toUpperCase()))).status).toBe(
      204,
    );
  });

  it.each([
    ["unknown", UNKNOWN_ID],
    ["no GUID", "keine-guid"],
    ["undecodable", "%E0%A4%A"],
  ])("answers 404 for an id that is %s", async (_label, id) => {
    await orderAs(scenario.admin, scenario.body);

    const res = await scenario.admin.post(`${path}/${id}/delivered`);

    expect(res.status).toBe(404);
    expect(await scenario.context.stores.orders.list()).toHaveLength(1);
  });

  it("answers 404 for an order delivered before", async () => {
    const order = await orderAs(scenario.admin, scenario.body);
    await scenario.admin.post(orderDeliveredPath(order.id));

    const res = await scenario.manager.post(orderDeliveredPath(order.id));

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Bestellung/);
  });

  it("answers USER 403 and keeps the order", async () => {
    const order = await orderAs(scenario.admin, scenario.body);

    expect((await scenario.user.post(orderDeliveredPath(order.id))).status).toBe(403);
    expect(await scenario.context.stores.orders.findById(order.id)).not.toBeNull();
  });
});
