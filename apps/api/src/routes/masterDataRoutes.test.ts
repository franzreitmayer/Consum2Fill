import { API_PATHS, DEFAULT_UNIT } from "@c2r/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createSeededContext, loginAs } from "../testSupport.js";

type Context = Awaited<ReturnType<typeof createSeededContext>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe.each([
  {
    label: "materials",
    path: API_PATHS.materials,
    extra: { unit: DEFAULT_UNIT, description: "", tags: [] },
  },
  { label: "storage locations", path: API_PATHS.storageLocations, extra: {} },
])("$label", ({ path, extra }) => {
  let context: Context;
  let admin: Agent;

  const create = async (name: string) => {
    const res = await admin.post(path).send({ name });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: number; name: string };
  };

  beforeEach(async () => {
    context = await createSeededContext();
    admin = await loginAs(context.app, "admin");
  });

  it("creates a record with exactly the contract's fields", async () => {
    const res = await admin.post(path).send({ name: "  Neu " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.stringMatching(GUID),
      number: 1,
      name: "Neu",
      ...extra,
      createdAt: expect.stringMatching(ISO_TEXT),
      updatedAt: expect.stringMatching(ISO_TEXT),
    });
  });

  it("lists by ascending number and reads a single record", async () => {
    const first = await create("Zuerst");
    const second = await create("Ausserdem");

    const list = await admin.get(path);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([first, second]);

    const read = await admin.get(`${path}/${second.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(second);
  });

  it("finds a record by its GUID in upper case", async () => {
    const record = await create("Neu");

    const res = await admin.get(`${path}/${record.id.toUpperCase()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(record.id);
  });

  it("updates a record and keeps its identity", async () => {
    const record = await create("Alt");

    const res = await admin.patch(`${path}/${record.id}`).send({ name: " Neu " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...record, name: "Neu", updatedAt: expect.any(String) });
    expect((await admin.get(`${path}/${record.id}`)).body.name).toBe("Neu");
  });

  it("deletes a record", async () => {
    const record = await create("Neu");

    const res = await admin.delete(`${path}/${record.id}`);

    expect(res.status).toBe(204);
    expect((await admin.get(`${path}/${record.id}`)).status).toBe(404);
    expect((await admin.get(path)).body).toEqual([]);
  });

  it("counts up and does not reuse the number of a deleted last record", async () => {
    expect((await create("a")).number).toBe(1);
    const second = await create("b");
    expect(second.number).toBe(2);

    await admin.delete(`${path}/${second.id}`);

    expect((await create("c")).number).toBe(3);
  });

  it("ignores id, number and timestamps in the body", async () => {
    const forged = {
      id: UNKNOWN_ID,
      number: 99,
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    };

    const created = await admin.post(path).send({ name: "Neu", ...forged });
    expect(created.status).toBe(201);
    expect(created.body.id).not.toBe(UNKNOWN_ID);
    expect(created.body.number).toBe(1);
    expect(created.body.createdAt).not.toBe(forged.createdAt);

    const patched = await admin
      .patch(`${path}/${created.body.id}`)
      .send({ name: "Anders", ...forged });
    expect(patched.status).toBe(200);
    expect(patched.body.id).toBe(created.body.id);
    expect(patched.body.number).toBe(1);
    expect(patched.body.createdAt).toBe(created.body.createdAt);
    expect(patched.body.updatedAt).not.toBe(forged.updatedAt);
  });

  it.each([
    ["missing", {}],
    ["empty", { name: "" }],
    ["blank", { name: "   " }],
    ["null", { name: null }],
    ["a number", { name: 1 }],
    ["an object", { name: { $ne: "" } }],
  ])("rejects a name that is %s on create", async (_label, body) => {
    const res = await admin.post(path).send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Name/);
  });

  it("rejects a body that is not an object", async () => {
    expect((await admin.post(path).send([])).status).toBe(400);
    expect((await admin.post(path)).status).toBe(400);
  });

  it.each([
    ["empty", {}],
    ["only unknown fields", { number: 5, id: UNKNOWN_ID, other: "x" }],
    ["a blank name", { name: " " }],
    ["a null name", { name: null }],
  ])("rejects a patch with %s", async (_label, body) => {
    const record = await create("Neu");

    const res = await admin.patch(`${path}/${record.id}`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.any(String));
  });

  it.each([
    ["GET", "get"],
    ["PATCH", "patch"],
    ["DELETE", "delete"],
  ] as const)("answers %s with 404 for an unknown and a non-GUID id", async (_label, method) => {
    for (const id of [UNKNOWN_ID, "keine-guid", "507f1f77bcf86cd799439011", "%E0%A4%A"]) {
      const res = await admin[method](`${path}/${id}`).send({ name: "Neu" });

      expect(res.status).toBe(404);
      expect(res.body.message).toEqual(expect.any(String));
    }
  });

  it("answers 409 for a taken name on create and treats upper and lower case as different", async () => {
    await create("Neu");

    const duplicate = await admin.post(path).send({ name: " Neu " });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/vergeben/);

    expect((await admin.post(path).send({ name: "neu" })).status).toBe(201);
  });

  it("answers 409 for a taken name on update and allows keeping the own name", async () => {
    await create("Belegt");
    const record = await create("Frei");

    const duplicate = await admin.patch(`${path}/${record.id}`).send({ name: "Belegt" });
    expect(duplicate.status).toBe(409);
    expect((await admin.get(`${path}/${record.id}`)).body.name).toBe("Frei");

    const same = await admin.patch(`${path}/${record.id}`).send({ name: "Frei" });
    expect(same.status).toBe(200);
  });

  it("frees a name by deleting and renaming", async () => {
    const deleted = await create("Geloescht");
    await admin.delete(`${path}/${deleted.id}`);
    expect((await admin.post(path).send({ name: "Geloescht" })).status).toBe(201);

    const renamed = await create("Alt");
    await admin.patch(`${path}/${renamed.id}`).send({ name: "Neu" });
    expect((await admin.post(path).send({ name: "Alt" })).status).toBe(201);
  });
});

describe("material unit", () => {
  let admin: Agent;

  beforeEach(async () => {
    admin = await loginAs((await createSeededContext()).app, "admin");
  });

  it("defaults to Stück and takes a trimmed value", async () => {
    const standard = await admin.post(API_PATHS.materials).send({ name: "a" });
    expect(standard.body.unit).toBe("Stück");

    const liter = await admin.post(API_PATHS.materials).send({ name: "b", unit: " Liter " });
    expect(liter.body.unit).toBe("Liter");
  });

  it.each([[""], ["  "], [null], [1]])("rejects the unit %j", async (unit) => {
    const res = await admin.post(API_PATHS.materials).send({ name: "a", unit });
    expect(res.status).toBe(400);

    const material = await admin.post(API_PATHS.materials).send({ name: "b" });
    const patch = await admin.patch(`${API_PATHS.materials}/${material.body.id}`).send({ unit });
    expect(patch.status).toBe(400);
  });

  it("changes the unit alone and keeps the name", async () => {
    const material = await admin.post(API_PATHS.materials).send({ name: "a" });

    const res = await admin
      .patch(`${API_PATHS.materials}/${material.body.id}`)
      .send({ unit: "Meter" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "a", unit: "Meter" });
  });
});

describe("storage location", () => {
  it("has no unit, and a unit alone is no change", async () => {
    const admin = await loginAs((await createSeededContext()).app, "admin");
    const created = await admin.post(API_PATHS.storageLocations).send({ name: "a", unit: "x" });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty("unit");

    const patch = await admin
      .patch(`${API_PATHS.storageLocations}/${created.body.id}`)
      .send({ unit: "x" });
    expect(patch.status).toBe(400);
  });
});
