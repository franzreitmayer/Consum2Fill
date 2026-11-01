// Mirrors docs/api/openapi.yaml, which is the binding contract.

export const API_PATHS = {
  hello: "/api/hello",
  health: "/api/health",
  authProviders: "/api/auth/providers",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  oidcLogin: "/api/auth/oidc/login",
  oidcCallback: "/api/auth/oidc/callback",
  adminUsers: "/api/admin/users",
  adminOidcSettings: "/api/admin/oidc-settings",
} as const;

export function adminUserPath(id: string): string {
  return `${API_PATHS.adminUsers}/${encodeURIComponent(id)}`;
}

export function adminUserPasswordPath(id: string): string {
  return `${adminUserPath(id)}/password`;
}

export const ROLES = ["ADMIN", "MANAGER", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const MIN_PASSWORD_LENGTH = 8;

export interface HelloResponse {
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
}

export interface ErrorResponse {
  message: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  source: "local" | "oidc";
}

export interface AuthProvidersResponse {
  oidc: { displayName: string } | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  email?: string | null;
  role: Role;
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  displayName?: string;
  email?: string | null;
  role?: Role;
}

export interface SetPasswordRequest {
  password: string;
}

export interface OidcSettings {
  enabled: boolean;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecretSet: boolean;
  redirectUri: string;
}

export interface UpdateOidcSettingsRequest {
  enabled: boolean;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
}
