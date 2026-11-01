import type { StoredUser, UserStore } from "../stores/types.js";
import { DuplicateKeyError } from "../stores/types.js";
import type { OidcClaims } from "./oidcClient.js";

async function refresh(
  users: UserStore,
  user: StoredUser,
  claims: OidcClaims,
): Promise<StoredUser> {
  const updated = await users.update(user.id, {
    displayName: claims.name ?? claims.preferredUsername ?? user.displayName,
    email: claims.email,
  });
  if (!updated) throw new Error("OIDC user disappeared during login");
  return updated;
}

// Identifies users only by (issuer, subject). A matching username or email must never link to an
// existing account, otherwise an IAM user "admin" would take over the local admin.
export async function provisionOidcUser(users: UserStore, claims: OidcClaims): Promise<StoredUser> {
  const { issuer, subject } = claims;
  const existing = await users.findByOidcIdentity(issuer, subject);
  if (existing) return refresh(users, existing, claims);

  const fallback = `oidc-${subject}`;
  const candidates = claims.preferredUsername ? [claims.preferredUsername, fallback] : [fallback];
  for (const username of candidates) {
    try {
      return await users.create({
        username,
        displayName: claims.name ?? claims.preferredUsername ?? username,
        email: claims.email,
        role: "USER",
        source: "oidc",
        oidcIssuer: issuer,
        oidcSubject: subject,
      });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
      // A parallel login of the same person may have created the account in the meantime
      const created = await users.findByOidcIdentity(issuer, subject);
      if (created) return refresh(users, created, claims);
    }
  }
  throw new Error("No free username for OIDC user");
}
