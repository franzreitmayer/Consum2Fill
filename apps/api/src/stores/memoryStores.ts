import { randomBytes } from "node:crypto";
import type {
  OidcSettingsStore,
  SessionStore,
  StoredOidcSettings,
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

export function createMemoryStores() {
  return {
    users: createMemoryUserStore(),
    sessions: createMemorySessionStore(),
    oidcSettings: createMemoryOidcSettingsStore(),
  } satisfies Stores;
}
