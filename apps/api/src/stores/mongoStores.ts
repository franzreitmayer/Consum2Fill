import mongoose, { type HydratedDocument, type Model } from "mongoose";
import { ConsumptionModel } from "../models/consumption.js";
import { CounterModel } from "../models/counter.js";
import { MaterialModel, type MaterialDocument } from "../models/material.js";
import type { MovementDocument } from "../models/movement.js";
import { OIDC_SETTINGS_ID, OidcSettingsModel } from "../models/oidcSettings.js";
import { OrderModel } from "../models/order.js";
import type { RecordDocument } from "../models/record.js";
import { SessionModel } from "../models/session.js";
import { StorageLocationModel, type StorageLocationDocument } from "../models/storageLocation.js";
import { UserModel, type UserFields } from "../models/user.js";
import type {
  MaterialFields,
  MovementFields,
  MovementStore,
  OidcSettingsStore,
  RecordStore,
  SessionStore,
  StorageLocationFields,
  StoredRecord,
  StoredUser,
  Stores,
  UserStore,
} from "./types.js";
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
    // Documents from before this field have none
    mustChangePassword: doc.mustChangePassword ?? false,
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

const COUNTER_ATTEMPTS = 3;

// Two first-time upserts can both try to insert the counter document. The loser fails with a
// duplicate key on the counter, and its next attempt finds the document and increments it. This
// error stays apart from the name check in create(), so it cannot look like a taken name.
export async function nextRecordNumber(entity: string): Promise<number> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const counter = await CounterModel.findOneAndUpdate(
        { _id: entity },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: "after" },
      ).exec();
      return counter.value;
    } catch (err) {
      if (!isMongoDuplicateKeyError(err) || attempt >= COUNTER_ATTEMPTS) throw err;
    }
  }
}

// A collision on the number or the id is a server fault and must not read as a taken name.
function isDuplicateOfField(err: unknown, field: string): boolean {
  if (!isMongoDuplicateKeyError(err)) return false;
  const { keyPattern } = err as { keyPattern?: Record<string, unknown> };
  return keyPattern?.[field] !== undefined;
}

interface MongoRecordOptions<Fields extends object> {
  // Key of the counter document
  entity: string;
  uniqueField?: keyof Fields & string;
  toFields: (doc: Fields) => Fields;
}

function createMongoRecordStore<Doc extends RecordDocument & Fields, Fields extends object>(
  model: Model<Doc>,
  { entity, uniqueField, toFields }: MongoRecordOptions<Fields>,
): RecordStore<Fields> {
  function toRecord(doc: HydratedDocument<Doc>): StoredRecord<Fields> {
    // Mongoose's hydrated type cannot be resolved for a generic Doc
    const fields = doc as unknown as Doc;
    return {
      ...toFields(fields),
      id: fields._id,
      number: fields.number,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
    };
  }

  async function saveMappingName(doc: HydratedDocument<Doc>): Promise<void> {
    try {
      await doc.save();
    } catch (err) {
      throw uniqueField !== undefined && isDuplicateOfField(err, uniqueField)
        ? new DuplicateKeyError()
        : err;
    }
  }

  return {
    async list() {
      const docs = await model.find().sort({ number: 1 }).exec();
      return docs.map(toRecord);
    },
    async findById(id) {
      const doc = await model.findById(id).exec();
      return doc && toRecord(doc);
    },
    async create(fields) {
      const number = await nextRecordNumber(entity);
      const doc = new model({ ...fields, number });
      await saveMappingName(doc);
      return toRecord(doc);
    },
    async update(id, patch) {
      const doc = await model.findById(id).exec();
      if (!doc) return null;
      // save() instead of an update query, so that the schema validators see the whole document
      doc.set(patch);
      await saveMappingName(doc);
      return toRecord(doc);
    },
    async delete(id) {
      return (await model.findByIdAndDelete(id).exec()) !== null;
    },
  };
}

function toMovementFields(doc: MovementFields): MovementFields {
  return {
    storageLocationId: doc.storageLocationId,
    materialId: doc.materialId,
    quantity: doc.quantity,
  };
}

function createMongoMovementStore(model: Model<MovementDocument>, entity: string): MovementStore {
  return {
    ...createMongoRecordStore<MovementDocument, MovementFields>(model, {
      entity,
      toFields: toMovementFields,
    }),
    countByReference: (reference, id) => model.countDocuments({ [reference]: id }).exec(),
  };
}

export const mongoStores: Stores = {
  users: mongoUserStore,
  sessions: mongoSessionStore,
  oidcSettings: mongoOidcSettingsStore,
  materials: createMongoRecordStore<MaterialDocument, MaterialFields>(MaterialModel, {
    entity: "materials",
    uniqueField: "name",
    // Documents from before description and tags have neither, and the spread turns the
    // MongooseArray into a plain array.
    toFields: ({ name, unit, description, tags }) => ({
      name,
      unit,
      description: description ?? "",
      tags: [...(tags ?? [])],
    }),
  }),
  storageLocations: createMongoRecordStore<StorageLocationDocument, StorageLocationFields>(
    StorageLocationModel,
    { entity: "storageLocations", uniqueField: "name", toFields: ({ name }) => ({ name }) },
  ),
  consumptions: createMongoMovementStore(ConsumptionModel, "consumptions"),
  orders: createMongoMovementStore(OrderModel, "orders"),
};

// Waits for the unique and TTL indexes, so that they hold from the first write on.
export async function ensureMongoIndexes(): Promise<void> {
  await Promise.all([
    UserModel.init(),
    SessionModel.init(),
    OidcSettingsModel.init(),
    MaterialModel.init(),
    StorageLocationModel.init(),
    ConsumptionModel.init(),
    OrderModel.init(),
    CounterModel.init(),
  ]);
}
