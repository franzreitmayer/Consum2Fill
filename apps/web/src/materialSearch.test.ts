import type { Material } from "@c2r/shared";
import { describe, expect, it } from "vitest";
import { filterMaterials, isSearching } from "./materialSearch";

function material(name: string, description = "", tags: string[] = []): Material {
  return {
    id: name,
    number: 1,
    name,
    unit: "Stück",
    description,
    tags,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const SCREW = material("Schraube M4", "Verzinkt\nfür Holz", ["Befestigung", "Kleinteile"]);
const OIL = material("Hydrauliköl", "Für die Presse", ["Betriebsstoff"]);
const ALL = [SCREW, OIL];

function namesFor(query: string): string[] {
  return filterMaterials(ALL, query).map((found) => found.name);
}

describe("filterMaterials", () => {
  it.each([
    ["the name", "Schraube", ["Schraube M4"]],
    ["the description", "Presse", ["Hydrauliköl"]],
    ["a tag", "Betriebsstoff", ["Hydrauliköl"]],
  ])("searches %s", (_field, query, names) => {
    expect(namesFor(query)).toEqual(names);
  });

  it("ignores upper and lower case in query and fields", () => {
    expect(namesFor("sCHRAUBE")).toEqual(["Schraube M4"]);
    expect(namesFor("HYDRAULIKÖL")).toEqual(["Hydrauliköl"]);
    expect(namesFor("kleinTEILE")).toEqual(["Schraube M4"]);
  });

  it("finds parts of words", () => {
    expect(namesFor("raub")).toEqual(["Schraube M4"]);
    expect(namesFor("stoff")).toEqual(["Hydrauliköl"]);
  });

  it("requires every word, also spread over different fields", () => {
    expect(namesFor("schraube holz befestigung")).toEqual(["Schraube M4"]);
    expect(namesFor("  schraube \n  holz ")).toEqual(["Schraube M4"]);
    expect(namesFor("schraube presse")).toEqual([]);
  });

  it("does not match across the border of two fields", () => {
    expect(namesFor("M4Verzinkt")).toEqual([]);
    expect(namesFor("BefestigungKleinteile")).toEqual([]);
  });

  it("returns everything for an empty or blank query", () => {
    expect(namesFor("")).toEqual(["Schraube M4", "Hydrauliköl"]);
    expect(namesFor("   ")).toEqual(["Schraube M4", "Hydrauliköl"]);
  });
});

describe("isSearching", () => {
  it("is only true with at least one word", () => {
    expect(isSearching("")).toBe(false);
    expect(isSearching("   ")).toBe(false);
    expect(isSearching(" a ")).toBe(true);
  });
});
