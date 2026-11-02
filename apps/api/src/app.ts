import path from "node:path";
import {
  API_PATHS,
  type ErrorResponse,
  type HealthResponse,
  type HelloResponse,
} from "@c2r/shared";
import express, { type Express } from "express";
import { createSecretBox } from "./auth/secretBox.js";
import { createRequireSession, requireAdmin } from "./auth/sessions.js";
import { apiErrorHandler } from "./http/errors.js";
import { createMutex } from "./http/mutex.js";
import type { OidcClientPort } from "./oidc/oidcClient.js";
import { createAdminOidcSettingsRouter } from "./routes/adminOidcSettingsRoutes.js";
import { createAdminUsersRouter } from "./routes/adminUsersRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import type { RouteContext } from "./routes/context.js";
import { createMasterDataRouter } from "./routes/masterDataRoutes.js";
import { createMovementRouter } from "./routes/movementRoutes.js";
import { createOidcRouter } from "./routes/oidcRoutes.js";
import type { Stores } from "./stores/types.js";

export interface AppOptions {
  isDbConnected: () => boolean;
  webDistDir?: string | undefined;
  stores: Stores;
  oidcClient: OidcClientPort;
  authSecret: string;
  publicUrl?: string | undefined;
}

export function createApp({
  isDbConnected,
  webDistDir,
  stores,
  oidcClient,
  authSecret,
  publicUrl,
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  const secureCookies = publicUrl?.toLowerCase().startsWith("https") ?? false;
  // An https PUBLIC_URL means a TLS proxy in front (.env.example). Without this setting all
  // clients would share the IP of the proxy and thus one login rate limit.
  if (secureCookies) app.set("trust proxy", 1);

  const requireSession = createRequireSession(stores.users, stores.sessions);
  const context: RouteContext = {
    stores,
    oidcClient,
    secretBox: createSecretBox(authSecret),
    publicUrl,
    secureCookies,
    requireSession,
    domainLock: createMutex(),
  };

  app.use("/api", express.json());

  app.get(API_PATHS.hello, requireSession, (_req, res) => {
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

  app.use(createAuthRouter(context));
  app.use(createOidcRouter(context));

  app.use("/api/admin", requireSession, requireAdmin);
  app.use(createAdminUsersRouter(context));
  app.use(createAdminOidcSettingsRouter(context));

  app.use(createMasterDataRouter(context));
  app.use(createMovementRouter(context));

  app.use("/api", (_req, res) => {
    const body: ErrorResponse = { message: "Not found" };
    res.status(404).json(body);
  });
  app.use("/api", apiErrorHandler);

  if (webDistDir) {
    const root = path.resolve(webDistDir);
    app.use(express.static(root));
    app.get("/{*path}", (_req, res) => {
      res.sendFile("index.html", { root });
    });
  }

  return app;
}
