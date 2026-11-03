import type { Role } from "@c2r/shared";
import express, { Router, type Response } from "express";
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
  // Without it, every signed-in user may read
  readRoles?: readonly Role[];
  notFoundMessage: string;
  // Parsers return checked primitives only; they run before the lock is taken. parseCreate also
  // gets the response, for fields the server sets from the session and never from the body.
  parseCreate: (body: unknown, res: Response) => Fields;
  parseUpdate: (body: unknown) => Partial<Fields>;
  // Set for entities with a unique field
  duplicateMessage?: string;
  // These run inside the lock, in one step with the write that depends on them. On a PATCH,
  // beforeUpdate comes first: it sees the record, so that a missing right wins over a bad reference.
  beforeWrite?: (fields: Partial<Fields>) => Promise<void>;
  beforeUpdate?: (
    existing: StoredRecord<Fields>,
    patch: Partial<Fields>,
    res: Response,
  ) => Promise<void>;
  beforeDelete?: (id: string, existing: StoredRecord<Fields>, res: Response) => Promise<void>;
}

export function toResponse<Fields extends object>(record: StoredRecord<Fields>) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// CRUD for one entity. Guards apply to the whole path, not to single routes, and run before the
// body parser, so that every method answers 401 without a session and 403 without the role before
// anything else is looked at. app.ts therefore mounts these routers ahead of its own parser. Routes
// mounted after this router under the same path pass the same guards and parser.
export function createRecordRouter<Fields extends object>(
  { requireSession, domainLock }: RouteContext,
  options: RecordRouterOptions<Fields>,
): Router {
  const { path, store, writeRoles, readRoles, notFoundMessage, duplicateMessage } = options;
  const { parseCreate, parseUpdate, beforeWrite, beforeUpdate, beforeDelete } = options;
  const recordPath = `${path}/:id`;
  const requireWriteRole = requireRole(...writeRoles);
  const requireReadRole = readRoles && requireRole(...readRoles);
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

  router.use(
    path,
    requireSession,
    (req, res, next) => {
      if (!READ_METHODS.has(req.method)) requireWriteRole(req, res, next);
      else if (requireReadRole) requireReadRole(req, res, next);
      else next();
    },
    express.json(),
  );

  router.get(path, async (_req, res) => {
    res.json((await store.list()).map(toResponse));
  });

  router.get(recordPath, async (req, res) => {
    res.json(toResponse(await findRecord(parseId(req.params.id))));
  });

  router.post(path, async (req, res) => {
    const fields = parseCreate(req.body, res);
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
      const existing = await findRecord(id);
      await beforeUpdate?.(existing, patch, res);
      await beforeWrite?.(patch);
      return mapDuplicate(() => store.update(id, patch));
    });
    if (!updated) throw new HttpError(404, notFoundMessage);
    res.json(toResponse(updated));
  });

  router.delete(recordPath, async (req, res) => {
    const id = parseId(req.params.id);
    await domainLock(async () => {
      const existing = await findRecord(id);
      await beforeDelete?.(id, existing, res);
      if (!(await store.delete(id))) throw new HttpError(404, notFoundMessage);
    });
    res.status(204).end();
  });

  return router;
}
