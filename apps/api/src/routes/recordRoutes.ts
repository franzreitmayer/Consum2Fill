import type { Role } from "@c2r/shared";
import { Router } from "express";
import { requireRole } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import { DuplicateKeyError, type RecordStore, type StoredRecord } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { parseGuid } from "./validation.js";

const READ_METHODS = new Set(["GET", "HEAD"]);

export interface RecordRouterOptions<Fields extends object> {
  path: string;
  store: RecordStore<Fields>;
  writeRoles: readonly Role[];
  notFoundMessage: string;
  // Parsers return checked primitives only; they run before the lock is taken.
  parseCreate: (body: unknown) => Fields;
  parseUpdate: (body: unknown) => Partial<Fields>;
  // Set for entities with a unique field
  duplicateMessage?: string;
  // Both run inside the lock, in one step with the write that depends on them.
  beforeWrite?: (fields: Partial<Fields>) => Promise<void>;
  beforeDelete?: (id: string) => Promise<void>;
}

function toResponse<Fields extends object>(record: StoredRecord<Fields>) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// CRUD for one entity. Guards apply to the whole path, not to single routes, so that every method
// answers 401 without a session and 403 without the role before anything else is looked at.
export function createRecordRouter<Fields extends object>(
  { requireSession, domainLock }: RouteContext,
  options: RecordRouterOptions<Fields>,
): Router {
  const { path, store, writeRoles, notFoundMessage, duplicateMessage } = options;
  const { parseCreate, parseUpdate, beforeWrite, beforeDelete } = options;
  const recordPath = `${path}/:id`;
  const requireWriteRole = requireRole(...writeRoles);
  const router = Router();

  function parseId(value: unknown): string {
    const id = parseGuid(value);
    if (id === null) throw new HttpError(404, notFoundMessage);
    return id;
  }

  async function findRecord(id: string): Promise<StoredRecord<Fields>> {
    const record = await store.findById(id);
    if (!record) throw new HttpError(404, notFoundMessage);
    return record;
  }

  async function mapDuplicate<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof DuplicateKeyError && duplicateMessage !== undefined) {
        throw new HttpError(409, duplicateMessage);
      }
      throw err;
    }
  }

  router.use(path, requireSession, (req, res, next) => {
    if (READ_METHODS.has(req.method)) next();
    else requireWriteRole(req, res, next);
  });

  router.get(path, async (_req, res) => {
    res.json((await store.list()).map(toResponse));
  });

  router.get(recordPath, async (req, res) => {
    res.json(toResponse(await findRecord(parseId(req.params.id))));
  });

  router.post(path, async (req, res) => {
    const fields = parseCreate(req.body);
    const created = await domainLock(async () => {
      await beforeWrite?.(fields);
      return mapDuplicate(() => store.create(fields));
    });
    res.status(201).json(toResponse(created));
  });

  router.patch(recordPath, async (req, res) => {
    const id = parseId(req.params.id);
    const patch = parseUpdate(req.body);
    const updated = await domainLock(async () => {
      await findRecord(id);
      await beforeWrite?.(patch);
      return mapDuplicate(() => store.update(id, patch));
    });
    if (!updated) throw new HttpError(404, notFoundMessage);
    res.json(toResponse(updated));
  });

  router.delete(recordPath, async (req, res) => {
    const id = parseId(req.params.id);
    await domainLock(async () => {
      await findRecord(id);
      await beforeDelete?.(id);
      if (!(await store.delete(id))) throw new HttpError(404, notFoundMessage);
    });
    res.status(204).end();
  });

  return router;
}
