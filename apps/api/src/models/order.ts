import type { OrderRequest, RecordCreator } from "@c2r/shared";
import { Schema, model } from "mongoose";
import { createMovementSchema, type MovementDocument } from "./movement.js";
import { recordCreatorSchema } from "./recordCreator.js";

export interface OrderDocument extends MovementDocument {
  createdBy: RecordCreator | null;
  requestedBy: OrderRequest[];
}

// One consumption taken over into the order, kept after the consumption itself is deleted
const orderRequestSchema = new Schema<OrderRequest>(
  {
    number: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "Die Nummer muss ganzzahlig sein" },
    },
    createdBy: { type: recordCreatorSchema, default: null },
  },
  { _id: false, strict: "throw" },
);

const orderSchema = createMovementSchema<OrderDocument>();
// Documents from before these fields read as null and an empty list. Both are set once, because
// they record past events.
orderSchema.add({
  createdBy: { type: recordCreatorSchema, default: null, immutable: true },
  requestedBy: { type: [orderRequestSchema], default: () => [], immutable: true },
});

export const OrderModel = model<OrderDocument>("Order", orderSchema);
