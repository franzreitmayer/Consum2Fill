import type { RecordCreator } from "@c2r/shared";
import { model } from "mongoose";
import { createMovementSchema, type MovementDocument } from "./movement.js";
import { recordCreatorSchema } from "./recordCreator.js";

export interface ConsumptionDocument extends MovementDocument {
  createdBy: RecordCreator | null;
}

const consumptionSchema = createMovementSchema<ConsumptionDocument>();
// null also stands for documents from before this field. Set once, because it records a past event.
consumptionSchema.add({
  createdBy: { type: recordCreatorSchema, default: null, immutable: true },
});

export const ConsumptionModel = model<ConsumptionDocument>("Consumption", consumptionSchema);
