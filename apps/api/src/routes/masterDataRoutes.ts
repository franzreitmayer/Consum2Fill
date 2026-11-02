import { API_PATHS, type Role } from "@c2r/shared";
import { Router } from "express";
import { HttpError } from "../http/errors.js";
import type { MovementReference } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { createRecordRouter } from "./recordRoutes.js";
import {
  parseCreateMaterial,
  parseCreateStorageLocation,
  parseUpdateMaterial,
  parseUpdateStorageLocation,
} from "./validation.js";

const MASTER_DATA_WRITE_ROLES: readonly Role[] = ["ADMIN", "MANAGER"];

export function createMasterDataRouter(context: RouteContext): Router {
  const { materials, storageLocations, consumptions, orders } = context.stores;

  function assertUnused(reference: MovementReference, message: string) {
    return async (id: string) => {
      const counts = await Promise.all([
        consumptions.countByReference(reference, id),
        orders.countByReference(reference, id),
      ]);
      if (counts.some((count) => count > 0)) throw new HttpError(409, message);
    };
  }

  const router = Router();
  router.use(
    createRecordRouter(context, {
      path: API_PATHS.materials,
      store: materials,
      writeRoles: MASTER_DATA_WRITE_ROLES,
      notFoundMessage: "Das Material wurde nicht gefunden.",
      duplicateMessage: "Der Name des Materials ist bereits vergeben.",
      parseCreate: parseCreateMaterial,
      parseUpdate: parseUpdateMaterial,
      // Sending the current unit again is no change, so a form may always send all fields.
      beforeUpdate: async (existing, { unit }) => {
        if (unit !== undefined && unit !== existing.unit) {
          await assertUnused(
            "materialId",
            "Die Mengeneinheit kann nicht geändert werden, solange ein Verbrauch oder eine Bestellung auf das Material verweist.",
          )(existing.id);
        }
      },
      beforeDelete: assertUnused(
        "materialId",
        "Das Material wird noch verwendet und kann nicht gelöscht werden.",
      ),
    }),
    createRecordRouter(context, {
      path: API_PATHS.storageLocations,
      store: storageLocations,
      writeRoles: MASTER_DATA_WRITE_ROLES,
      notFoundMessage: "Der Lagerort wurde nicht gefunden.",
      duplicateMessage: "Der Name des Lagerorts ist bereits vergeben.",
      parseCreate: parseCreateStorageLocation,
      parseUpdate: parseUpdateStorageLocation,
      beforeDelete: assertUnused(
        "storageLocationId",
        "Der Lagerort wird noch verwendet und kann nicht gelöscht werden.",
      ),
    }),
  );
  return router;
}
