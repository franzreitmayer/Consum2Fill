import type { RecordCreator } from "@c2r/shared";
import { Schema } from "mongoose";

// Who created a record: id and display name, copied from the session. Shared by consumptions and
// orders, and by the requests an order keeps.
export const recordCreatorSchema = new Schema<RecordCreator>(
  {
    id: { type: String, required: true, minlength: 1 },
    displayName: { type: String, required: true, minlength: 1 },
  },
  { _id: false, strict: "throw" },
);
