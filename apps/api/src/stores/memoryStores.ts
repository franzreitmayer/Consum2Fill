import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  ConsumptionFields,
  DataImportStore,
  MaterialFields,
  MovementFields,
  MovementStore,
  OidcSettingsStore,
  RecordStore,
  SessionStore,
  StorageLocationFields,
  StoredOidcSettings,
  StoredRecord,
  StoredSession,
  StoredUser,
  Stores,
  UserStore,
} from "./types.js";
import { DuplicateKeyError } from "./types.js";

// In-memory stores for tests. They enforce the same unique keys as the Mongoose models.

function createMemoryUserStore(): UserStore {
  const users = new Map<string, StoredUser>();
  const all = () => [...users.values()];
  const copy = (user: StoredUser | undefined) => (user ? structuredClone(user) : null);

  function assertFree(candidate: StoredUser): void {
    const taken = all().some(
      (user) =>
        user.id !== candidate.id &&
        (user.username === candidate.username ||
          (candidate.source === "oidc" &&
            user.oidcIssuer === candidate.oidcIssuer &&
            user.oidcSubject === candidate.oidcSubject)),
    );
    if (taken) throw new DuplicateKeyError();
  }

  return {
    count: async () => users.size,
    countByRole: async (role) => all().filter((user) => user.role === role).length,
    countLocalAdmins: async () =>
      all().filter((user) => user.role === "ADMIN" && user.source === "local").length,
    list: async () =>
      all()
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((user) => structuredClone(user)),
    // Like MongoDB, which reads an ObjectId regardless of the case of its hex digits
    findById: async (id) => copy(users.get(id.toLowerCase())),
    findByUsername: async (username) => copy(all().find((user) => user.username === username)),
    findByOidcIdentity: async (issuer, subject) =>
      copy(all().find((user) => user.oidcIssuer === issuer && user.oidcSubject === subject)),
    async create(input) {
      const user: StoredUser = {
        passwordHash: null,
        oidcIssuer: null,
        oidcSubject: null,
        mustChangePassword: false,
        ...input,
        id: randomBytes(12).toString("hex"),
      };
      assertFree(user);
      users.set(user.id, user);
      return structuredClone(user);
    },
    async update(id, patch) {
      const existing = users.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      assertFree(updated);
      users.set(id, updated);
      return structuredClone(updated);
    },
    delete: async (id) => users.delete(id),
  };
}

function createMemorySessionStore(): SessionStore & { all(): StoredSession[] } {
  const sessions = new Map<string, StoredSession>();
  return {
    all: () => [...sessions.values()],
    async create(session) {
      sessions.set(session.tokenHash, session);
    },
    findByTokenHash: async (tokenHash) => sessions.get(tokenHash) ?? null,
    async delete(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteByUser(userId) {
      for (const session of sessions.values()) {
        if (session.userId === userId) sessions.delete(session.tokenHash);
      }
    },
  };
}

function createMemoryOidcSettingsStore(): OidcSettingsStore {
  let stored: StoredOidcSettings | null = null;
  return {
    get: async () => stored,
    async save(settings) {
      stored = settings;
    },
  };
}

// Behaves like the Mongo store: the counter advances even if the unique key then rejects the
// record, it survives deletions, and updatedAt only moves on a real change. withDefaults fills in
// fields a stored record may lack, as the Mongo store does for older documents. Everything going in
// or out is copied, so that no caller shares an array with the store.
function createMemoryRecordStore<Fields extends object>(
  uniqueField?: keyof Fields,
  withDefaults: (fields: Fields) => Fields = (fields) => fields,
): RecordStore<Fields> {
  const records = new Map<string, StoredRecord<Fields>>();
  let counter = 0;

  const read = (record: StoredRecord<Fields>): StoredRecord<Fields> =>
    structuredClone({ ...record, ...withDefaults(record) });

  function assertFree(id: string, fields: Fields): void {
    if (uniqueField === undefined) return;
    const taken = [...records.values()].some(
      (record) => record.id !== id && record[uniqueField] === fields[uniqueField],
    );
    if (taken) throw new DuplicateKeyError();
  }

  return {
    list: async () => [...records.values()].sort((a, b) => a.number - b.number).map(read),
    async findById(id) {
      const record = records.get(id);
      return record ? read(record) : null;
    },
    async create(fields) {
      counter += 1;
      const now = new Date();
      const record: StoredRecord<Fields> = {
        ...structuredClone(fields),
        id: randomUUID(),
        number: counter,
        createdAt: now,
        updatedAt: now,
      };
      assertFree(record.id, fields);
      records.set(record.id, record);
      return read(record);
    },
    async update(id, patch) {
      const stored = records.get(id);
      if (!stored) return null;
      const existing = read(stored);
      const changed = (Object.keys(patch) as (keyof Fields)[]).some(
        (key) => !isDeepStrictEqual(patch[key], existing[key]),
      );
      if (!changed) return existing;
      const updated: StoredRecord<Fields> = {
        ...existing,
        ...structuredClone(patch),
        id: existing.id,
        number: existing.number,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };
      assertFree(id, updated);
      records.set(id, updated);
      return read(updated);
    },
    delete: async (id) => records.delete(id),
  };
}

function createMemoryMovementStore<Fields extends MovementFields>(
  withDefaults?: (fields: Fields) => Fields,
): MovementStore<Fields> {
  const store = createMemoryRecordStore<Fields>(undefined, withDefaults);
  return {
    ...store,
    countByReference: async (reference, id) =>
      (await store.list()).filter((record) => record[reference] === id).length,
  };
}

function createMemoryDataImportStore(): DataImportStore {
  const completed = new Set<string>();
  return {
    isCompleted: async (id) => completed.has(id),
    async markCompleted(id) {
      completed.add(id);
    },
  };
}

export function createMemoryStores() {
  return {
    dataImports: createMemoryDataImportStore(),
    users: createMemoryUserStore(),
    sessions: createMemorySessionStore(),
    oidcSettings: createMemoryOidcSettingsStore(),
    materials: createMemoryRecordStore<MaterialFields>("name", (fields) => ({
      ...fields,
      description: fields.description ?? "",
      tags: fields.tags ?? [],
    })),
    storageLocations: createMemoryRecordStore<StorageLocationFields>("name"),
    consumptions: createMemoryMovementStore<ConsumptionFields>((fields) => ({
      ...fields,
      createdBy: fields.createdBy ?? null,
    })),
    orders: createMemoryMovementStore<MovementFields>(),
  } satisfies Stores;
}
