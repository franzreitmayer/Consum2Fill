// Mirrors docs/api/openapi.yaml, which is the binding contract.

export const API_PATHS = {
  hello: "/api/hello",
  health: "/api/health",
} as const;

export interface HelloResponse {
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
}
