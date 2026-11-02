import { API_PATHS, ROLES, type RecordCreator } from "@c2r/shared";
import { Router, type Response } from "express";
import { currentUser } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import type { ConsumptionFields, MovementFields, StoredRecord } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { createRecordRouter } from "./recordRoutes.js";
import { parseCreateMovement, parseUpdateMovement } from "./validation.js";

function creatorOf(res: Response): RecordCreator {
  const { id, displayName } = currentUser(res);
  return { id, displayName };
}

export function createMovementRouter(context: RouteContext): Router {
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
  async function assertMayChange(
    { createdBy }: StoredRecord<ConsumptionFields>,
    res: Response,
  ): Promise<void> {
    const user = await users.findById(currentUser(res).id);
    if (!user) throw new HttpError(401, "Nicht angemeldet.");
    if (user.role === "ADMIN" || user.role === "MANAGER" || createdBy?.id === user.id) return;
    throw new HttpError(403, "Nur eigene Verbräuche dürfen geändert oder gelöscht werden.");
  }

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
      writeRoles: ["ADMIN", "MANAGER"],
      notFoundMessage: "Die Bestellung wurde nicht gefunden.",
      parseCreate: parseCreateMovement,
      parseUpdate: parseUpdateMovement,
      beforeWrite: assertReferencesExist,
    }),
  );
  return router;
}
