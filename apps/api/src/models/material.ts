import { DEFAULT_UNIT, MAX_DESCRIPTION_LENGTH, MAX_TAG_LENGTH, MAX_TAGS } from "@c2r/shared";
import { Schema, model } from "mongoose";
import { recordSchemaFields, uniqueNameField, type RecordDocument } from "./record.js";

export interface MaterialDocument extends RecordDocument {
  name: string;
  unit: string;
  // Documents from before these fields have neither; the stores read them with the defaults.
  description: string;
  tags: string[];
}

const materialSchema = new Schema<MaterialDocument>(
  {
    ...recordSchemaFields,
    name: uniqueNameField,
    unit: { type: String, required: true, trim: true, minlength: 1, default: DEFAULT_UNIT },
    description: { type: String, trim: true, maxlength: MAX_DESCRIPTION_LENGTH, default: "" },
    tags: {
      type: [{ type: String, trim: true, minlength: 1, maxlength: MAX_TAG_LENGTH }],
      default: () => [],
      validate: {
        validator: (tags: string[]) => tags.length <= MAX_TAGS,
        message: `Ein Material hat höchstens ${MAX_TAGS} Schlagworte.`,
      },
    },
  },
  { strict: "throw", timestamps: true },
);

export const MaterialModel = model<MaterialDocument>("Material", materialSchema);
