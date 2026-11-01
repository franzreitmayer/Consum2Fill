import { Schema, model, type Types } from "mongoose";

interface SessionFields {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionFields>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: "throw", timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<SessionFields>("Session", sessionSchema);
