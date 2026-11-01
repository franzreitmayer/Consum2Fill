export interface Config {
  port: number;
  mongoUri: string;
  webDistDir: string | undefined;
  authSecret: string;
  publicUrl: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set, see .env.example");
  }
  const authSecret = env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET is not set, see .env.example");
  }
  if (
    env.NODE_ENV === "production" &&
    (authSecret.startsWith("changeme") || authSecret.length < 32)
  ) {
    throw new Error("AUTH_SECRET is a placeholder or too short, see .env.example");
  }
  return {
    port: Number(env.PORT ?? 3001),
    mongoUri,
    webDistDir: env.WEB_DIST_DIR,
    authSecret,
    publicUrl: env.PUBLIC_URL?.trim().replace(/\/+$/, "") || undefined,
  };
}
