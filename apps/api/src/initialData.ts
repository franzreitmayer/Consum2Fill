import { connectDb, disconnectDb } from "./db.js";
import { runInitialData } from "./initialData/runInitialData.js";
import { ensureMongoIndexes, mongoStores } from "./stores/mongoStores.js";

// Sets the code instead of calling process.exit(), so that the output reaches a pipe completely.
process.exitCode = await runInitialData({
  args: process.argv.slice(2),
  env: process.env,
  connectDb,
  disconnectDb,
  ensureIndexes: ensureMongoIndexes,
  stores: mongoStores,
  print: console.log,
  printError: console.error,
});
