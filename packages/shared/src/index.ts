// Mirrors docs/api/openapi.yaml, which is the binding contract.

export const API_PATHS = {
  hello: "/api/hello",
  health: "/api/health",
  authProviders: "/api/auth/providers",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  ownPassword: "/api/auth/password",
  oidcLogin: "/api/auth/oidc/login",
  oidcCallback: "/api/auth/oidc/callback",
  adminUsers: "/api/admin/users",
  adminOidcSettings: "/api/admin/oidc-settings",
  materials: "/api/materials",
  storageLocations: "/api/storage-locations",
  consumptions: "/api/consumptions",
  orders: "/api/orders",
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
  mustChangePassword: boolean;
}

export interface ChangeOwnPasswordRequest {
  currentPassword: string;
  newPassword: string;
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

export const DEFAULT_UNIT = "Stück";

interface DomainRecord {
  id: string;
  number: number;
  createdAt: string;
  updatedAt: string;
}

export interface Material extends DomainRecord {
  name: string;
  unit: string;
}

export interface CreateMaterialRequest {
  name: string;
  unit?: string;
}

export interface UpdateMaterialRequest {
  name?: string;
  unit?: string;
}

export interface StorageLocation extends DomainRecord {
  name: string;
}

export interface CreateStorageLocationRequest {
  name: string;
}

export interface UpdateStorageLocationRequest {
  name?: string;
}

export interface Movement extends DomainRecord {
  storageLocationId: string;
  materialId: string;
  quantity: number;
}

export interface CreateMovementRequest {
  storageLocationId: string;
  materialId: string;
  quantity: number;
}

export interface UpdateMovementRequest {
  storageLocationId?: string;
  materialId?: string;
  quantity?: number;
}

export type Consumption = Movement;
export type Order = Movement;
