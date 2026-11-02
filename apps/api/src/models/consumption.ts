import type { RecordCreator } from "@c2r/shared";
import { Schema, model } from "mongoose";
import { createMovementSchema, type MovementDocument } from "./movement.js";

export interface ConsumptionDocument extends MovementDocument {
  createdBy: RecordCreator | null;
}

const recordCreatorSchema = new Schema<RecordCreator>(
  {
    id: { type: String, required: true, minlength: 1 },
    displayName: { type: String, required: true, minlength: 1 },
  },
  { _id: false, strict: "throw" },
);

const consumptionSchema = createMovementSchema<ConsumptionDocument>();
// null also stands for documents from before this field. Set once, because it records a past event.
consumptionSchema.add({
  createdBy: { type: recordCreatorSchema, default: null, immutable: true },
});

export const ConsumptionModel = model<ConsumptionDocument>("Consumption", consumptionSchema);
