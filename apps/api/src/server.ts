import { createApp } from "./app.js";
import { flagDefaultPasswords, seedDefaultUsers } from "./auth/seed.js";
import { loadConfig } from "./config.js";
import { connectDb, disconnectDb, isDbConnected } from "./db.js";
import { createOpenIdClient } from "./oidc/oidcClient.js";
import { ensureMongoIndexes, mongoStores } from "./stores/mongoStores.js";

const config = loadConfig();

await connectDb(config.mongoUri);
await ensureMongoIndexes();
await seedDefaultUsers(mongoStores.users);
await flagDefaultPasswords(mongoStores.users);

const app = createApp({
  isDbConnected,
  webDistDir: config.webDistDir,
  stores: mongoStores,
  oidcClient: createOpenIdClient(),
  authSecret: config.authSecret,
  publicUrl: config.publicUrl,
});
const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

function shutdown(): void {
  server.close(() => {
    void disconnectDb().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
