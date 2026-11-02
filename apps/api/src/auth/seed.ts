import type { UserStore } from "../stores/types.js";
import { hashPassword, verifyPassword } from "./passwords.js";

const DEFAULT_USERS = [
  { username: "admin", password: "admin", displayName: "Administrator", role: "ADMIN" },
  { username: "manager", password: "manager", displayName: "Manager", role: "MANAGER" },
  { username: "user", password: "user", displayName: "Benutzer", role: "USER" },
] as const;

export async function seedDefaultUsers(users: UserStore): Promise<boolean> {
  if ((await users.count()) > 0) return false;

  for (const { password, ...user } of DEFAULT_USERS) {
    await users.create({
      ...user,
      email: null,
      source: "local",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    });
  }
  console.warn(
    "Default users admin, manager and user were created with their default passwords. Change these passwords now.",
  );
  return true;
}

// Catches installations seeded before mustChangePassword existed. Returns the affected usernames.
export async function flagDefaultPasswords(users: UserStore): Promise<string[]> {
  const flagged: string[] = [];
  for (const { username, password } of DEFAULT_USERS) {
    const user = await users.findByUsername(username);
    if (user?.source !== "local" || user.mustChangePassword) continue;
    if (await verifyPassword(password, user.passwordHash)) {
      await users.update(user.id, { mustChangePassword: true });
      flagged.push(username);
    }
  }
  if (flagged.length > 0) {
    console.warn(`Default passwords are still in use and must be changed: ${flagged.join(", ")}`);
  }
  return flagged;
}
