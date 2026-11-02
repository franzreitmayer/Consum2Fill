import { API_PATHS, ROLES, type Role } from "@c2r/shared";
import { Router } from "express";
import { HttpError } from "../http/errors.js";
import type { MovementFields, MovementStore } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { createRecordRouter } from "./recordRoutes.js";
import { parseCreateMovement, parseUpdateMovement } from "./validation.js";

export function createMovementRouter(context: RouteContext): Router {
  const { materials, storageLocations, consumptions, orders } = context.stores;

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

  function createRouter(
    path: string,
    store: MovementStore,
    writeRoles: readonly Role[],
    notFoundMessage: string,
  ): Router {
    return createRecordRouter(context, {
      path,
      store,
      writeRoles,
      notFoundMessage,
      parseCreate: parseCreateMovement,
      parseUpdate: parseUpdateMovement,
      beforeWrite: assertReferencesExist,
    });
  }

  const router = Router();
  router.use(
    createRouter(
      API_PATHS.consumptions,
      consumptions,
      ROLES,
      "Der Verbrauch wurde nicht gefunden.",
    ),
    createRouter(
      API_PATHS.orders,
      orders,
      ["ADMIN", "MANAGER"],
      "Die Bestellung wurde nicht gefunden.",
    ),
  );
  return router;
}
