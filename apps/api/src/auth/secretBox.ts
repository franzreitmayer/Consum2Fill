import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

export type SecretPurpose = "oidc-client-secret" | "oidc-login-state";

export interface SecretBox {
  encrypt(plainText: string, purpose: SecretPurpose): string;
  // Throws if the value was tampered with or belongs to another purpose or key
  decrypt(cipherText: string, purpose: SecretPurpose): string;
}

export function createSecretBox(authSecret: string): SecretBox {
  const key = Buffer.from(hkdfSync("sha256", authSecret, "", "c2r/secret-box/v1", 32));

  return {
    encrypt(plainText, purpose) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv).setAAD(Buffer.from(purpose));
      const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
      const parts = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url"));
      return [VERSION, ...parts].join(".");
    },
    decrypt(cipherText, purpose) {
      const [version, iv, tag, encrypted] = cipherText.split(".");
      if (version !== VERSION || !iv || !tag || encrypted === undefined) {
        throw new Error("Malformed encrypted value");
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"))
        .setAAD(Buffer.from(purpose))
        .setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
