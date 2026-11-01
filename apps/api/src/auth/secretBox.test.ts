import { describe, expect, it } from "vitest";
import { createSecretBox } from "./secretBox.js";

describe("secretBox", () => {
  const box = createSecretBox("auth-secret");

  it("decrypts what it encrypted", () => {
    const encrypted = box.encrypt("geheim", "oidc-client-secret");

    expect(encrypted).not.toContain("geheim");
    expect(box.decrypt(encrypted, "oidc-client-secret")).toBe("geheim");
  });

  it("uses a new IV every time", () => {
    expect(box.encrypt("geheim", "oidc-client-secret")).not.toBe(
      box.encrypt("geheim", "oidc-client-secret"),
    );
  });

  it("rejects another key, another purpose and tampering", () => {
    const encrypted = box.encrypt("geheim", "oidc-client-secret");
    const tampered = `${encrypted.slice(0, -2)}${encrypted.endsWith("AA") ? "BB" : "AA"}`;

    expect(() => createSecretBox("other").decrypt(encrypted, "oidc-client-secret")).toThrow();
    expect(() => box.decrypt(encrypted, "oidc-login-state")).toThrow();
    expect(() => box.decrypt(tampered, "oidc-client-secret")).toThrow();
  });
});
