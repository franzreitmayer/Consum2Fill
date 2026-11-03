import {
  API_PATHS,
  type Consumption,
  type Material,
  type Order,
  type Role,
  type StorageLocation,
  type User,
} from "@c2r/shared";
import { json, type RouteHandler, stubApi } from "./stubApi";

export const TIMES = {
  createdAt: "2026-03-15T12:00:00.000Z",
  updatedAt: "2026-03-15T12:00:00.000Z",
};
export const NOON_DATE = "15.03.2026";
export const OWN_ID = "u-own";
export const ERIKA = { id: OWN_ID, displayName: "Erika Muster" };
export const MAX = { id: "u-max", displayName: "Max Beispiel" };

export function location(number: number, name: string): StorageLocation {
  return { id: `l-${number}`, number, name, ...TIMES };
}

export function material(number: number, name: string, unit = "Stück"): Material {
  return { id: `m-${number}`, number, name, unit, description: "", tags: [], ...TIMES };
}

export const MAIN = location(1, "Hauptlager");
export const CELLAR = location(2, "Keller");
export const SCREW = material(1, "Schraube");
export const OIL = material(2, "Hydrauliköl", "Liter");

export function consumption(number: number, overrides: Partial<Consumption> = {}): Consumption {
  return {
    id: `c-${number}`,
    number,
    storageLocationId: MAIN.id,
    materialId: SCREW.id,
    quantity: 1,
    createdBy: ERIKA,
    ...TIMES,
    ...overrides,
  };
}

export function order(number: number, overrides: Partial<Order> = {}): Order {
  return {
    id: `o-${number}`,
    number,
    storageLocationId: MAIN.id,
    materialId: SCREW.id,
    quantity: 1,
    createdBy: ERIKA,
    requestedBy: [],
    ...TIMES,
    ...overrides,
  };
}

export function user(role: Role): User {
  return {
    id: OWN_ID,
    username: "erika",
    displayName: "Erika Muster",
    email: null,
    role,
    source: "local",
    mustChangePassword: false,
  };
}

export const LOCATIONS_ROUTE = `GET ${API_PATHS.storageLocations}`;
export const MATERIALS_ROUTE = `GET ${API_PATHS.materials}`;
export const CONSUMPTIONS_ROUTE = `GET ${API_PATHS.consumptions}`;
export const ORDERS_ROUTE = `GET ${API_PATHS.orders}`;
export const ME_ROUTE = `GET ${API_PATHS.me}`;

/** Lists for the capture; the routes can be replaced or added to. */
export function stubCapture(routes: Record<string, RouteHandler> = {}) {
  return stubApi({
    [LOCATIONS_ROUTE]: json([MAIN, CELLAR]),
    [MATERIALS_ROUTE]: json([SCREW, OIL]),
    [CONSUMPTIONS_ROUTE]: json([]),
    [ORDERS_ROUTE]: json([]),
    ...routes,
  });
}
