import { Schema, model } from "mongoose";

// There is exactly one settings document
export const OIDC_SETTINGS_ID = "default";

interface OidcSettingsFields {
  _id: string;
  enabled: boolean;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecretEncrypted?: string | null;
}

const oidcSettingsSchema = new Schema<OidcSettingsFields>(
  {
    _id: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    displayName: { type: String, default: "" },
    issuerUrl: { type: String, default: "" },
    clientId: { type: String, default: "" },
    clientSecretEncrypted: { type: String, default: null },
  },
  { strict: "throw", timestamps: true },
);

export const OidcSettingsModel = model<OidcSettingsFields>("OidcSettings", oidcSettingsSchema);
