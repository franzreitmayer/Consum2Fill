import type { User } from "@c2r/shared";
import type { StoredUser } from "../stores/types.js";

// Names every field explicitly, so that password hashes cannot slip into a response.
export function toPublicUser(user: StoredUser): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    source: user.source,
    mustChangePassword: user.mustChangePassword,
  };
}
