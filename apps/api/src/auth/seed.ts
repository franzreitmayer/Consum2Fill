import type { UserStore } from "../stores/types.js";
import { hashPassword } from "./passwords.js";

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
    });
  }
  console.warn(
    "Default users admin, manager and user were created with their default passwords. Change these passwords now.",
  );
  return true;
}
