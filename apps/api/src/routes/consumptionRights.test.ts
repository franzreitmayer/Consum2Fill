import { API_PATHS, type Consumption } from "@c2r/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { FAKE_STATE, TEST_ISSUER, createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;

const path = API_PATHS.consumptions;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const OBJECT_ID = /^[0-9a-f]{24}$/;

interface Scenario {
  context: Context;
  admin: Agent;
  manager: Agent;
  user: Agent;
  other: Agent;
  body: { materialId: string; storageLocationId: string; quantity: number };
  idOf: (username: string) => Promise<string>;
}

async function createScenario(): Promise<Scenario> {
  const context = await createSeededContext();
  // A second USER, so that "foreign" also holds between two users of the same role
  const template = await context.stores.users.findByUsername("user");
  await context.stores.users.create({
    username: "other",
    displayName: "Andere Person",
    email: null,
    role: "USER",
    source: "local",
    passwordHash: template?.passwordHash ?? "",
  });
  const otherLogin = request.agent(context.app);
  await otherLogin.post(API_PATHS.login).send({ username: "other", password: "user" });

  const admin = await loginAs(context.app, "admin");
  const material = await admin.post(API_PATHS.materials).send({ name: "Schraube" });
  const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle 1" });
  return {
    context,
    admin,
    manager: await loginAs(context.app, "manager"),
    user: await loginAs(context.app, "user"),
    other: otherLogin,
    body: { materialId: material.body.id, storageLocationId: location.body.id, quantity: 2 },
    idOf: async (username) => {
      const stored = await context.stores.users.findByUsername(username);
      if (!stored) throw new Error(`Unknown user ${username}`);
      return stored.id;
    },
  };
}

async function createAs(agent: Agent, body: object): Promise<Consumption> {
  const res = await agent.post(path).send(body);
  expect(res.status).toBe(201);
  return res.body as Consumption;
}

// A record from before createdBy, as the store holds it: without the field
async function createLegacy({ context, body }: Scenario): Promise<Pick<Consumption, "id">> {
  return context.stores.consumptions.create(body as never);
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

describe("createdBy", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  it.each([
    ["admin", "Administrator"],
    ["manager", "Manager"],
    ["user", "Benutzer"],
  ] as const)("comes from the session of %s", async (name, displayName) => {
    const created = await createAs(scenario[name], scenario.body);

    expect(created.createdBy).toEqual({ id: await scenario.idOf(name), displayName });
    expect((await scenario.admin.get(`${path}/${created.id}`)).body.createdBy).toEqual(
      created.createdBy,
    );
  });

  it.each([
    ["another user", { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" }],
    ["null", null],
    ["text", "Fremd"],
    ["an object with unknown fields", { $set: { role: "ADMIN" } }],
  ])("ignores %s in the body of a POST", async (_label, createdBy) => {
    const created = await createAs(scenario.user, { ...scenario.body, createdBy });

    expect(created.createdBy).toEqual({
      id: await scenario.idOf("user"),
      displayName: "Benutzer",
    });
  });

  it("ignores the field in the body of a PATCH, for every role", async () => {
    const created = await createAs(scenario.user, scenario.body);
    const createdBy = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" };

    for (const agent of [scenario.user, scenario.manager, scenario.admin]) {
      const res = await agent.patch(`${path}/${created.id}`).send({ quantity: 3, createdBy });

      expect(res.status).toBe(200);
      expect(res.body.createdBy).toEqual(created.createdBy);
    }
  });

  it("is no change on its own: a PATCH with nothing else is rejected", async () => {
    const created = await createAs(scenario.user, scenario.body);

    const res = await scenario.user.patch(`${path}/${created.id}`).send({ createdBy: null });

    expect(res.status).toBe(400);
    expect((await scenario.user.get(`${path}/${created.id}`)).body.createdBy).toEqual(
      created.createdBy,
    );
  });

  it("does not follow a later rename, also not when the record is changed", async () => {
    const created = await createAs(scenario.user, scenario.body);
    await scenario.context.stores.users.update(await scenario.idOf("user"), {
      displayName: "Neuer Name",
    });

    const patched = await scenario.user.patch(`${path}/${created.id}`).send({ quantity: 3 });
    expect(patched.status).toBe(200);
    expect(patched.body.createdBy.displayName).toBe("Benutzer");

    const next = await createAs(scenario.user, scenario.body);
    expect(next.createdBy?.displayName).toBe("Neuer Name");
  });

  it("outlives the deleted user, and only ADMIN and MANAGER can change the record then", async () => {
    const created = await createAs(scenario.user, scenario.body);
    const createdBy = created.createdBy;
    await scenario.context.stores.users.delete(await scenario.idOf("user"));

    const read = await scenario.admin.get(`${path}/${created.id}`);
    expect(read.body.createdBy).toEqual(createdBy);

    expect((await scenario.other.patch(`${path}/${created.id}`).send({ quantity: 3 })).status).toBe(
      403,
    );
    const patched = await scenario.manager.patch(`${path}/${created.id}`).send({ quantity: 3 });
    expect(patched.status).toBe(200);
    expect(patched.body.createdBy).toEqual(createdBy);
  });

  it("is null in the answers for a record from before the field", async () => {
    const legacy = await createLegacy(scenario);

    expect((await scenario.user.get(`${path}/${legacy.id}`)).body.createdBy).toBeNull();
    const list = (await scenario.user.get(path)).body as Consumption[];
    expect(list.map((record) => record.createdBy)).toEqual([null]);
  });

  it("is set for a user signed in through IAM, whose id is compared like any other", async () => {
    const { context, admin, body } = scenario;
    const saved = await admin.put(API_PATHS.adminOidcSettings).send({
      enabled: true,
      displayName: "Keycloak",
      issuerUrl: TEST_ISSUER,
      clientId: "c2r",
      clientSecret: "streng-geheim",
    });
    expect(saved.status).toBe(200);
    const iam = request.agent(context.app);
    await iam.get(API_PATHS.oidcLogin);
    await iam.get(API_PATHS.oidcCallback).query({ code: "code", state: FAKE_STATE });
    const stored = await context.stores.users.findByUsername("erika");
    expect(stored?.role).toBe("USER");

    const own = await createAs(iam, body);
    const foreign = await createAs(scenario.user, body);

    expect(own.createdBy).toEqual({ id: stored?.id, displayName: "Erika Muster" });
    expect(own.createdBy?.id).toMatch(OBJECT_ID);
    expect((await iam.patch(`${path}/${own.id}`).send({ quantity: 3 })).status).toBe(200);
    expect((await iam.patch(`${path}/${foreign.id}`).send({ quantity: 3 })).status).toBe(403);
    expect((await iam.delete(`${path}/${foreign.id}`)).status).toBe(403);
    expect((await iam.delete(`${path}/${own.id}`)).status).toBe(204);
  });
});

describe("rights per consumption", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  const records = {
    own: (s: Scenario) => createAs(s.user, s.body),
    "another user's": (s: Scenario) => createAs(s.other, s.body),
    "a manager's": (s: Scenario) => createAs(s.manager, s.body),
    "an admin's": (s: Scenario) => createAs(s.admin, s.body),
    legacy: createLegacy,
  };
  type Kind = keyof typeof records;

  const cases: ["admin" | "manager" | "user", Kind, boolean][] = [
    ["admin", "own", true],
    ["admin", "another user's", true],
    ["admin", "a manager's", true],
    ["admin", "legacy", true],
    ["manager", "own", true],
    ["manager", "another user's", true],
    ["manager", "an admin's", true],
    ["manager", "legacy", true],
    ["user", "own", true],
    ["user", "another user's", false],
    ["user", "a manager's", false],
    ["user", "an admin's", false],
    ["user", "legacy", false],
  ];

  it.each(cases)("%s on %s record, PATCH allowed: %s", async (name, kind, allowed) => {
    const { context } = scenario;
    const record = await records[kind](scenario);
    const before = await context.stores.consumptions.findById(record.id);

    const res = await scenario[name].patch(`${path}/${record.id}`).send({ quantity: 7 });

    if (allowed) {
      expect(res.status).toBe(200);
      expect(res.body.quantity).toBe(7);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/eigene Verbräuche/);
      expect(await context.stores.consumptions.findById(record.id)).toEqual(before);
    }
  });

  it.each(cases)("%s on %s record, DELETE allowed: %s", async (name, kind, allowed) => {
    const { context } = scenario;
    const record = await records[kind](scenario);
    const before = await context.stores.consumptions.findById(record.id);

    const res = await scenario[name].delete(`${path}/${record.id}`);

    if (allowed) {
      expect(res.status).toBe(204);
      expect(await context.stores.consumptions.findById(record.id)).toBeNull();
    } else {
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/eigene Verbräuche/);
      expect(await context.stores.consumptions.findById(record.id)).toEqual(before);
    }
  });

  it("calls no writing store method on a 403", async () => {
    const { context, user, other, body } = scenario;
    const { consumptions } = context.stores;
    const foreign = await createAs(other, body);
    const writes: string[] = [];
    consumptions.update = () => {
      writes.push("update");
      return Promise.resolve(null);
    };
    consumptions.delete = () => {
      writes.push("delete");
      return Promise.resolve(false);
    };

    expect((await user.patch(`${path}/${foreign.id}`).send({ quantity: 7 })).status).toBe(403);
    expect((await user.delete(`${path}/${foreign.id}`)).status).toBe(403);

    expect(writes).toEqual([]);
  });

  it("lets USER read all records, also foreign ones and those without a creator", async () => {
    const { user, body } = scenario;
    const foreign = await createAs(scenario.other, body);
    const legacy = await createLegacy(scenario);
    const own = await createAs(user, body);

    const list = await user.get(path);
    expect(list.status).toBe(200);
    expect((list.body as Consumption[]).map((record) => record.id)).toEqual([
      foreign.id,
      legacy.id,
      own.id,
    ]);
    expect((await user.get(`${path}/${foreign.id}`)).body).toEqual(foreign);
    expect((await user.get(`${path}/${legacy.id}`)).status).toBe(200);
  });

  describe("order of the answers for USER", () => {
    it("answers 404 for a non-GUID id before looking at the body", async () => {
      const res = await scenario.user
        .patch(`${path}/keine-guid`)
        .send({ quantity: -1, materialId: UNKNOWN_ID });

      expect(res.status).toBe(404);
      expect((await scenario.user.delete(`${path}/keine-guid`)).status).toBe(404);
    });

    it("answers 400 for a bad body, on an unknown and on a foreign record", async () => {
      const foreign = await createAs(scenario.other, scenario.body);

      for (const id of [UNKNOWN_ID, foreign.id]) {
        const res = await scenario.user.patch(`${path}/${id}`).send({ quantity: -1 });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Menge/);
      }
    });

    it("answers 404 for an unknown id before the right and the reference", async () => {
      const patch = await scenario.user
        .patch(`${path}/${UNKNOWN_ID}`)
        .send({ materialId: UNKNOWN_ID });

      expect(patch.status).toBe(404);
      expect((await scenario.user.delete(`${path}/${UNKNOWN_ID}`)).status).toBe(404);
    });

    it("answers 403 for a foreign record before the reference is checked", async () => {
      const foreign = await createAs(scenario.other, scenario.body);

      const res = await scenario.user
        .patch(`${path}/${foreign.id}`)
        .send({ materialId: UNKNOWN_ID });

      expect(res.status).toBe(403);
    });

    it("answers 400 for an unknown reference on the own record", async () => {
      const own = await createAs(scenario.user, scenario.body);

      const res = await scenario.user.patch(`${path}/${own.id}`).send({ materialId: UNKNOWN_ID });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unbekannt/);
    });
  });

  it("answers 401 without a session before anything else", async () => {
    const { context, body } = scenario;
    const foreign = await createAs(scenario.other, body);
    const anonymous = request(context.app);

    expect((await anonymous.patch(`${path}/${foreign.id}`).send({ quantity: 1 })).status).toBe(401);
    expect((await anonymous.delete(`${path}/${foreign.id}`)).status).toBe(401);
  });

  describe("with a request queued for the lock", () => {
    // Takes the lock with a POST whose reference check hangs, and returns what ends the hold
    async function occupyLock(): Promise<{ finish: () => Promise<void> }> {
      const { entered, open } = holdLockOnMaterialRead(scenario);
      const holder = scenario.admin
        .post(path)
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

    it.each(["patch", "delete"] as const)(
      "reads the role again: a role taken away while waiting counts on %s",
      async (method) => {
        const { context, manager, body, other } = scenario;
        const foreign = await createAs(other, body);
        const lock = await occupyLock();
        const guardRead = nextUserRead(scenario);

        const queued = manager[method](`${path}/${foreign.id}`)
          .send(method === "patch" ? { quantity: 7 } : undefined)
          .then((res) => res);
        await guardRead;
        await context.stores.users.update(await scenario.idOf("manager"), { role: "USER" });
        await lock.finish();

        expect((await queued).status).toBe(403);
        expect((await context.stores.consumptions.findById(foreign.id))?.quantity).toBe(2);
      },
    );

    it("answers 401 for a user deleted while waiting", async () => {
      const { context, body, other } = scenario;
      const own = await createAs(other, body);
      const lock = await occupyLock();
      const guardRead = nextUserRead(scenario);

      const queued = other
        .patch(`${path}/${own.id}`)
        .send({ quantity: 7 })
        .then((res) => res);
      await guardRead;
      await context.stores.users.delete(await scenario.idOf("other"));
      await lock.finish();

      expect((await queued).status).toBe(401);
      expect((await context.stores.consumptions.findById(own.id))?.quantity).toBe(2);
    });

    it("reads the record again: one deleted while waiting answers 404", async () => {
      const { context, user, body } = scenario;
      const own = await createAs(user, body);
      const lock = await occupyLock();
      const guardRead = nextUserRead(scenario);

      const queued = user
        .patch(`${path}/${own.id}`)
        .send({ quantity: 7 })
        .then((res) => res);
      await guardRead;
      await context.stores.consumptions.delete(own.id);
      await lock.finish();

      expect((await queued).status).toBe(404);
    });
  });
});

describe("orders stay as they are", () => {
  let scenario: Scenario;

  beforeEach(async () => {
    scenario = await createScenario();
  });

  it("have no createdBy in any answer, also when one is sent", async () => {
    const { admin, manager, body } = scenario;
    const createdBy = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Fremd" };

    const created = await admin.post(API_PATHS.orders).send({ ...body, createdBy });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty("createdBy");

    const item = `${API_PATHS.orders}/${created.body.id}`;
    const patched = await manager.patch(item).send({ quantity: 3, createdBy });
    expect(patched.status).toBe(200);
    expect(patched.body).not.toHaveProperty("createdBy");
    expect((await admin.get(item)).body).not.toHaveProperty("createdBy");
    expect(((await admin.get(API_PATHS.orders)).body as object[])[0]).not.toHaveProperty(
      "createdBy",
    );
  });

  it("can still be changed by ADMIN and MANAGER across authors, but not by USER", async () => {
    const { admin, manager, user, body } = scenario;
    const created = await admin.post(API_PATHS.orders).send(body);
    const item = `${API_PATHS.orders}/${created.body.id}`;

    expect((await user.post(API_PATHS.orders).send(body)).status).toBe(403);
    expect((await user.patch(item).send({ quantity: 3 })).status).toBe(403);
    expect((await user.delete(item)).status).toBe(403);
    expect((await user.get(item)).status).toBe(200);
    expect((await manager.patch(item).send({ quantity: 3 })).status).toBe(200);
    expect((await manager.delete(item)).status).toBe(204);
  });

  it("answer USER with the role barrier before the id and the body are looked at", async () => {
    const { user } = scenario;

    expect((await user.patch(`${API_PATHS.orders}/keine-guid`).send({})).status).toBe(403);
    expect((await user.delete(`${API_PATHS.orders}/${UNKNOWN_ID}`)).status).toBe(403);
  });
});
