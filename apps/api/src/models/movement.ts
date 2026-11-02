import { Schema } from "mongoose";
import { recordSchemaFields, type RecordDocument } from "./record.js";

export interface MovementDocument extends RecordDocument {
  storageLocationId: string;
  materialId: string;
  quantity: number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// Consumptions and orders have the same shape, but each model needs its own schema instance.
export function createMovementSchema(): Schema<MovementDocument> {
  return new Schema<MovementDocument>(
    {
      ...recordSchemaFields,
      // Indexed, because deleting a master record counts the movements that use it
      storageLocationId: { type: String, required: true, index: true },
      materialId: { type: String, required: true, index: true },
      quantity: {
        type: Number,
        required: true,
        validate: { validator: isPositiveFinite, message: "Die Menge muss größer 0 sein" },
      },
    },
    { strict: "throw", timestamps: true },
  );
}
