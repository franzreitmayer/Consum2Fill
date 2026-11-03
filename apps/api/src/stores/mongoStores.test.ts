import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumptionModel } from "../models/consumption.js";
import { CounterModel } from "../models/counter.js";
import { DataImportModel } from "../models/dataImport.js";
import { MaterialModel } from "../models/material.js";
import { OrderModel } from "../models/order.js";
import { UserModel } from "../models/user.js";
import { isMongoDuplicateKeyError, mongoStores, nextRecordNumber } from "./mongoStores.js";
import { DuplicateKeyError } from "./types.js";

const counterRace = { code: 11000, keyPattern: { _id: 1 } };

// Replaces the query, so that no database is involved
function mockCounter(...results: (number | object)[]) {
  const spy = vi.spyOn(CounterModel, "findOneAndUpdate");
  for (const result of results) {
    spy.mockReturnValueOnce({
      exec: () =>
        typeof result === "number" ? Promise.resolve({ value: result }) : Promise.reject(result),
    } as never);
  }
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("users in the Mongo store", () => {
  it("reads a document from before mustChangePassword as false", async () => {
    vi.spyOn(UserModel, "findOne").mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: "1",
          username: "alt",
          displayName: "Alt",
          role: "USER",
          source: "local",
          passwordHash: "hash",
        }),
    } as never);

    const user = await mongoStores.users.findByUsername("alt");

    expect(user?.mustChangePassword).toBe(false);
  });

  it("stores the flag on create", async () => {
    vi.spyOn(UserModel.prototype, "save").mockImplementation(function (this: unknown) {
      return Promise.resolve(this) as never;
    });

    const user = await mongoStores.users.create({
      username: "neu",
      displayName: "Neu",
      email: null,
      role: "USER",
      source: "local",
      passwordHash: "hash",
      mustChangePassword: true,
    });

    expect(user.mustChangePassword).toBe(true);
  });
});

describe("data imports in the Mongo store", () => {
  function mockUpsert(result: Promise<unknown>) {
    return vi.spyOn(DataImportModel, "updateOne").mockReturnValue({ exec: () => result } as never);
  }

  it("reads the note by its id", async () => {
    const spy = vi.spyOn(DataImportModel, "exists");
    spy.mockReturnValueOnce({ exec: () => Promise.resolve({ _id: "x" }) } as never);
    spy.mockReturnValueOnce({ exec: () => Promise.resolve(null) } as never);

    expect(await mongoStores.dataImports.isCompleted("x")).toBe(true);
    expect(await mongoStores.dataImports.isCompleted("y")).toBe(false);
    expect(spy).toHaveBeenCalledWith({ _id: "x" });
  });

  it("sets the date only when it inserts the note", async () => {
    const spy = mockUpsert(Promise.resolve({}));

    await mongoStores.dataImports.markCompleted("x");

    expect(spy).toHaveBeenCalledWith(
      { _id: "x" },
      { $setOnInsert: { completedAt: expect.any(Date) as Date } },
      { upsert: true },
    );
  });

  it("accepts the note of a parallel run", async () => {
    mockUpsert(Promise.reject(Object.assign(new Error("dup"), { code: 11000 })));

    await expect(mongoStores.dataImports.markCompleted("x")).resolves.toBeUndefined();
  });

  it("passes on other errors", async () => {
    const failure = new Error("network");
    mockUpsert(Promise.reject(failure));

    await expect(mongoStores.dataImports.markCompleted("x")).rejects.toBe(failure);
  });
});

describe("isMongoDuplicateKeyError", () => {
  it("recognizes the duplicate key code only", () => {
    expect(isMongoDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isMongoDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isMongoDuplicateKeyError(new Error("other"))).toBe(false);
    expect(isMongoDuplicateKeyError(null)).toBe(false);
  });
});

describe("nextRecordNumber", () => {
  it("increments the counter of the entity atomically with an upsert", async () => {
    const spy = mockCounter(7);

    expect(await nextRecordNumber("materials")).toBe(7);
    expect(spy).toHaveBeenCalledWith(
      { _id: "materials" },
      { $inc: { value: 1 } },
      expect.objectContaining({ upsert: true, returnDocument: "after" }),
    );
  });

  it("retries after losing the upsert race", async () => {
    const spy = mockCounter(counterRace, 1);

    expect(await nextRecordNumber("materials")).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated duplicate keys", async () => {
    const spy = mockCounter(counterRace, counterRace, counterRace);

    await expect(nextRecordNumber("materials")).rejects.toBe(counterRace);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const failure = new Error("network");
    const spy = mockCounter(failure);

    await expect(nextRecordNumber("materials")).rejects.toBe(failure);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("countByReference", () => {
  it.each(["materialId", "storageLocationId"] as const)("filters by %s", async (reference) => {
    const spy = vi
      .spyOn(ConsumptionModel, "countDocuments")
      .mockReturnValue({ exec: () => Promise.resolve(2) } as never);

    expect(await mongoStores.consumptions.countByReference(reference, "guid")).toBe(2);
    expect(spy).toHaveBeenCalledWith({ [reference]: "guid" });
  });

  it("uses the collection of the entity", async () => {
    const consumptions = vi.spyOn(ConsumptionModel, "countDocuments");
    const orders = vi
      .spyOn(OrderModel, "countDocuments")
      .mockReturnValue({ exec: () => Promise.resolve(1) } as never);

    expect(await mongoStores.orders.countByReference("materialId", "guid")).toBe(1);
    expect(orders).toHaveBeenCalledOnce();
    expect(consumptions).not.toHaveBeenCalled();
  });

  it.each([
    ["ConsumptionModel", ConsumptionModel],
    ["OrderModel", OrderModel],
  ])("has indexes for the references of %s", (_name, model) => {
    const indexed = model.schema.indexes().map(([fields]) => Object.keys(fields)[0]);

    expect(indexed).toEqual(expect.arrayContaining(["number", "materialId", "storageLocationId"]));
  });
});

describe("create in a Mongo record store", () => {
  const fields = { name: "Schraube", unit: "Stück", description: "", tags: ["Eisen"] };

  it("assigns the number and returns no internal fields", async () => {
    mockCounter(3);
    vi.spyOn(MaterialModel.prototype, "save").mockResolvedValue(undefined as never);

    const record = await mongoStores.materials.create(fields);

    expect(record).toMatchObject({ ...fields, number: 3, id: expect.any(String) });
    expect(Object.keys(record).sort()).toEqual(
      ["createdAt", "description", "id", "name", "number", "tags", "unit", "updatedAt"].sort(),
    );
    expect(Object.getPrototypeOf(record.tags)).toBe(Array.prototype);
  });

  it("reports a duplicate name as DuplicateKeyError", async () => {
    mockCounter(1);
    vi.spyOn(MaterialModel.prototype, "save").mockRejectedValue({
      code: 11000,
      keyPattern: { name: 1 },
    });

    await expect(mongoStores.materials.create(fields)).rejects.toBeInstanceOf(DuplicateKeyError);
  });

  it("does not report a duplicate number as a duplicate name", async () => {
    const failure = { code: 11000, keyPattern: { number: 1 } };
    mockCounter(1);
    vi.spyOn(MaterialModel.prototype, "save").mockRejectedValue(failure);

    await expect(mongoStores.materials.create(fields)).rejects.toBe(failure);
  });

  it("does not report a persistent counter race as a duplicate name", async () => {
    mockCounter(counterRace, counterRace, counterRace);

    await expect(mongoStores.materials.create(fields)).rejects.toBe(counterRace);
  });
});

describe("createdBy of consumptions in the Mongo store", () => {
  const movement = { materialId: "m", storageLocationId: "s", quantity: 1 };
  const legacy = { _id: "guid", number: 1, ...movement };
  const createdBy = { id: "665f1c2ab0c4d8e9f0a1b2c3", displayName: "Erika Muster" };

  function mockFindById(doc: unknown) {
    vi.spyOn(ConsumptionModel, "findById").mockReturnValue({
      exec: () => Promise.resolve(doc),
    } as never);
  }

  function mockSave() {
    return vi.spyOn(ConsumptionModel.prototype, "save").mockResolvedValue(undefined as never);
  }

  it.each([
    ["a raw document", legacy],
    ["a hydrated document", ConsumptionModel.hydrate(legacy)],
  ])("reads null from %s from before the field", async (_label, doc) => {
    mockFindById(doc);

    expect((await mongoStores.consumptions.findById("guid"))?.createdBy).toBeNull();
  });

  it("reads null in the list", async () => {
    vi.spyOn(ConsumptionModel, "find").mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve([ConsumptionModel.hydrate(legacy)]) }),
    } as never);

    const [record] = await mongoStores.consumptions.list();

    expect(record?.createdBy).toBeNull();
  });

  it("keeps null after a patch of an old document", async () => {
    mockFindById(ConsumptionModel.hydrate(legacy));
    const save = mockSave();

    const record = await mongoStores.consumptions.update("guid", { quantity: 2 });

    expect(save).toHaveBeenCalledOnce();
    expect(record).toMatchObject({ quantity: 2, createdBy: null });
  });

  it("returns a plain object, not a subdocument", async () => {
    mockFindById(ConsumptionModel.hydrate({ ...legacy, createdBy }));

    const record = await mongoStores.consumptions.findById("guid");

    expect(record?.createdBy).toEqual(createdBy);
    expect(Object.getPrototypeOf(record?.createdBy)).toBe(Object.prototype);
    expect(Object.keys(record?.createdBy ?? {}).sort()).toEqual(["displayName", "id"]);
  });

  it("stores the creator on create and returns it as a plain object", async () => {
    mockCounter(5);
    mockSave();

    const record = await mongoStores.consumptions.create({ ...movement, createdBy });

    expect(record).toMatchObject({ ...movement, number: 5, createdBy });
    expect(Object.getPrototypeOf(record.createdBy)).toBe(Object.prototype);
  });

  it("keeps the creator on a patch", async () => {
    mockFindById(ConsumptionModel.hydrate({ ...legacy, createdBy }));
    mockSave();

    const record = await mongoStores.consumptions.update("guid", { quantity: 2 });

    expect(record?.createdBy).toEqual(createdBy);
  });

  it("restores a record with its id, number and timestamps, without touching the counter", async () => {
    const counter = vi.spyOn(CounterModel, "findOneAndUpdate");
    const saved: { doc: unknown; options: unknown }[] = [];
    vi.spyOn(ConsumptionModel.prototype, "save").mockImplementation(function (
      this: unknown,
      options?: unknown,
    ) {
      saved.push({ doc: this, options });
      return Promise.resolve(this) as never;
    });
    const record = {
      ...movement,
      createdBy,
      id: "2f7c2b9c-1d3e-4a5b-8c6d-7e8f9a0b1c2d",
      number: 4,
      createdAt: new Date("2020-01-02T03:04:05.006Z"),
      updatedAt: new Date("2021-01-02T03:04:05.006Z"),
    };

    await mongoStores.consumptions.restore(record);

    expect(counter).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.options).toEqual({ timestamps: false });
    const doc = saved[0]?.doc as InstanceType<typeof ConsumptionModel>;
    expect(doc.toObject()).toEqual({
      ...movement,
      createdBy,
      _id: record.id,
      number: 4,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  });
});

describe("orders in the Mongo store", () => {
  const movement = { materialId: "m", storageLocationId: "s", quantity: 1 };
  const legacy = { _id: "guid", number: 1, ...movement };
  const createdBy = { id: "665f1c2ab0c4d8e9f0a1b2c3", displayName: "Erika Muster" };
  const requestedBy = [
    { number: 2, createdBy },
    { number: 5, createdBy: null },
  ];

  function mockFindById(doc: unknown) {
    vi.spyOn(OrderModel, "findById").mockReturnValue({
      exec: () => Promise.resolve(doc),
    } as never);
  }

  it.each([
    ["a raw document", legacy],
    ["a hydrated document", OrderModel.hydrate(legacy)],
  ])("read null and an empty list from %s from before the fields", async (_label, doc) => {
    mockFindById(doc);

    const record = await mongoStores.orders.findById("guid");

    expect(record).toMatchObject({ createdBy: null, requestedBy: [] });
    expect(Object.keys(record ?? {}).sort()).toEqual(
      [
        "createdAt",
        "createdBy",
        "id",
        "materialId",
        "number",
        "quantity",
        "requestedBy",
        "storageLocationId",
        "updatedAt",
      ].sort(),
    );
  });

  it("keep null and the empty list after a patch of an old document", async () => {
    mockFindById(OrderModel.hydrate(legacy));
    vi.spyOn(OrderModel.prototype, "save").mockResolvedValue(undefined as never);

    const record = await mongoStores.orders.update("guid", { quantity: 2 });

    expect(record).toMatchObject({ quantity: 2, createdBy: null, requestedBy: [] });
  });

  it("return plain arrays and objects, not Mongoose ones", async () => {
    mockFindById(OrderModel.hydrate({ ...legacy, createdBy, requestedBy }));

    const record = await mongoStores.orders.findById("guid");

    expect(record?.createdBy).toEqual(createdBy);
    expect(record?.requestedBy).toEqual(requestedBy);
    expect(Object.getPrototypeOf(record?.createdBy)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(record?.requestedBy)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(record?.requestedBy[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(record?.requestedBy[0]?.createdBy)).toBe(Object.prototype);
  });

  it("store both fields on create", async () => {
    mockCounter(6);
    vi.spyOn(OrderModel.prototype, "save").mockResolvedValue(undefined as never);

    const record = await mongoStores.orders.create({ ...movement, createdBy, requestedBy });

    expect(record).toMatchObject({ ...movement, number: 6, createdBy, requestedBy });
  });
});

describe("materials from before description and tags", () => {
  const stored = { _id: "guid", number: 1, name: "Alt", unit: "Liter" };

  function mockFindById(doc: unknown) {
    vi.spyOn(MaterialModel, "findById").mockReturnValue({
      exec: () => Promise.resolve(doc),
    } as never);
  }

  function expectPlainDefaults(record: { description: string; tags: string[] } | null) {
    expect(record?.description).toBe("");
    expect(record?.tags).toEqual([]);
    expect(Object.getPrototypeOf(record?.tags)).toBe(Array.prototype);
  }

  it("reads the defaults from a raw document without the fields", async () => {
    mockFindById(stored);

    expectPlainDefaults(await mongoStores.materials.findById("guid"));
  });

  it("reads the defaults from a hydrated document", async () => {
    mockFindById(MaterialModel.hydrate(stored));

    expectPlainDefaults(await mongoStores.materials.findById("guid"));
  });

  it("reads the defaults in the list", async () => {
    vi.spyOn(MaterialModel, "find").mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve([MaterialModel.hydrate(stored)]) }),
    } as never);

    const [record] = await mongoStores.materials.list();

    expectPlainDefaults(record ?? null);
  });

  it("passes validation and keeps the list empty after a patch of the description alone", async () => {
    const doc = MaterialModel.hydrate(stored);
    mockFindById(doc);
    const save = vi.spyOn(MaterialModel.prototype, "save").mockResolvedValue(undefined as never);

    const record = await mongoStores.materials.update("guid", { description: "Neu" });

    await expect(doc.validate()).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledOnce();
    expect(record).toMatchObject({ name: "Alt", unit: "Liter", description: "Neu", tags: [] });
  });

  it("returns a plain array that shares nothing after a patch of the tags", async () => {
    const doc = MaterialModel.hydrate(stored);
    mockFindById(doc);
    vi.spyOn(MaterialModel.prototype, "save").mockResolvedValue(undefined as never);
    const tags = ["a", "b"];

    const record = await mongoStores.materials.update("guid", { tags });
    tags.push("c");
    record?.tags.push("d");

    expect(record?.tags).toEqual(["a", "b", "d"]);
    expect(Object.getPrototypeOf(record?.tags)).toBe(Array.prototype);
    expect([...doc.tags]).toEqual(["a", "b"]);
  });
});
