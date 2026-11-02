import { describe, expect, it } from "vitest";
import { createMemoryStores } from "./memoryStores.js";

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

  it("does not add the field to an order", async () => {
    const { orders } = createMemoryStores();

    const order = await orders.create(movement);

    expect(order).not.toHaveProperty("createdBy");
    expect(await orders.findById(order.id)).not.toHaveProperty("createdBy");
  });
});
