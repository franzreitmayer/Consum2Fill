import type { RequestHandler } from "express";
import type { SecretBox } from "../auth/secretBox.js";
import type { Mutex } from "../http/mutex.js";
import type { OidcClientPort } from "../oidc/oidcClient.js";
import type { Stores } from "../stores/types.js";

export interface RouteContext {
  stores: Stores;
  oidcClient: OidcClientPort;
  secretBox: SecretBox;
  publicUrl: string | undefined;
  secureCookies: boolean;
  requireSession: RequestHandler;
  requireSessionAllowingPasswordChange: RequestHandler;
  // One lock for all domain writes: checking a reference and writing a movement must exclude
  // checking the usage and deleting the master record, across all four entities.
  domainLock: Mutex;
  // Covers everything that depends on a stored password hash: replacing it, ending the sessions it
  // opened and opening a new session with it. Slow hashing stays outside, so that it blocks nobody;
  // whoever holds the lock therefore first checks that the hash is still the one they verified.
  credentialLock: Mutex;
}
