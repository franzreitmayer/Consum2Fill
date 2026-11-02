import { setTimeout as delay } from "node:timers/promises";
import { API_PATHS, MAX_DESCRIPTION_LENGTH, MAX_TAG_LENGTH, MAX_TAGS } from "@c2r/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { MaterialFields } from "../stores/types.js";
import { createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;

const path = API_PATHS.materials;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const numberedTags = (count: number) => Array.from({ length: count }, (_, index) => `t${index}`);

let context: Context;
let admin: Agent;

beforeEach(async () => {
  context = await createSeededContext();
  admin = await loginAs(context.app, "admin");
});

async function createMaterial(body: object = {}): Promise<{ id: string; [key: string]: unknown }> {
  const res = await admin.post(path).send({ name: "Schraube", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

// The same rules hold for both ways in.
function sendBoth(body: object) {
  return {
    create: () => admin.post(path).send({ name: "Neu", ...body }),
    patch: async () => {
      const { id } = await createMaterial();
      return admin.patch(`${path}/${id}`).send(body);
    },
  };
}

describe("material description", () => {
  it("defaults to an empty text", async () => {
    expect((await createMaterial()).description).toBe("");
  });

  it("is trimmed and keeps line breaks inside", async () => {
    const material = await createMaterial({ description: "  a\nb\r\n\nc \n" });

    expect(material.description).toBe("a\nb\r\n\nc");
  });

  it("may be blank", async () => {
    expect((await createMaterial({ description: "   " })).description).toBe("");
  });

  it("accepts the maximum length, measured after trimming", async () => {
    const description = "x".repeat(MAX_DESCRIPTION_LENGTH);
    const { create, patch } = sendBoth({ description: `  ${description}  ` });

    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.description).toBe(description);
    expect((await patch()).status).toBe(200);
  });

  it.each([
    ["too long", "x".repeat(MAX_DESCRIPTION_LENGTH + 1), /höchstens 2000/],
    ["null", null, /Beschreibung/],
    ["a number", 1, /Beschreibung/],
    ["a list", ["a"], /Beschreibung/],
    ["with NUL", "a\u0000b", /Beschreibung/],
    ["with a lone surrogate", "a\ud800b", /Beschreibung/],
  ])("rejects a value that is %s", async (_label, description, message) => {
    const { create, patch } = sendBoth({ description });

    for (const res of [await create(), await patch()]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
    }
  });

  it("accepts a complete surrogate pair", async () => {
    expect((await createMaterial({ description: "a😀" })).description).toBe("a😀");
  });

  it("changes alone and clears with an empty text", async () => {
    const { id } = await createMaterial({ description: "alt", tags: ["a"], unit: "Liter" });

    const changed = await admin.patch(`${path}/${id}`).send({ description: "neu" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ description: "neu", tags: ["a"], unit: "Liter" });

    const cleared = await admin.patch(`${path}/${id}`).send({ description: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.description).toBe("");
  });
});

describe("material tags", () => {
  it("default to an empty list", async () => {
    expect((await createMaterial()).tags).toEqual([]);
  });

  it("are trimmed", async () => {
    expect((await createMaterial({ tags: ["  a ", "b c"] })).tags).toEqual(["a", "b c"]);
  });

  it("lose duplicates regardless of case and keep the first spelling and the order", async () => {
    const material = await createMaterial({
      tags: ["Äpfel", "Birne", "äPFEL", " birne ", "ÄPFEL", "Kirsche"],
    });

    expect(material.tags).toEqual(["Äpfel", "Birne", "Kirsche"]);
  });

  it("accept the maximum number and length", async () => {
    const tags = [...numberedTags(MAX_TAGS - 1), "x".repeat(MAX_TAG_LENGTH)];
    const { create, patch } = sendBoth({ tags });

    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual(tags);
    expect((await patch()).status).toBe(200);
  });

  it("measure the length after trimming", async () => {
    const tag = "x".repeat(MAX_TAG_LENGTH);

    expect((await createMaterial({ tags: [`  ${tag} `] })).tags).toEqual([tag]);
  });

  it("count the number after removing duplicates", async () => {
    const tags = numberedTags(MAX_TAGS);
    const { create, patch } = sendBoth({ tags: [...tags, "T0"] });

    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual(tags);
    expect((await patch()).status).toBe(200);
  });

  it.each([
    ["too many", numberedTags(MAX_TAGS + 1), /höchstens 20/],
    ["no list", "a", /Liste/],
    ["null", null, /Liste/],
    ["an object", { 0: "a" }, /Liste/],
    ["a list with a number", ["a", 1], /Schlagwort/],
    ["a list with null", [null], /Schlagwort/],
    ["a list with a list", [["a"]], /Schlagwort/],
    ["a list with an empty item", ["a", ""], /Schlagwort/],
    ["a list with a blank item", ["   "], /Schlagwort/],
    ["a list with a long item", ["x".repeat(MAX_TAG_LENGTH + 1)], /höchstens 50/],
    ["a list with NUL", ["a\u0000"], /Schlagwort/],
    ["a list with a lone surrogate", ["\udc00a"], /Schlagwort/],
  ])("reject %s", async (_label, tags, message) => {
    const { create, patch } = sendBoth({ tags });

    for (const res of [await create(), await patch()]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
    }
  });

  it("are replaced as a whole by a patch and cleared by an empty list", async () => {
    const { id } = await createMaterial({ tags: ["a", "b"], description: "bleibt" });

    const replaced = await admin.patch(`${path}/${id}`).send({ tags: ["c"] });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toMatchObject({ tags: ["c"], description: "bleibt" });

    const cleared = await admin.patch(`${path}/${id}`).send({ tags: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.tags).toEqual([]);
    expect((await admin.get(`${path}/${id}`)).body.tags).toEqual([]);
  });

  it("do not move updatedAt when the list stays the same", async () => {
    const { id, updatedAt } = await createMaterial({ tags: ["a", "b"] });
    await delay(2);

    const res = await admin.patch(`${path}/${id}`).send({ tags: ["a", "b"] });

    expect(res.body.updatedAt).toBe(updatedAt);
  });
});

describe("memory store for materials", () => {
  it("shares no arrays with its callers", async () => {
    const { materials } = context.stores;
    const tags = ["a"];
    const created = await materials.create({ name: "a", unit: "x", description: "", tags });

    tags.push("b");
    created.tags.push("c");
    (await materials.findById(created.id))?.tags.push("d");
    expect((await materials.findById(created.id))?.tags).toEqual(["a"]);

    const patch = ["e"];
    const updated = await materials.update(created.id, { tags: patch });
    patch.push("f");
    updated?.tags.push("g");
    expect((await materials.list())[0]?.tags).toEqual(["e"]);
  });
});

describe("material from before description and tags", () => {
  async function createLegacy(fields = { name: "Alt", unit: "Liter" }) {
    return context.stores.materials.create(fields as MaterialFields);
  }

  it("is read with the defaults", async () => {
    const { id } = await createLegacy();
    const expected = { name: "Alt", unit: "Liter", description: "", tags: [] };

    expect((await admin.get(`${path}/${id}`)).body).toMatchObject(expected);
    expect((await admin.get(path)).body).toMatchObject([expected]);
  });

  it.each([
    ["the description", { description: "Neu" }, { description: "Neu", tags: [] }],
    ["the tags", { tags: ["Neu"] }, { description: "", tags: ["Neu"] }],
    ["the name", { name: "Anders" }, { name: "Anders", description: "", tags: [] }],
    ["the unit", { unit: "Meter" }, { unit: "Meter", description: "", tags: [] }],
  ])("can be patched in %s alone", async (_label, patch, expected) => {
    const { id } = await createLegacy();

    const res = await admin.patch(`${path}/${id}`).send(patch);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(expected);
    expect((await admin.get(`${path}/${id}`)).body).toMatchObject(expected);
  });

  it("counts sending the defaults as no change", async () => {
    const { id, updatedAt } = await createLegacy();
    await delay(2);

    const res = await admin.patch(`${path}/${id}`).send({ description: "", tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBe(updatedAt.toISOString());
  });

  it("keeps its unit locked while in use", async () => {
    const { id } = await createLegacy();
    const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle" });
    await admin
      .post(API_PATHS.consumptions)
      .send({ materialId: id, storageLocationId: location.body.id, quantity: 1 });

    expect((await admin.patch(`${path}/${id}`).send({ unit: "Meter" })).status).toBe(409);
    expect((await admin.patch(`${path}/${id}`).send({ tags: ["a"] })).status).toBe(200);
  });
});

describe.each([
  { via: "a consumption", movements: API_PATHS.consumptions },
  { via: "an order", movements: API_PATHS.orders },
])("unit of a material used by $via", ({ movements }) => {
  let id: string;
  let storageLocationId: string;
  let movementId: string;

  beforeEach(async () => {
    id = (await createMaterial({ unit: "Liter" })).id;
    const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle" });
    storageLocationId = location.body.id;
    const used = await admin
      .post(movements)
      .send({ materialId: id, storageLocationId, quantity: 2 });
    expect(used.status).toBe(201);
    movementId = used.body.id;
  });

  it("cannot be changed and stays as it is", async () => {
    const res = await admin.patch(`${path}/${id}`).send({ unit: "Meter" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Mengeneinheit/);
    expect((await admin.get(`${path}/${id}`)).body.unit).toBe("Liter");
  });

  it("treats a change of case as a change", async () => {
    expect((await admin.patch(`${path}/${id}`).send({ unit: "liter" })).status).toBe(409);
  });

  it("writes none of the other fields when the unit is refused", async () => {
    const res = await admin.patch(`${path}/${id}`).send({ unit: "Meter", name: "Anders" });

    expect(res.status).toBe(409);
    expect((await admin.get(`${path}/${id}`)).body.name).toBe("Schraube");
  });

  it("allows sending the same value, also untrimmed and with all other fields", async () => {
    const same = await admin.patch(`${path}/${id}`).send({ unit: " Liter " });
    expect(same.status).toBe(200);

    const all = await admin
      .patch(`${path}/${id}`)
      .send({ name: "Anders", unit: "Liter", description: "Text", tags: ["a"] });
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      name: "Anders",
      unit: "Liter",
      description: "Text",
      tags: ["a"],
    });
  });

  it("leaves name, description and tags changeable", async () => {
    for (const patch of [{ name: "Anders" }, { description: "Text" }, { tags: ["a"] }]) {
      const res = await admin.patch(`${path}/${id}`).send(patch);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ...patch, unit: "Liter" });
    }
  });

  it("is free again after the reference is deleted", async () => {
    await admin.delete(`${movements}/${movementId}`);

    const res = await admin.patch(`${path}/${id}`).send({ unit: "Meter" });

    expect(res.status).toBe(200);
    expect(res.body.unit).toBe("Meter");
  });

  it("is free again once the reference points elsewhere, and locks the new material", async () => {
    const other = await createMaterial({ name: "Mutter" });
    await admin.patch(`${movements}/${movementId}`).send({ materialId: other.id });

    expect((await admin.patch(`${path}/${id}`).send({ unit: "Meter" })).status).toBe(200);
    expect((await admin.patch(`${path}/${other.id}`).send({ unit: "Meter" })).status).toBe(409);
  });

  it("answers in the order of roles, id, body, existence and only then conflict", async () => {
    const user = await loginAs(context.app, "user");
    const change = { unit: "Meter" };

    expect((await user.patch(`${path}/${id}`).send(change)).status).toBe(403);
    expect((await user.patch(`${path}/keine-guid`).send({})).status).toBe(403);
    expect((await admin.patch(`${path}/keine-guid`).send({})).status).toBe(404);
    expect((await admin.patch(`${path}/${UNKNOWN_ID}`).send({})).status).toBe(400);
    expect((await admin.patch(`${path}/${id}`).send({ ...change, tags: "a" })).status).toBe(400);
    expect((await admin.patch(`${path}/${UNKNOWN_ID}`).send(change)).status).toBe(404);
    expect((await admin.patch(`${path}/${id}`).send(change)).status).toBe(409);
  });
});

describe("unit of an unused material", () => {
  it("can be changed", async () => {
    const { id } = await createMaterial({ unit: "Liter" });

    const res = await admin.patch(`${path}/${id}`).send({ unit: "Meter" });

    expect(res.status).toBe(200);
    expect(res.body.unit).toBe("Meter");
  });
});

// A gate holds one request at the point between its check and its write. The other request starts
// while the gate is closed; without the shared lock it would slip through this gap.
describe("changing the unit racing a consumption", () => {
  const OVERLAP_MS = 40;
  let materialId: string;
  let body: { materialId: string; storageLocationId: string; quantity: number };

  function createGate() {
    let open = () => {};
    let reached = () => {};
    const opened = new Promise<void>((resolve) => (open = resolve));
    const entered = new Promise<void>((resolve) => (reached = resolve));
    return { opened, entered, open, reached };
  }

  beforeEach(async () => {
    materialId = (await createMaterial({ unit: "Liter" })).id;
    const location = await admin.post(API_PATHS.storageLocations).send({ name: "Halle" });
    body = { materialId, storageLocationId: location.body.id, quantity: 1 };
  });

  it("lets the consumption wait for a unit change that passed the check", async () => {
    const { consumptions, materials } = context.stores;
    const gate = createGate();
    const { countByReference, create } = consumptions;
    const { update } = materials;
    const writes: string[] = [];
    consumptions.countByReference = async (...args) => {
      const count = await countByReference(...args);
      gate.reached();
      await gate.opened;
      return count;
    };
    consumptions.create = (fields) => {
      writes.push("consumption");
      return create(fields);
    };
    materials.update = (...args) => {
      writes.push("unit");
      return update(...args);
    };

    const patching = admin
      .patch(`${path}/${materialId}`)
      .send({ unit: "Meter" })
      .then((res) => res);
    await gate.entered;
    const creating = admin
      .post(API_PATHS.consumptions)
      .send(body)
      .then((res) => res);
    await delay(OVERLAP_MS);
    gate.open();
    const [patched, created] = await Promise.all([patching, creating]);

    expect(patched.status).toBe(200);
    expect(created.status).toBe(201);
    expect(writes).toEqual(["unit", "consumption"]);
    // From here on the consumption counts in the new unit, which is locked.
    expect((await admin.patch(`${path}/${materialId}`).send({ unit: "Liter" })).status).toBe(409);
  });

  it("refuses a unit change that arrives while a consumption is being written", async () => {
    const { materials } = context.stores;
    const gate = createGate();
    const { findById } = materials;
    let held = false;
    materials.findById = async (id) => {
      const record = await findById(id);
      if (!held) {
        held = true;
        gate.reached();
        await gate.opened;
      }
      return record;
    };

    const creating = admin
      .post(API_PATHS.consumptions)
      .send(body)
      .then((res) => res);
    await gate.entered;
    const patching = admin
      .patch(`${path}/${materialId}`)
      .send({ unit: "Meter" })
      .then((res) => res);
    await delay(OVERLAP_MS);
    gate.open();
    const [created, patched] = await Promise.all([creating, patching]);

    expect(created.status).toBe(201);
    expect(patched.status).toBe(409);
    expect((await admin.get(`${path}/${materialId}`)).body.unit).toBe("Liter");
  });

  it("releases the lock after a refused unit change", async () => {
    await admin.post(API_PATHS.consumptions).send(body);

    expect((await admin.patch(`${path}/${materialId}`).send({ unit: "Meter" })).status).toBe(409);
    expect((await admin.post(API_PATHS.consumptions).send(body)).status).toBe(201);
  });
});
