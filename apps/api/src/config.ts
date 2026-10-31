export interface Config {
  port: number;
  mongoUri: string;
  webDistDir: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set, see .env.example");
  }
  return {
    port: Number(env.PORT ?? 3001),
    mongoUri,
    webDistDir: env.WEB_DIST_DIR,
  };
}
