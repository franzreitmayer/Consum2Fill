import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStores } from "../stores/memoryStores.js";
import { DIN_13232_IMPORT_ID } from "./importMaterials.js";
import { runInitialData, type InitialDataOptions } from "./runInitialData.js";

const URI = "mongodb://admin:geheim@db:27017/c2r";

let directory: string;
let csvPath: string;
let printed: string[];
let errors: string[];
let options: InitialDataOptions & { stores: ReturnType<typeof createMemoryStores> };

function run(overrides: Partial<InitialDataOptions> = {}) {
  return runInitialData({ ...options, ...overrides });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "c2r-initial-data-"));
  csvPath = join(directory, "daten.csv");
  await writeFile(csvPath, '﻿Name;Beschreibung\r\nÄ;"b;c"\r\nd;e\r\n');
  printed = [];
  errors = [];
  options = {
    args: [csvPath],
    // No AUTH_SECRET: the import must get by without it
    env: { MONGODB_URI: URI },
    connectDb: vi.fn(() => Promise.resolve()),
    disconnectDb: vi.fn(() => Promise.resolve()),
    ensureIndexes: vi.fn(() => Promise.resolve()),
    stores: createMemoryStores(),
    print: (message) => printed.push(message),
    printError: (message) => errors.push(message),
  };
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("runInitialData", () => {
  it("imports and disconnects with exit code 0", async () => {
    expect(await run()).toBe(0);

    expect(options.connectDb).toHaveBeenCalledWith(URI);
    expect(options.ensureIndexes).toHaveBeenCalledOnce();
    expect(options.disconnectDb).toHaveBeenCalledOnce();
    expect(printed).toEqual(["Import abgeschlossen: 2 angelegt, 0 übersprungen."]);
    expect(errors).toEqual([]);
    const [material] = await options.stores.materials.list();
    expect(material).toMatchObject({ name: "Ä", description: "b;c" });
  });

  it("reports a second run with exit code 0", async () => {
    await run();
    printed = [];

    expect(await run()).toBe(0);

    expect(printed).toEqual([
      "Die Standarddaten sind bereits importiert, es wurde nichts geändert.",
    ]);
    expect(await options.stores.materials.list()).toHaveLength(2);
  });

  it("does not look into the file once the import is completed", async () => {
    await options.stores.dataImports.markCompleted(DIN_13232_IMPORT_ID);
    await writeFile(csvPath, "kaputt");

    expect(await run()).toBe(0);
    expect(errors).toEqual([]);
  });

  it.each([[[]], [["a.csv", "b.csv"]]])("needs exactly one path, not %j", async (args) => {
    expect(await run({ args })).toBe(1);

    expect(errors[0]).toMatch(/Aufruf/);
    expect(options.connectDb).not.toHaveBeenCalled();
  });

  it("fails for a wrong path before it connects, in every state of the database", async () => {
    await options.stores.dataImports.markCompleted(DIN_13232_IMPORT_ID);
    const missing = join(directory, "fehlt.csv");

    expect(await run({ args: [missing] })).toBe(1);
    expect(await run({ args: [directory] })).toBe(1);

    expect(errors[0]).toContain("fehlt.csv");
    expect(options.connectDb).not.toHaveBeenCalled();
  });

  it("fails without MONGODB_URI", async () => {
    expect(await run({ env: {} })).toBe(1);

    expect(errors[0]).toMatch(/MONGODB_URI/);
    expect(options.connectDb).not.toHaveBeenCalled();
  });

  it("disconnects and fails for a faulty file, without writing", async () => {
    await writeFile(csvPath, "Name;Beschreibung\na\n");

    expect(await run()).toBe(1);

    expect(errors[0]).toMatch(/^Import abgebrochen: Zeile 2: /);
    expect(options.disconnectDb).toHaveBeenCalledOnce();
    expect(await options.stores.materials.list()).toEqual([]);
    expect(await options.stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)).toBe(false);
  });

  it("rejects a file that is not UTF-8", async () => {
    await writeFile(csvPath, Buffer.from([0x4e, 0x3b, 0x42, 0x0a, 0xe4, 0x3b, 0x62, 0x0a]));

    expect(await run()).toBe(1);

    expect(errors[0]).toMatch(/UTF-8/);
    expect(await options.stores.materials.list()).toEqual([]);
  });

  it.each([
    ["the exact connection string", `connect ${URI} failed`],
    ["other credentials", "connect mongodb://u:pa/ss@host:1/x failed"],
  ])("does not print %s", async (_label, message) => {
    const connectDb = vi.fn(() => Promise.reject(new Error(message)));

    expect(await run({ connectDb })).toBe(1);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Import abgebrochen: connect /);
    expect(errors[0]).not.toMatch(/geheim|pa\/ss/);
    expect(options.disconnectDb).toHaveBeenCalledOnce();
  });

  it("disconnects when creating the indexes fails", async () => {
    const ensureIndexes = vi.fn(() => Promise.reject(new Error("Index")));

    expect(await run({ ensureIndexes })).toBe(1);

    expect(options.disconnectDb).toHaveBeenCalledOnce();
  });

  it("fails when disconnecting fails after a good import", async () => {
    const disconnectDb = vi.fn(() => Promise.reject(new Error("Trennen")));

    expect(await run({ disconnectDb })).toBe(1);

    expect(printed).toHaveLength(1);
    expect(errors[0]).toMatch(/Trennen/);
  });
});
