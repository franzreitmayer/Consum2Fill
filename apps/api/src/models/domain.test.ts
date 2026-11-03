import { DEFAULT_UNIT, MAX_DESCRIPTION_LENGTH, MAX_TAG_LENGTH, MAX_TAGS } from "@c2r/shared";
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

describe("MaterialModel description and tags", () => {
  const valid = { number: 1, name: "a" };

  it("default to an empty text and an empty list that is not shared", () => {
    const first = new MaterialModel(valid);
    const second = new MaterialModel(valid);

    expect(first.description).toBe("");
    expect([...first.tags]).toEqual([]);
    first.tags.push("x");
    expect([...second.tags]).toEqual([]);
  });

  it("are applied to a stored document without them", () => {
    const stored = MaterialModel.hydrate({ _id: "id", ...valid, unit: "Liter" });

    expect(stored.description).toBe("");
    expect([...stored.tags]).toEqual([]);
  });

  it("limit the description", async () => {
    const description = "x".repeat(MAX_DESCRIPTION_LENGTH);

    expect(await invalidPaths(MaterialModel, { ...valid, description })).toEqual([]);
    expect(await invalidPaths(MaterialModel, { ...valid, description: `${description}x` })).toEqual(
      ["description"],
    );
  });

  it("limit the number of tags", async () => {
    const tags = Array.from({ length: MAX_TAGS }, (_, index) => `t${index}`);

    expect(await invalidPaths(MaterialModel, { ...valid, tags })).toEqual([]);
    expect(await invalidPaths(MaterialModel, { ...valid, tags: [...tags, "x"] })).toEqual(["tags"]);
  });

  it("limit the length of a tag and reject a blank one", async () => {
    const tag = "x".repeat(MAX_TAG_LENGTH);

    expect(await invalidPaths(MaterialModel, { ...valid, tags: [tag] })).toEqual([]);
    expect(await invalidPaths(MaterialModel, { ...valid, tags: [`${tag}x`] })).toEqual(["tags.0"]);
    expect(await invalidPaths(MaterialModel, { ...valid, tags: ["a", " "] })).toEqual(["tags.1"]);
  });

  it("trim the description and the tags", () => {
    const material = new MaterialModel({ ...valid, description: " a\nb ", tags: [" c "] });

    expect(material.description).toBe("a\nb");
    expect([...material.tags]).toEqual(["c"]);
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

describe("ConsumptionModel createdBy", () => {
  const createdBy = { id: "665f1c2ab0c4d8e9f0a1b2c3", displayName: "Erika Muster" };

  it("defaults to null, also for a stored document without it", async () => {
    expect(new ConsumptionModel(movement).createdBy).toBeNull();
    expect(ConsumptionModel.hydrate({ _id: "id", ...movement }).createdBy).toBeNull();
    expect(await invalidPaths(ConsumptionModel, movement)).toEqual([]);
  });

  it("holds exactly id and displayName, without an _id of its own", async () => {
    const doc = new ConsumptionModel({ ...movement, createdBy });

    expect(await invalidPaths(ConsumptionModel, { ...movement, createdBy })).toEqual([]);
    expect(doc.toObject().createdBy).toEqual(createdBy);
    expect(doc.createdBy?.id).toBe(createdBy.id);
    expect(doc.createdBy?.displayName).toBe(createdBy.displayName);
  });

  it.each(["id", "displayName"] as const)("requires %s", async (field) => {
    const paths = await invalidPaths(ConsumptionModel, {
      ...movement,
      createdBy: { ...createdBy, [field]: undefined },
    });

    expect(paths).toContain(`createdBy.${field}`);
  });

  it("rejects unknown fields inside", async () => {
    const paths = await invalidPaths(ConsumptionModel, {
      ...movement,
      createdBy: { ...createdBy, role: "ADMIN" },
    });

    expect(paths).toEqual(["createdBy"]);
  });

  it("keeps the value of a stored document", () => {
    const stored = ConsumptionModel.hydrate({ _id: "id", ...movement, createdBy });

    stored.set("createdBy", { id: "other", displayName: "Fremd" });

    expect(stored.createdBy?.id).toBe(createdBy.id);
  });
});

describe("OrderModel createdBy and requestedBy", () => {
  const createdBy = { id: "665f1c2ab0c4d8e9f0a1b2c3", displayName: "Erika Muster" };
  const requestedBy = [
    { number: 2, createdBy },
    { number: 5, createdBy: null },
  ];

  it("default to null and an empty list, also for a stored document without them", async () => {
    const fresh = new OrderModel(movement);
    const stored = OrderModel.hydrate({ _id: "id", ...movement });

    expect(fresh.createdBy).toBeNull();
    expect([...fresh.requestedBy]).toEqual([]);
    expect(stored.createdBy).toBeNull();
    expect([...stored.requestedBy]).toEqual([]);
    expect(await invalidPaths(OrderModel, movement)).toEqual([]);
  });

  it("do not share the default list", () => {
    const first = new OrderModel(movement);
    const second = new OrderModel(movement);

    expect(first.requestedBy).not.toBe(second.requestedBy);
  });

  it("hold exactly the contract's fields, without an _id of their own", async () => {
    const doc = new OrderModel({ ...movement, createdBy, requestedBy });

    expect(await invalidPaths(OrderModel, { ...movement, createdBy, requestedBy })).toEqual([]);
    expect(doc.toObject().createdBy).toEqual(createdBy);
    expect(doc.toObject().requestedBy).toEqual(requestedBy);
  });

  it.each([
    ["a missing number", { createdBy: null }, "requestedBy.0.number"],
    ["a number below 1", { number: 0, createdBy: null }, "requestedBy.0.number"],
    ["a decimal number", { number: 1.5, createdBy: null }, "requestedBy.0.number"],
    [
      "a creator without a name",
      { number: 1, createdBy: { id: "x" } },
      "requestedBy.0.createdBy.displayName",
    ],
  ])("reject a request with %s", async (_label, request, path) => {
    const paths = await invalidPaths(OrderModel, { ...movement, requestedBy: [request] });

    expect(paths).toContain(path);
  });

  it("reject unknown fields", async () => {
    expect(
      await invalidPaths(OrderModel, { ...movement, createdBy: { ...createdBy, role: "ADMIN" } }),
    ).toEqual(["createdBy"]);
    expect(
      await invalidPaths(OrderModel, {
        ...movement,
        requestedBy: [{ number: 1, createdBy: null, extra: true }],
      }),
    ).not.toEqual([]);
  });

  it("keep the values of a stored document", () => {
    const stored = OrderModel.hydrate({ _id: "id", ...movement, createdBy, requestedBy });

    stored.set("createdBy", { id: "other", displayName: "Fremd" });
    stored.set("requestedBy", []);

    expect(stored.createdBy?.id).toBe(createdBy.id);
    expect(stored.toObject().requestedBy).toEqual(requestedBy);
  });
});

describe("CounterModel", () => {
  it("requires the entity key and a value", async () => {
    expect((await invalidPaths(CounterModel, {})).sort()).toEqual(["_id", "value"]);
    expect(await invalidPaths(CounterModel, { _id: "materials", value: 1 })).toEqual([]);
  });
});
