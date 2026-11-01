import type { Role, User } from "@c2r/shared";

export interface StoredUser extends User {
  passwordHash: string | null;
  oidcIssuer: string | null;
  oidcSubject: string | null;
}

interface NewUserBase {
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
}

export interface NewLocalUser extends NewUserBase {
  source: "local";
  passwordHash: string;
}

export interface NewOidcUser extends NewUserBase {
  source: "oidc";
  oidcIssuer: string;
  oidcSubject: string;
}

export type NewUser = NewLocalUser | NewOidcUser;

export interface UserPatch {
  username?: string;
  displayName?: string;
  email?: string | null;
  role?: Role;
  passwordHash?: string;
}

// Thrown by user stores for a username or OIDC identity that already exists
export class DuplicateKeyError extends Error {
  constructor() {
    super("Duplicate key");
  }
}

export interface UserStore {
  count(): Promise<number>;
  countByRole(role: Role): Promise<number>;
  countLocalAdmins(): Promise<number>;
  list(): Promise<StoredUser[]>;
  findById(id: string): Promise<StoredUser | null>;
  findByUsername(username: string): Promise<StoredUser | null>;
  findByOidcIdentity(issuer: string, subject: string): Promise<StoredUser | null>;
  create(user: NewUser): Promise<StoredUser>;
  update(id: string, patch: UserPatch): Promise<StoredUser | null>;
  delete(id: string): Promise<boolean>;
}

export interface StoredSession {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export interface SessionStore {
  create(session: StoredSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  delete(tokenHash: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}

export interface StoredOidcSettings {
  enabled: boolean;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecretEncrypted: string | null;
}

export interface OidcSettingsStore {
  get(): Promise<StoredOidcSettings | null>;
  save(settings: StoredOidcSettings): Promise<void>;
}

export interface Stores {
  users: UserStore;
  sessions: SessionStore;
  oidcSettings: OidcSettingsStore;
}
