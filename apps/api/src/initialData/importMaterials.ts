import { isDeepStrictEqual } from "node:util";
import { HttpError } from "../http/errors.js";
import { parseCreateMaterial } from "../routes/validation.js";
import { DuplicateKeyError, type MaterialFields, type Stores } from "../stores/types.js";
import { CsvError, parseCsv } from "./parseCsv.js";

export const DIN_13232_IMPORT_ID = "din-13232";
export const DIN_13232_TAG = "DIN 13232";

const HEADER = ["Name", "Beschreibung"];

export type ImportResult =
  { status: "alreadyImported" } | { status: "imported"; created: number; skipped: number };

// Checks the whole file with the rules of the API, before anything is written
export function parseMaterialCsv(csv: string): MaterialFields[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header || !isDeepStrictEqual(header.fields, HEADER)) {
    throw new CsvError(1, `Die Kopfzeile muss genau ${HEADER.join(";")} lauten.`);
  }
  if (rows.length === 0) throw new Error("Die Datei enthält keinen Datensatz.");

  const lineByName = new Map<string, number>();
  return rows.map(({ line, fields: [name, description] }) => {
    let material: MaterialFields;
    try {
      material = parseCreateMaterial({ name, description, tags: [DIN_13232_TAG] });
    } catch (err) {
      throw err instanceof HttpError ? new CsvError(line, err.message) : err;
    }
    const firstLine = lineByName.get(material.name);
    if (firstLine !== undefined) {
      throw new CsvError(line, `Der Name „${material.name}“ steht schon in Zeile ${firstLine}.`);
    }
    lineByName.set(material.name, line);
    return material;
  });
}

// Runs as its own process next to the server, so the domainLock of the server does not cover it.
// That lock keeps a reference check and the deletion of the master record together. The import only
// inserts materials nothing can refer to yet, and never changes or deletes one. For what remains,
// the unique name index decides between equal names, and the atomic counter hands out the numbers.
export async function importMaterials(
  stores: Pick<Stores, "materials" | "dataImports">,
  readCsv: () => Promise<string>,
): Promise<ImportResult> {
  if (await stores.dataImports.isCompleted(DIN_13232_IMPORT_ID)) {
    return { status: "alreadyImported" };
  }

  const materials = parseMaterialCsv(await readCsv());

  // Looking first keeps equal names from using up numbers. Names compare as the unique index does.
  const existing = new Set((await stores.materials.list()).map(({ name }) => name));
  let created = 0;
  let skipped = 0;
  for (const material of materials) {
    if (existing.has(material.name)) {
      skipped += 1;
      continue;
    }
    try {
      await stores.materials.create(material);
      created += 1;
    } catch (err) {
      // A user or a parallel run was faster
      if (!(err instanceof DuplicateKeyError)) throw err;
      skipped += 1;
    }
  }

  await stores.dataImports.markCompleted(DIN_13232_IMPORT_ID);
  return { status: "imported", created, skipped };
}
