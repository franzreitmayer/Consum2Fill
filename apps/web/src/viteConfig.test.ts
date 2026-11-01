import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("vite dev proxy", () => {
  it("keeps the browser's Host header, which the OIDC redirect URI is built from", () => {
    // The string shorthand would imply changeOrigin: true and point Keycloak at the API port.
    const proxy = config.server?.proxy?.["/api"];
    expect(proxy).toBeTypeOf("object");
    expect(proxy).not.toHaveProperty("changeOrigin", true);
  });
});
