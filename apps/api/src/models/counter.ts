import { Schema, model } from "mongoose";

export interface CounterDocument {
  _id: string;
  value: number;
}

// One document per entity. It outlives the records, so that numbers are never reused.
const counterSchema = new Schema<CounterDocument>(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, min: 1 },
  },
  { strict: "throw", timestamps: true },
);

export const CounterModel = model<CounterDocument>("Counter", counterSchema);
