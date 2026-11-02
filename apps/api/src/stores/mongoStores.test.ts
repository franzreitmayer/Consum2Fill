import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumptionModel } from "../models/consumption.js";
import { CounterModel } from "../models/counter.js";
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
  const fields = { name: "Schraube", unit: "Stück" };

  it("assigns the number and returns no internal fields", async () => {
    mockCounter(3);
    vi.spyOn(MaterialModel.prototype, "save").mockResolvedValue(undefined as never);

    const record = await mongoStores.materials.create(fields);

    expect(record).toMatchObject({ ...fields, number: 3, id: expect.any(String) });
    expect(Object.keys(record).sort()).toEqual(
      ["createdAt", "id", "name", "number", "unit", "updatedAt"].sort(),
    );
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
