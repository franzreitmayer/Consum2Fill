import { randomUUID } from "node:crypto";

// Fields shared by all domain records. Timestamps come from the schema option.
export interface RecordDocument {
  _id: string;
  number: number;
  createdAt: Date;
  updatedAt: Date;
}

export const recordSchemaFields = {
  _id: { type: String, default: () => randomUUID() },
  number: {
    type: Number,
    required: true,
    unique: true,
    immutable: true,
    min: 1,
    validate: { validator: Number.isInteger, message: "Die Nummer muss ganzzahlig sein" },
  },
};

export const uniqueNameField = {
  type: String,
  required: true,
  unique: true,
  trim: true,
  minlength: 1,
};
