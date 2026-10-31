import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectDb, disconnectDb, isDbConnected } from "./db.js";

const config = loadConfig();

await connectDb(config.mongoUri);

const app = createApp({ isDbConnected, webDistDir: config.webDistDir });
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
