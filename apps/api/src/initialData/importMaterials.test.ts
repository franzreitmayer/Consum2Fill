import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_UNIT, MAX_DESCRIPTION_LENGTH } from "@c2r/shared";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStores } from "../stores/memoryStores.js";
import { DuplicateKeyError, type MaterialFields } from "../stores/types.js";
import {
  DIN_13232_IMPORT_ID,
  DIN_13232_TAG,
  importMaterials,
  parseMaterialCsv,
} from "./importMaterials.js";

const CSV_PATH = fileURLToPath(
  new URL("../../../../resources/data/DIN_13232_A_B_C_Einzelartikelliste.csv", import.meta.url),
);

const HEADER = "Name;Beschreibung\n";

function other(name: string): MaterialFields {
  return { name, unit: "Liter", description: "Eigenes", tags: [] };
}

let realCsv: string;
let stores: ReturnType<typeof createMemoryStores>;

function run(csv = realCsv) {
  return importMaterials(stores, () => Promise.resolve(csv));
}

beforeAll(async () => {
  realCsv = await readFile(CSV_PATH, "utf8");
});

beforeEach(() => {
  stores = createMemoryStores();
});

describe("parseMaterialCsv with the real file", () => {
  it("starts with a BOM and yields 75 records", () => {
    expect(realCsv.startsWith("﻿")).toBe(true);
    expect(parseMaterialCsv(realCsv)).toHaveLength(75);
  });

  it("reads the first and the last row, without the header", () => {
    const materials = parseMaterialCsv(realCsv);

    expect(materials[0]).toMatchObject({
      name: "Absauggerät",
      description: "Tragbares Absauggerät",
    });
    expect(materials.at(-1)).toMatchObject({
      name: "Thoraxdrainage CH 28",
      description: "Thoraxdrainage, Charrière 28",
    });
    expect(materials.some(({ name }) => name === "Name" || name.includes("﻿"))).toBe(false);
  });

  it("keeps a semicolon inside quotes", () => {
    const tube = parseMaterialCsv(realCsv).find(({ name }) => name === "Endotrachealtubus 8,0 mm");

    expect(tube?.description).toBe("Mit Cuff; Innendurchmesser 8,0 mm");
  });

  it("reads the same with CRLF", () => {
    expect(parseMaterialCsv(realCsv.replaceAll("\n", "\r\n"))).toEqual(parseMaterialCsv(realCsv));
  });
});

describe("parseMaterialCsv with a faulty file", () => {
  it.each([
    ["no header", "", /^Zeile 1: .*Kopfzeile/],
    ["another column order", "Beschreibung;Name\na;b\n", /^Zeile 1: .*Kopfzeile/],
    ["another spelling", "name;Beschreibung\na;b\n", /^Zeile 1: .*Kopfzeile/],
    ["an extra column", "Name;Beschreibung;X\na;b;c\n", /^Zeile 1: .*Kopfzeile/],
    ["no record", HEADER, /keinen Datensatz/],
    ["an empty name", `${HEADER}a;b\n   ;c\n`, /^Zeile 3: Der Name darf nicht leer/],
    ["a NUL in the name", `${HEADER}a\0b;c\n`, /^Zeile 2: Der Name enthält ungültige/],
    ["a lone surrogate in the name", `${HEADER}a\uD800;c\n`, /^Zeile 2: Der Name enthält/],
    ["a duplicate name", `${HEADER}a;b\nc;d\na;e\n`, /^Zeile 4: .*„a“.*Zeile 2/],
    ["a duplicate name after trim", `${HEADER}a;b\n a ;e\n`, /^Zeile 3: .*Zeile 2/],
    ["a wrong column count", `${HEADER}a;b\nc\n`, /^Zeile 3: .*Spalten/],
  ])("rejects %s", (_label, csv, message) => {
    expect(() => parseMaterialCsv(csv)).toThrow(message);
  });

  it("limits the description like the API", () => {
    const allowed = "x".repeat(MAX_DESCRIPTION_LENGTH);

    expect(parseMaterialCsv(`${HEADER}a;${allowed}\n`)[0]?.description).toBe(allowed);
    expect(() => parseMaterialCsv(`${HEADER}a;${allowed}x\n`)).toThrow(
      /^Zeile 2: Die Beschreibung darf höchstens/,
    );
  });

  it("allows an empty description and trims like the API", () => {
    expect(parseMaterialCsv(`${HEADER} a ;\n`)[0]).toMatchObject({ name: "a", description: "" });
  });
});

describe("importMaterials", () => {
  it("creates all 75 materials with unit and tag and sets the note", async () => {
    expect(await run()).toEqual({ status: "imported", created: 75, skipped: 0 });

    const materials = await stores.materials.list();
    expect(materials).toHaveLength(75);
    for (const material of materials) {
      expect(material.unit).toBe(DEFAULT_UNIT);
      expect(material.tags).toEqual([DIN_13232_TAG]);
    }
    expect(DEFAULT_UNIT).toBe("Stück");
    expect(DIN_13232_TAG).toBe("DIN 13232");
    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(true);
  });

  it("does nothing on a second run, and reads nothing but the note", async () => {
    await run();
    const before = await stores.materials.list();
    const list = vi.spyOn(stores.materials, "list");
    const create = vi.spyOn(stores.materials, "create");
    const markCompleted = vi.spyOn(stores.dataImports, "markCompleted");
    const readCsv = vi.fn(() => Promise.resolve(realCsv));

    expect(await importMaterials(stores, readCsv)).toEqual({ status: "alreadyImported" });

    expect(readCsv).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
    list.mockRestore();
    expect(await stores.materials.list()).toEqual(before);
  });

  it("does not bring back deleted materials", async () => {
    await run();
    for (const { id } of await stores.materials.list()) await stores.materials.delete(id);

    expect(await run()).toEqual({ status: "alreadyImported" });

    expect(await stores.materials.list()).toEqual([]);
  });

  it("leaves a material of the same name unchanged and goes on", async () => {
    const existing = await stores.materials.create(other("Stethoskop"));

    expect(await run()).toEqual({ status: "imported", created: 74, skipped: 1 });

    expect(await stores.materials.findById(existing.id)).toEqual(existing);
    expect(await stores.materials.list()).toHaveLength(75);
  });

  it("treats a name in other case as another material, like the unique index", async () => {
    await stores.materials.create(other("stethoskop"));

    expect(await run()).toEqual({ status: "imported", created: 75, skipped: 0 });
  });

  it("compares names after the trim", async () => {
    await stores.materials.create(other("a"));

    expect(await run(`${HEADER}  a  ;b\n`)).toEqual({ status: "imported", created: 0, skipped: 1 });
  });

  it("sets the note also when every name exists", async () => {
    await stores.materials.create(other("a"));

    await run(`${HEADER}a;b\n`);

    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(true);
  });

  it("continues the numbers of the stock and uses none for a skipped record", async () => {
    await stores.materials.create(other("a"));
    const removed = await stores.materials.create(other("b"));
    await stores.materials.delete(removed.id);

    await run(`${HEADER}c;x\na;x\nd;x\n`);

    const numbers = (await stores.materials.list()).map(({ name, number }) => [name, number]);
    expect(numbers).toEqual([
      ["a", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("sets no note after an abort, and a new run continues without duplicates", async () => {
    const { create } = stores.materials;
    const failure = new Error("Verbindung verloren");
    let calls = 0;
    const failing = vi.spyOn(stores.materials, "create").mockImplementation((fields) => {
      calls += 1;
      return calls === 11 ? Promise.reject(failure) : create(fields);
    });

    await expect(run()).rejects.toBe(failure);

    expect(await stores.materials.list()).toHaveLength(10);
    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(false);

    failing.mockRestore();
    expect(await run()).toEqual({ status: "imported", created: 65, skipped: 10 });

    const names = (await stores.materials.list()).map(({ name }) => name);
    expect(names).toHaveLength(75);
    expect(new Set(names).size).toBe(75);
    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(true);
  });

  it("sets no note when the only record fails", async () => {
    vi.spyOn(stores.materials, "create").mockRejectedValue(new Error("Schreibfehler"));

    await expect(run(`${HEADER}a;b\n`)).rejects.toThrow("Schreibfehler");

    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(false);
  });

  it("sets the note only after the last record", async () => {
    const markCompleted = vi.spyOn(stores.dataImports, "markCompleted");
    const create = vi.spyOn(stores.materials, "create");

    await run(`${HEADER}a;b\nc;d\n`);

    expect(markCompleted.mock.invocationCallOrder[0]).toBeGreaterThan(
      create.mock.invocationCallOrder[1] ?? Infinity,
    );
  });

  it.each([
    ["a bad last row", `${HEADER}a;b\nc\n`],
    ["a duplicate at the end", `${HEADER}a;b\nc;d\na;e\n`],
    ["an empty name at the end", `${HEADER}a;b\n;d\n`],
    ["a bad header", "Name\na\n"],
  ])("writes nothing and no note for %s", async (_label, csv) => {
    const create = vi.spyOn(stores.materials, "create");

    await expect(run(csv)).rejects.toThrow();

    expect(create).not.toHaveBeenCalled();
    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(false);
  });

  it("counts a duplicate key while creating as skipped", async () => {
    const { create } = stores.materials;
    vi.spyOn(stores.materials, "create").mockImplementation((fields) =>
      fields.name === "a" ? Promise.reject(new DuplicateKeyError()) : create(fields),
    );

    expect(await run(`${HEADER}a;b\nc;d\n`)).toEqual({
      status: "imported",
      created: 1,
      skipped: 1,
    });
    expect(await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(true);
  });

  it("loses a real race on the unique name without an error", async () => {
    // Another writer creates the name after the list was read
    const { list } = stores.materials;
    vi.spyOn(stores.materials, "list").mockImplementationOnce(async () => {
      const seen = await list();
      await stores.materials.create(other("a"));
      return seen;
    });

    expect(await run(`${HEADER}a;b\n`)).toEqual({ status: "imported", created: 0, skipped: 1 });

    const [material] = await list();
    expect(material?.unit).toBe("Liter");
  });
});

describe("the data import note in the memory store", () => {
  it("starts unset and tells imports apart", async () => {
    expect(await stores.dataImports.isCompleted("a")).toBe(false);

    await stores.dataImports.markCompleted("a");
    await stores.dataImports.markCompleted("a");

    expect(await stores.dataImports.isCompleted("a")).toBe(true);
    expect(await stores.dataImports.isCompleted("b")).toBe(false);
  });
});
