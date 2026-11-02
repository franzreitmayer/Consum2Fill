import { Schema, model } from "mongoose";
import { recordSchemaFields, uniqueNameField, type RecordDocument } from "./record.js";

export interface StorageLocationDocument extends RecordDocument {
  name: string;
}

const storageLocationSchema = new Schema<StorageLocationDocument>(
  { ...recordSchemaFields, name: uniqueNameField },
  { strict: "throw", timestamps: true },
);

export const StorageLocationModel = model<StorageLocationDocument>(
  "StorageLocation",
  storageLocationSchema,
);
