import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const base = { MONGODB_URI: "mongodb://db/test", AUTH_SECRET: "secret" };

describe("loadConfig", () => {
  it("requires AUTH_SECRET", () => {
    expect(() => loadConfig({ MONGODB_URI: base.MONGODB_URI })).toThrow(/AUTH_SECRET/);
  });

  it.each(["changeme-generate-your-own-secret-value", "short"])(
    "rejects the weak AUTH_SECRET %s in production only",
    (AUTH_SECRET) => {
      expect(() => loadConfig({ ...base, AUTH_SECRET, NODE_ENV: "production" })).toThrow(
        /AUTH_SECRET/,
      );
      expect(loadConfig({ ...base, AUTH_SECRET }).authSecret).toBe(AUTH_SECRET);
    },
  );

  it("requires MONGODB_URI", () => {
    expect(() => loadConfig({ AUTH_SECRET: base.AUTH_SECRET })).toThrow(/MONGODB_URI/);
  });

  it("treats an empty PUBLIC_URL as unset", () => {
    expect(loadConfig({ ...base, PUBLIC_URL: "" }).publicUrl).toBeUndefined();
    expect(loadConfig(base).publicUrl).toBeUndefined();
  });

  it("drops a trailing slash from PUBLIC_URL", () => {
    const config = loadConfig({ ...base, PUBLIC_URL: "https://refill.example.org/" });

    expect(config.publicUrl).toBe("https://refill.example.org");
  });
});
