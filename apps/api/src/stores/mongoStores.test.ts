import { describe, expect, it } from "vitest";
import { isMongoDuplicateKeyError } from "./mongoStores.js";

describe("isMongoDuplicateKeyError", () => {
  it("recognizes the duplicate key code only", () => {
    expect(isMongoDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isMongoDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isMongoDuplicateKeyError(new Error("other"))).toBe(false);
    expect(isMongoDuplicateKeyError(null)).toBe(false);
  });
});
