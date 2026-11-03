import { describe, expect, it } from "vitest";
import { createMemoryStores } from "./memoryStores.js";
import { DuplicateKeyError } from "./types.js";

const movement = { materialId: "m", storageLocationId: "s", quantity: 1 };
const createdBy = { id: "665f1c2ab0c4d8e9f0a1b2c3", displayName: "Erika Muster" };

describe("createdBy in the memory store", () => {
  it("reads null for a record from before the field, also after a patch", async () => {
    const { consumptions } = createMemoryStores();

    const legacy = await consumptions.create(movement as never);

    expect(legacy.createdBy).toBeNull();
    expect((await consumptions.findById(legacy.id))?.createdBy).toBeNull();
    expect((await consumptions.list())[0]?.createdBy).toBeNull();
    expect((await consumptions.update(legacy.id, { quantity: 2 }))?.createdBy).toBeNull();
  });

  it("shares no reference with its callers", async () => {
    const { consumptions } = createMemoryStores();
    const input = { ...createdBy };

    const created = await consumptions.create({ ...movement, createdBy: input });
    input.displayName = "Eingabe geändert";
    if (created.createdBy) created.createdBy.displayName = "Antwort geändert";
    const read = await consumptions.findById(created.id);
    if (read?.createdBy) read.createdBy.displayName = "Lesen geändert";

    expect((await consumptions.findById(created.id))?.createdBy).toEqual(createdBy);
  });
});

describe("orders in the memory store", () => {
  const requestedBy = [
    { number: 3, createdBy },
    { number: 7, createdBy: null },
  ];

  it("read null and an empty list for an order from before the fields, also after a patch", async () => {
    const { orders } = createMemoryStores();

    const legacy = await orders.create(movement as never);

    expect(legacy).toMatchObject({ createdBy: null, requestedBy: [] });
    expect(await orders.findById(legacy.id)).toMatchObject({ createdBy: null, requestedBy: [] });
    expect((await orders.list())[0]).toMatchObject({ createdBy: null, requestedBy: [] });
    expect(await orders.update(legacy.id, { quantity: 2 })).toMatchObject({
      quantity: 2,
      createdBy: null,
      requestedBy: [],
    });
  });

  it("keep both fields and share no reference with their callers", async () => {
    const { orders } = createMemoryStores();
    const input = structuredClone(requestedBy);

    const created = await orders.create({ ...movement, createdBy, requestedBy: input });
    input.push({ number: 9, createdBy: null });
    created.requestedBy.pop();

    expect((await orders.findById(created.id))?.requestedBy).toEqual(requestedBy);
    expect((await orders.update(created.id, { quantity: 4 }))?.createdBy).toEqual(createdBy);
  });
});

describe("restore in the memory store", () => {
  it("puts a deleted record back unchanged and leaves the counter alone", async () => {
    const { consumptions } = createMemoryStores();
    await consumptions.create({ ...movement, createdBy: null });
    const second = await consumptions.create({ ...movement, quantity: 2, createdBy });
    await consumptions.delete(second.id);

    await consumptions.restore(second);

    expect(await consumptions.findById(second.id)).toEqual(second);
    expect((await consumptions.list()).map((record) => record.number)).toEqual([1, 2]);
    expect((await consumptions.create({ ...movement, createdBy })).number).toBe(3);
  });

  it("keeps createdAt and updatedAt as they were read", async () => {
    const { consumptions } = createMemoryStores();
    const created = await consumptions.create({ ...movement, createdBy });
    const old = {
      ...created,
      createdAt: new Date("2020-01-02T03:04:05.006Z"),
      updatedAt: new Date("2021-01-02T03:04:05.006Z"),
    };
    await consumptions.delete(created.id);

    await consumptions.restore(old);

    expect(await consumptions.findById(created.id)).toEqual(old);
  });

  it("shares no reference with the caller", async () => {
    const { consumptions } = createMemoryStores();
    const created = await consumptions.create({ ...movement, createdBy: { ...createdBy } });
    await consumptions.delete(created.id);

    await consumptions.restore(created);
    if (created.createdBy) created.createdBy.displayName = "Geändert";

    expect((await consumptions.findById(created.id))?.createdBy).toEqual(createdBy);
  });

  it("rejects a taken id or number", async () => {
    const { consumptions } = createMemoryStores();
    const created = await consumptions.create({ ...movement, createdBy });

    await expect(consumptions.restore(created)).rejects.toBeInstanceOf(DuplicateKeyError);
    await expect(
      consumptions.restore({ ...created, id: "00000000-0000-4000-8000-000000000001" }),
    ).rejects.toBeInstanceOf(DuplicateKeyError);
    expect(await consumptions.list()).toEqual([created]);
  });
});
