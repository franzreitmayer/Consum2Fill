import { readFile, stat } from "node:fs/promises";
import { loadMongoUri } from "../config.js";
import type { Stores } from "../stores/types.js";
import { importMaterials, type ImportResult } from "./importMaterials.js";

export interface InitialDataOptions {
  args: string[];
  env: NodeJS.ProcessEnv;
  connectDb: (uri: string) => Promise<void>;
  disconnectDb: () => Promise<void>;
  ensureIndexes: () => Promise<void>;
  stores: Pick<Stores, "materials" | "dataImports">;
  print: (message: string) => void;
  printError: (message: string) => void;
}

function errorMessage(err: unknown, secrets: string[]): string {
  let message = err instanceof Error ? err.message : String(err);
  for (const secret of secrets) message = message.split(secret).join("<MONGODB_URI>");
  // Driver messages may quote a connection string, also one that differs from the configured text
  return message.replace(/\/\/[^\s@]*@/g, "//***@");
}

async function readUtf8(path: string): Promise<string> {
  const content = await readFile(path);
  try {
    // ignoreBOM keeps the mark for the parser. Without fatal, broken bytes would be stored as U+FFFD.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    throw new Error(`Die Datei ${path} ist nicht in UTF-8 kodiert.`);
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function describe(result: ImportResult): string {
  return result.status === "alreadyImported"
    ? "Die Standarddaten sind bereits importiert, es wurde nichts geändert."
    : `Import abgeschlossen: ${result.created} angelegt, ${result.skipped} übersprungen.`;
}

// Returns the exit code. A wrong path fails in every state of the database, while the content of
// the file is only read when the import has not been completed yet.
export async function runInitialData(options: InitialDataOptions): Promise<number> {
  const { args, env, connectDb, disconnectDb, ensureIndexes, stores, print, printError } = options;

  const [path] = args;
  if (path === undefined || args.length !== 1) {
    printError("Aufruf: initialData <Pfad zur CSV-Datei>");
    return 1;
  }
  if (!(await isFile(path))) {
    printError(`Import abgebrochen: Die Datei ${path} wurde nicht gefunden.`);
    return 1;
  }

  let uri: string;
  try {
    uri = loadMongoUri(env);
  } catch (err) {
    printError(`Import abgebrochen: ${errorMessage(err, [])}`);
    return 1;
  }

  let exitCode = 0;
  try {
    await connectDb(uri);
    await ensureIndexes();
    print(describe(await importMaterials(stores, () => readUtf8(path))));
  } catch (err) {
    printError(`Import abgebrochen: ${errorMessage(err, [uri])}`);
    exitCode = 1;
  }
  try {
    await disconnectDb();
  } catch (err) {
    printError(`Die Verbindung ließ sich nicht trennen: ${errorMessage(err, [uri])}`);
    exitCode = 1;
  }
  return exitCode;
}
