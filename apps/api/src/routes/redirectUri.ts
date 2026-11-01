import { API_PATHS } from "@c2r/shared";
import type { Request } from "express";

export function buildRedirectUri(req: Request, publicUrl: string | undefined): string {
  return `${publicUrl ?? `${req.protocol}://${req.get("host")}`}${API_PATHS.oidcCallback}`;
}
