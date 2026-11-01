import type { RequestHandler } from "express";
import type { SecretBox } from "../auth/secretBox.js";
import type { OidcClientPort } from "../oidc/oidcClient.js";
import type { Stores } from "../stores/types.js";

export interface RouteContext {
  stores: Stores;
  oidcClient: OidcClientPort;
  secretBox: SecretBox;
  publicUrl: string | undefined;
  secureCookies: boolean;
  requireSession: RequestHandler;
}
