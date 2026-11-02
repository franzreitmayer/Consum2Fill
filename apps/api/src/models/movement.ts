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

// The fields consumptions and orders share. Each model needs its own schema instance, and what only
// one of them has belongs in that model's file.
export function createMovementSchema<
  Doc extends MovementDocument = MovementDocument,
>(): Schema<Doc> {
  return new Schema<Doc>(
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
