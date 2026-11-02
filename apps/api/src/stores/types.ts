import type { Material, Movement, Role, StorageLocation, User } from "@c2r/shared";

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
  mustChangePassword?: boolean;
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
  mustChangePassword?: boolean;
}

// Thrown by stores for a username, OIDC identity or record name that already exists
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

export type MaterialFields = Pick<Material, "name" | "unit" | "description" | "tags">;
export type StorageLocationFields = Pick<StorageLocation, "name">;
export type MovementFields = Pick<Movement, "storageLocationId" | "materialId" | "quantity">;

// id and number are assigned by the store, createdAt and updatedAt maintained by it
export type StoredRecord<Fields extends object> = Fields & {
  id: string;
  number: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface RecordStore<Fields extends object> {
  // Ascending by number
  list(): Promise<StoredRecord<Fields>[]>;
  findById(id: string): Promise<StoredRecord<Fields> | null>;
  create(fields: Fields): Promise<StoredRecord<Fields>>;
  update(id: string, patch: Partial<Fields>): Promise<StoredRecord<Fields> | null>;
  delete(id: string): Promise<boolean>;
}

export type MovementReference = "storageLocationId" | "materialId";

export interface MovementStore extends RecordStore<MovementFields> {
  countByReference(reference: MovementReference, id: string): Promise<number>;
}

export interface Stores {
  users: UserStore;
  sessions: SessionStore;
  oidcSettings: OidcSettingsStore;
  materials: RecordStore<MaterialFields>;
  storageLocations: RecordStore<StorageLocationFields>;
  consumptions: MovementStore;
  orders: MovementStore;
}
