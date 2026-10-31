import path from "node:path";
import { API_PATHS, type HealthResponse, type HelloResponse } from "@c2r/shared";
import express, { type Express } from "express";

export interface AppOptions {
  isDbConnected: () => boolean;
  webDistDir?: string | undefined;
}

export function createApp({ isDbConnected, webDistDir }: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get(API_PATHS.hello, (_req, res) => {
    const body: HelloResponse = { message: "Hello from consumption2refill" };
    res.json(body);
  });

  app.get(API_PATHS.health, (_req, res) => {
    const connected = isDbConnected();
    const body: HealthResponse = {
      status: connected ? "ok" : "degraded",
      db: connected ? "connected" : "disconnected",
    };
    res.status(connected ? 200 : 503).json(body);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  if (webDistDir) {
    const root = path.resolve(webDistDir);
    app.use(express.static(root));
    app.get("/{*path}", (_req, res) => {
      res.sendFile("index.html", { root });
    });
  }

  return app;
}
