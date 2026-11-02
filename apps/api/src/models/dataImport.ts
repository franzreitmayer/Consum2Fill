import { Schema, model } from "mongoose";

export interface DataImportDocument {
  _id: string;
  completedAt: Date;
}

// One document per completed import, for example din-13232. It outlives the imported records.
const dataImportSchema = new Schema<DataImportDocument>(
  {
    _id: { type: String, required: true },
    completedAt: { type: Date, required: true },
  },
  { strict: "throw" },
);

export const DataImportModel = model<DataImportDocument>("DataImport", dataImportSchema);
