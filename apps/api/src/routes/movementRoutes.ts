import { API_PATHS, ROLES, type OrderRequest, type RecordCreator, type Role } from "@c2r/shared";
import { Router, type Response } from "express";
import { currentUser } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import type {
  ConsumptionFields,
  MovementFields,
  OrderFields,
  StoredRecord,
} from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { createRecordRouter, toResponse } from "./recordRoutes.js";
import {
  parseCreateMovement,
  parseCreateOrderFromConsumptions,
  parseGuid,
  parseUpdateMovement,
} from "./validation.js";

const ORDER_ROLES: readonly Role[] = ["ADMIN", "MANAGER"];
const ORDER_NOT_FOUND = "Die Bestellung wurde nicht gefunden.";

function creatorOf(res: Response): RecordCreator {
  const { id, displayName } = currentUser(res);
  return { id, displayName };
}

function isOrderRole(role: Role): boolean {
  return ORDER_ROLES.includes(role);
}

export function createMovementRouter(context: RouteContext): Router {
  const { domainLock } = context;
  const { materials, storageLocations, consumptions, orders, users } = context.stores;

  async function assertReferencesExist({
    storageLocationId,
    materialId,
  }: Partial<MovementFields>): Promise<void> {
    if (storageLocationId !== undefined && !(await storageLocations.findById(storageLocationId))) {
      throw new HttpError(400, "Der angegebene Lagerort ist unbekannt.");
    }
    if (materialId !== undefined && !(await materials.findById(materialId))) {
      throw new HttpError(400, "Das angegebene Material ist unbekannt.");
    }
  }

  // Runs inside the lock. The session guard read the user before the request queued for the lock,
  // so the user is read again: a role taken away in the meantime must already count. User ids come
  // from the store in one spelling (ObjectId as lower-case hex), so they compare as plain text.
  async function readUserAgain(res: Response) {
    const user = await users.findById(currentUser(res).id);
    if (!user) throw new HttpError(401, "Nicht angemeldet.");
    return user;
  }

  async function assertMayChange(
    { createdBy }: StoredRecord<ConsumptionFields>,
    res: Response,
  ): Promise<void> {
    const user = await readUserAgain(res);
    if (isOrderRole(user.role) || createdBy?.id === user.id) return;
    throw new HttpError(403, "Nur eigene Verbräuche dürfen geändert oder gelöscht werden.");
  }

  async function assertMayOrder(res: Response): Promise<void> {
    if (!isOrderRole((await readUserAgain(res)).role)) {
      throw new HttpError(403, "Keine Berechtigung.");
    }
  }

  // Reads every consumption under the lock and checks it against the state the client had read.
  // Nothing is written before all checks have passed.
  async function readConsumptionsToOrder(
    requested: { id: string; updatedAt: string }[],
  ): Promise<StoredRecord<ConsumptionFields>[]> {
    const found = await Promise.all(requested.map(({ id }) => consumptions.findById(id)));
    const present = found.filter((record) => record !== null);
    if (present.length !== requested.length) {
      throw new HttpError(
        404,
        "Mindestens ein Verbrauch wurde nicht gefunden, er wurde inzwischen gelöscht.",
      );
    }
    if (
      present.some(
        (record, index) => record.updatedAt.toISOString() !== requested[index]?.updatedAt,
      )
    ) {
      throw new HttpError(
        409,
        "Mindestens ein Verbrauch wurde inzwischen geändert. Bitte die Liste neu laden.",
      );
    }
    const [first] = present;
    const mixed = present.some(
      (record) =>
        record.storageLocationId !== first?.storageLocationId ||
        record.materialId !== first?.materialId,
    );
    if (mixed) {
      throw new HttpError(
        400,
        "Alle Verbräuche einer Bestellung müssen dasselbe Material und denselben Lagerort haben.",
      );
    }
    return present;
  }

  // MongoDB runs without a replica set, so there is no transaction. If deleting a consumption
  // fails, those already deleted are put back unchanged and the order is removed again. A failure
  // during this undo is logged, and the original error is passed on either way.
  async function deleteOrUndo(
    order: StoredRecord<OrderFields>,
    taken: StoredRecord<ConsumptionFields>[],
  ): Promise<void> {
    const deleted: StoredRecord<ConsumptionFields>[] = [];
    try {
      for (const record of taken) {
        // false means it is gone already; then there is nothing to put back
        if (await consumptions.delete(record.id)) deleted.push(record);
      }
    } catch (err) {
      for (const record of deleted) {
        try {
          await consumptions.restore(record);
        } catch (undoErr) {
          console.error(`Restoring consumption ${record.id} failed:`, undoErr);
        }
      }
      try {
        await orders.delete(order.id);
      } catch (undoErr) {
        console.error(`Removing order ${order.id} failed:`, undoErr);
      }
      throw err;
    }
  }

  const ordersFromConsumptions = Router();

  // The record router for orders, mounted before this one, guards these paths as well: 401 without
  // a session, 403 without the role, and only then the body parser.
  ordersFromConsumptions.post(API_PATHS.ordersFromConsumptions, async (req, res) => {
    const { consumptions: requested, quantity } = parseCreateOrderFromConsumptions(req.body);
    const createdBy = creatorOf(res);
    const order = await domainLock(async () => {
      await assertMayOrder(res);
      const taken = await readConsumptionsToOrder(requested);
      const [first] = taken;
      if (!first) throw new Error("No consumption to order");
      const requestedBy: OrderRequest[] = taken
        .map(({ number, createdBy: requester }) => ({ number, createdBy: requester }))
        .sort((a, b) => a.number - b.number);
      const created = await orders.create({
        storageLocationId: first.storageLocationId,
        materialId: first.materialId,
        quantity,
        createdBy,
        requestedBy,
      });
      await deleteOrUndo(created, taken);
      return created;
    });
    res.status(201).json(toResponse(order));
  });

  ordersFromConsumptions.post(`${API_PATHS.orders}/:id/delivered`, async (req, res) => {
    const id = parseGuid(req.params.id);
    if (id === null) throw new HttpError(404, ORDER_NOT_FOUND);
    await domainLock(async () => {
      if (!(await orders.findById(id))) throw new HttpError(404, ORDER_NOT_FOUND);
      if (!(await orders.delete(id))) throw new HttpError(404, ORDER_NOT_FOUND);
    });
    res.status(204).end();
  });

  const router = Router();
  router.use(
    createRecordRouter(context, {
      path: API_PATHS.consumptions,
      store: consumptions,
      writeRoles: ROLES,
      notFoundMessage: "Der Verbrauch wurde nicht gefunden.",
      parseCreate: (body, res) => ({ ...parseCreateMovement(body), createdBy: creatorOf(res) }),
      parseUpdate: parseUpdateMovement,
      beforeWrite: assertReferencesExist,
      beforeUpdate: (existing, _patch, res) => assertMayChange(existing, res),
      beforeDelete: (_id, existing, res) => assertMayChange(existing, res),
    }),
    createRecordRouter(context, {
      path: API_PATHS.orders,
      store: orders,
      writeRoles: ORDER_ROLES,
      readRoles: ORDER_ROLES,
      notFoundMessage: ORDER_NOT_FOUND,
      parseCreate: (body, res) => ({
        ...parseCreateMovement(body),
        createdBy: creatorOf(res),
        requestedBy: [],
      }),
      parseUpdate: parseUpdateMovement,
      beforeWrite: assertReferencesExist,
    }),
    ordersFromConsumptions,
  );
  return router;
}
