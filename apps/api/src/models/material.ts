import { DEFAULT_UNIT } from "@c2r/shared";
import { Schema, model } from "mongoose";
import { recordSchemaFields, uniqueNameField, type RecordDocument } from "./record.js";

export interface MaterialDocument extends RecordDocument {
  name: string;
  unit: string;
}

const materialSchema = new Schema<MaterialDocument>(
  {
    ...recordSchemaFields,
    name: uniqueNameField,
    unit: { type: String, required: true, trim: true, minlength: 1, default: DEFAULT_UNIT },
  },
  { strict: "throw", timestamps: true },
);

export const MaterialModel = model<MaterialDocument>("Material", materialSchema);
