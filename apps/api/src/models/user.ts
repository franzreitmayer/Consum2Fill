import { ROLES, type Role } from "@c2r/shared";
import { Schema, model } from "mongoose";

export interface UserFields {
  username: string;
  displayName: string;
  email?: string | null;
  role: Role;
  source: "local" | "oidc";
  passwordHash?: string;
  mustChangePassword?: boolean;
  oidcIssuer?: string;
  oidcSubject?: string;
}

function isLocal(this: { source?: string }): boolean {
  return this.source === "local";
}

function isOidc(this: { source?: string }): boolean {
  return this.source === "oidc";
}

const onlyLocal = { validator: isLocal, message: "Nur für lokale Benutzer" };
const onlyOidc = { validator: isOidc, message: "Nur für IAM-Benutzer" };

const userSchema = new Schema<UserFields>(
  {
    username: { type: String, required: true, unique: true, minlength: 1 },
    displayName: { type: String, required: true, minlength: 1 },
    email: { type: String, default: null },
    role: { type: String, required: true, enum: ROLES },
    source: { type: String, required: true, enum: ["local", "oidc"] },
    passwordHash: { type: String, required: isLocal, validate: onlyLocal },
    mustChangePassword: { type: Boolean, default: false },
    oidcIssuer: { type: String, required: isOidc, validate: onlyOidc },
    oidcSubject: { type: String, required: isOidc, validate: onlyOidc },
  },
  { strict: "throw", timestamps: true },
);

userSchema.index(
  { oidcIssuer: 1, oidcSubject: 1 },
  { unique: true, partialFilterExpression: { source: "oidc" } },
);

export const UserModel = model<UserFields>("User", userSchema);
