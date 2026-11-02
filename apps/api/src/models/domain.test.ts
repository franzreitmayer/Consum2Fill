import { DEFAULT_UNIT } from "@c2r/shared";
import type mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { ConsumptionModel } from "./consumption.js";
import { CounterModel } from "./counter.js";
import { MaterialModel } from "./material.js";
import { OrderModel } from "./order.js";
import { StorageLocationModel } from "./storageLocation.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const movement = {
  number: 1,
  storageLocationId: "2f7c2b9c-1d3e-4a5b-8c6d-7e8f9a0b1c2d",
  materialId: "3a8d3c0d-2e4f-4b6c-9d7e-8f9a0b1c2d3e",
  quantity: 1.5,
};

// validate() needs no database; validateSync() is deprecated since Mongoose 9
async function invalidPaths(
  Model: new (fields: object) => { validate(): Promise<void> },
  fields: object,
): Promise<string[]> {
  try {
    await new Model(fields).validate();
    return [];
  } catch (err) {
    return Object.keys((err as mongoose.Error.ValidationError).errors);
  }
}

const allModels = [
  ["MaterialModel", MaterialModel, { number: 1, name: "Schraube" }],
  ["StorageLocationModel", StorageLocationModel, { number: 1, name: "Halle 1" }],
  ["ConsumptionModel", ConsumptionModel, movement],
  ["OrderModel", OrderModel, movement],
] as const;

describe.each(allModels)("%s", (_name, Model, valid) => {
  it("accepts valid fields and generates a GUID as string id", async () => {
    expect(await invalidPaths(Model, valid)).toEqual([]);
    expect(new Model(valid)._id).toMatch(GUID);
  });

  it("requires a positive whole number", async () => {
    for (const number of [undefined, 0, -1, 1.5]) {
      expect(await invalidPaths(Model, { ...valid, number })).toEqual(["number"]);
    }
  });

  it("declares a unique index on the number", () => {
    expect(Model.schema.indexes()).toContainEqual([
      { number: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("keeps the number of a stored document", () => {
    const stored = (Model as typeof MaterialModel).hydrate({ _id: "id", ...valid });
    stored.set("number", 2);
    expect(stored.get("number")).toBe(1);
  });

  it("rejects unknown fields", () => {
    expect(() => new Model({ ...valid, unknown: true })).toThrow();
  });

  it("uses timestamps", () => {
    expect(Model.schema.get("timestamps")).toBe(true);
  });
});

describe.each([
  ["MaterialModel", MaterialModel],
  ["StorageLocationModel", StorageLocationModel],
] as const)("%s name", (_name, Model) => {
  it("requires a name that is not blank and trims it", async () => {
    expect(await invalidPaths(Model, { number: 1 })).toEqual(["name"]);
    expect(await invalidPaths(Model, { number: 1, name: "   " })).toEqual(["name"]);
    expect(new Model({ number: 1, name: "  Neu " }).get("name")).toBe("Neu");
  });

  it("declares a unique index on the name", () => {
    expect(Model.schema.indexes()).toContainEqual([
      { name: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});

describe("MaterialModel unit", () => {
  it("defaults to the shared unit", () => {
    expect(new MaterialModel({ number: 1, name: "Schraube" }).unit).toBe(DEFAULT_UNIT);
  });

  it("must not be blank", async () => {
    expect(await invalidPaths(MaterialModel, { number: 1, name: "a", unit: " " })).toEqual([
      "unit",
    ]);
  });
});

describe.each([
  ["ConsumptionModel", ConsumptionModel],
  ["OrderModel", OrderModel],
] as const)("%s fields", (_name, Model) => {
  it.each(["storageLocationId", "materialId", "quantity"] as const)(
    "requires %s",
    async (field) => {
      expect(await invalidPaths(Model, { ...movement, [field]: undefined })).toEqual([field]);
    },
  );

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects the quantity %s",
    async (quantity) => {
      expect(await invalidPaths(Model, { ...movement, quantity })).toEqual(["quantity"]);
    },
  );

  it("accepts a decimal quantity", async () => {
    expect(await invalidPaths(Model, { ...movement, quantity: 0.25 })).toEqual([]);
  });
});

describe("CounterModel", () => {
  it("requires the entity key and a value", async () => {
    expect((await invalidPaths(CounterModel, {})).sort()).toEqual(["_id", "value"]);
    expect(await invalidPaths(CounterModel, { _id: "materials", value: 1 })).toEqual([]);
  });
});
