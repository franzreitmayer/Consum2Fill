import mongoose from "mongoose";
import { OIDC_SETTINGS_ID, OidcSettingsModel } from "../models/oidcSettings.js";
import { SessionModel } from "../models/session.js";
import { UserModel, type UserFields } from "../models/user.js";
import type { OidcSettingsStore, SessionStore, StoredUser, Stores, UserStore } from "./types.js";
import { DuplicateKeyError } from "./types.js";

const { isObjectIdOrHexString } = mongoose;

function toStoredUser(doc: UserFields & { _id: unknown }): StoredUser {
  return {
    id: String(doc._id),
    username: doc.username,
    displayName: doc.displayName,
    email: doc.email ?? null,
    role: doc.role,
    source: doc.source,
    passwordHash: doc.passwordHash ?? null,
    oidcIssuer: doc.oidcIssuer ?? null,
    oidcSubject: doc.oidcSubject ?? null,
  };
}

export function isMongoDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === 11000;
}

async function mapDuplicateKey<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    throw isMongoDuplicateKeyError(err) ? new DuplicateKeyError() : err;
  }
}

const mongoUserStore: UserStore = {
  count: () => UserModel.countDocuments().exec(),
  countByRole: (role) => UserModel.countDocuments({ role }).exec(),
  countLocalAdmins: () => UserModel.countDocuments({ role: "ADMIN", source: "local" }).exec(),
  async list() {
    const docs = await UserModel.find().sort({ username: 1 }).exec();
    return docs.map(toStoredUser);
  },
  async findById(id) {
    if (!isObjectIdOrHexString(id)) return null;
    const doc = await UserModel.findById(id).exec();
    return doc && toStoredUser(doc);
  },
  async findByUsername(username) {
    const doc = await UserModel.findOne({ username }).exec();
    return doc && toStoredUser(doc);
  },
  async findByOidcIdentity(oidcIssuer, oidcSubject) {
    const doc = await UserModel.findOne({ oidcIssuer, oidcSubject }).exec();
    return doc && toStoredUser(doc);
  },
  async create(user) {
    const doc = await mapDuplicateKey(() => new UserModel(user).save());
    return toStoredUser(doc);
  },
  async update(id, patch) {
    if (!isObjectIdOrHexString(id)) return null;
    const doc = await UserModel.findById(id).exec();
    if (!doc) return null;
    // save() instead of an update query, so that the schema validators see the whole document
    doc.set(patch);
    await mapDuplicateKey(() => doc.save());
    return toStoredUser(doc);
  },
  async delete(id) {
    if (!isObjectIdOrHexString(id)) return false;
    return (await UserModel.findByIdAndDelete(id).exec()) !== null;
  },
};

const mongoSessionStore: SessionStore = {
  async create(session) {
    await new SessionModel(session).save();
  },
  async findByTokenHash(tokenHash) {
    const doc = await SessionModel.findOne({ tokenHash }).exec();
    return (
      doc && { tokenHash: doc.tokenHash, userId: String(doc.userId), expiresAt: doc.expiresAt }
    );
  },
  async delete(tokenHash) {
    await SessionModel.deleteOne({ tokenHash }).exec();
  },
  async deleteByUser(userId) {
    await SessionModel.deleteMany({ userId }).exec();
  },
};

const mongoOidcSettingsStore: OidcSettingsStore = {
  async get() {
    const doc = await OidcSettingsModel.findById(OIDC_SETTINGS_ID).exec();
    return (
      doc && {
        enabled: doc.enabled,
        displayName: doc.displayName,
        issuerUrl: doc.issuerUrl,
        clientId: doc.clientId,
        clientSecretEncrypted: doc.clientSecretEncrypted ?? null,
      }
    );
  },
  async save(settings) {
    await OidcSettingsModel.findByIdAndUpdate(
      OIDC_SETTINGS_ID,
      { $set: settings },
      { upsert: true, runValidators: true },
    ).exec();
  },
};

export const mongoStores: Stores = {
  users: mongoUserStore,
  sessions: mongoSessionStore,
  oidcSettings: mongoOidcSettingsStore,
};

// Waits for the unique and TTL indexes, so that they hold from the first write on.
export async function ensureMongoIndexes(): Promise<void> {
  await Promise.all([UserModel.init(), SessionModel.init(), OidcSettingsModel.init()]);
}
