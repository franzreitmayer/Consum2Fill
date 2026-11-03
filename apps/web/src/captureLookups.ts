import type { Material, StorageLocation, User } from "@c2r/shared";
import type { ResourceFailure } from "./useApiResource";

/** The visible outcome of loading the lists again on request. */
export type LookupCheck =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked" }
  | Pick<ResourceFailure, "kind" | "message">;

/** The lists of the capture, loaded once for consumptions and orders. */
export interface CaptureLookups {
  locations: StorageLocation[];
  materials: Material[];
  /** Loads both lists again in the background. */
  refresh: () => void;
  /** Like refresh, but reports the outcome in check, for the hint about missing master data. */
  runCheck: () => void;
  check: LookupCheck;
}

/** Same rule as the API: only ADMIN and MANAGER read and write orders. */
export function canManageOrders(user: User): boolean {
  return user.role === "ADMIN" || user.role === "MANAGER";
}
