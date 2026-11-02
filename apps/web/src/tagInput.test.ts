import { type Material, MAX_TAG_LENGTH, MAX_TAGS } from "@c2r/shared";
import { describe, expect, it } from "vitest";
import { commitTags, tagKey, tagSuggestions } from "./tagInput";

describe("commitTags", () => {
  it("adds trimmed tags and splits at commas", () => {
    expect(commitTags(["a"], "  b , c,, ")).toEqual({
      tags: ["a", "b", "c"],
      draft: "",
      message: null,
    });
  });

  it("ignores blank text without a message", () => {
    expect(commitTags(["a"], "  ")).toEqual({ tags: ["a"], draft: "", message: null });
  });

  it("drops duplicates regardless of case, keeps the first spelling and says so", () => {
    const result = commitTags(["Schraube"], " SCHRAUBE ");

    expect(result.tags).toEqual(["Schraube"]);
    expect(result.draft).toBe("");
    expect(result.message).toBe("„SCHRAUBE“ ist bereits vorhanden.");
    expect(commitTags([], "Ab, aB").tags).toEqual(["Ab"]);
  });

  it("uses the same key as the API, without locale rules", () => {
    expect(tagKey("  STRASSE ")).toBe("strasse");
    expect(tagKey("İ")).toBe("İ".toLowerCase());
  });

  it("accepts the exact limits", () => {
    const longest = "x".repeat(MAX_TAG_LENGTH);
    const almostFull = Array.from({ length: MAX_TAGS - 1 }, (_, index) => `t${index}`);

    const result = commitTags(almostFull, longest);

    expect(result.tags).toHaveLength(MAX_TAGS);
    expect(result.draft).toBe("");
    expect(result.message).toBeNull();
  });

  it("keeps a too long tag in the draft with a message and still takes the others", () => {
    const tooLong = "x".repeat(MAX_TAG_LENGTH + 1);

    const result = commitTags([], `a, ${tooLong}, b`);

    expect(result.tags).toEqual(["a", "b"]);
    expect(result.draft).toBe(tooLong);
    expect(result.message).toContain(`höchstens ${MAX_TAG_LENGTH} Zeichen`);
  });

  it("keeps tags beyond the maximum in the draft with a message", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `t${index}`);

    const result = commitTags(full, "neu, neuer");

    expect(result.tags).toEqual(full);
    expect(result.draft).toBe("neu, neuer");
    expect(result.message).toContain(`höchstens ${MAX_TAGS} Schlagworte`);
  });

  it("does not count a duplicate against a full list", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `t${index}`);

    const result = commitTags(full, "T0");

    expect(result.draft).toBe("");
    expect(result.tags).toEqual(full);
  });
});

describe("tagSuggestions", () => {
  it("collects each tag once in its first spelling, sorted", () => {
    const materials = [{ tags: ["Öl", "Kleinteile"] }, { tags: ["kleinteile", "Abfall"] }];

    expect(tagSuggestions(materials as Material[])).toEqual(["Abfall", "Kleinteile", "Öl"]);
  });
});
