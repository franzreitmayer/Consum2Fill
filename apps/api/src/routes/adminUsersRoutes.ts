import { API_PATHS } from "@c2r/shared";
import { Router } from "express";
import { hashPassword } from "../auth/passwords.js";
import { currentUser } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import { createMutex } from "../http/mutex.js";
import { DuplicateKeyError, type StoredUser } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { toPublicUser } from "./publicUser.js";
import { parseCreateUser, parsePassword, parseUpdateUser } from "./validation.js";

const USER_PATH = `${API_PATHS.adminUsers}/:id` as const;
const USER_PASSWORD_PATH = `${USER_PATH}/password` as const;
const NOT_FOUND_MESSAGE = "Der Benutzer wurde nicht gefunden.";

async function mapUsernameTaken<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof DuplicateKeyError) {
      throw new HttpError(409, "Der Benutzername ist bereits vergeben.");
    }
    throw err;
  }
}

export function createAdminUsersRouter({ stores }: RouteContext): Router {
  const { users, sessions } = stores;
  const router = Router();
  // Two admins acting at once must not be able to remove each other
  const adminChange = createMutex();

  async function findUser(id: string): Promise<StoredUser> {
    const user = await users.findById(id);
    if (!user) throw new HttpError(404, NOT_FOUND_MESSAGE);
    return user;
  }

  // A local administrator stays, so that a failing identity provider cannot lock everyone out.
  async function assertNotLastLocalAdmin(user: StoredUser): Promise<void> {
    if (user.role === "ADMIN" && user.source === "local" && (await users.countLocalAdmins()) <= 1) {
      throw new HttpError(409, "Der letzte lokale Administrator muss erhalten bleiben.");
    }
  }

  router.get(API_PATHS.adminUsers, async (_req, res) => {
    res.json((await users.list()).map(toPublicUser));
  });

  router.post(API_PATHS.adminUsers, async (req, res) => {
    const { password, ...input } = parseCreateUser(req.body);
    const passwordHash = await hashPassword(password);
    const user = await mapUsernameTaken(() =>
      users.create({ ...input, email: input.email ?? null, source: "local", passwordHash }),
    );
    res.status(201).json(toPublicUser(user));
  });

  router.patch(USER_PATH, async (req, res) => {
    const patch = parseUpdateUser(req.body);
    const updated = await adminChange(async () => {
      const user = await findUser(req.params.id);
      const { role, ...profile } = patch;
      if (user.source === "oidc" && Object.keys(profile).length > 0) {
        throw new HttpError(409, "Bei IAM-Benutzern kann nur die Rolle geändert werden.");
      }
      if (role && role !== "ADMIN") await assertNotLastLocalAdmin(user);
      return mapUsernameTaken(() => users.update(user.id, patch));
    });
    if (!updated) throw new HttpError(404, NOT_FOUND_MESSAGE);
    res.json(toPublicUser(updated));
  });

  router.delete(USER_PATH, async (req, res) => {
    await adminChange(async () => {
      const user = await findUser(req.params.id);
      // Compares the stored id: the path may spell the same id differently, e.g. in upper case.
      if (user.id === currentUser(res).id) {
        throw new HttpError(409, "Das eigene Konto kann nicht gelöscht werden.");
      }
      await assertNotLastLocalAdmin(user);
      await users.delete(user.id);
      await sessions.deleteByUser(user.id);
    });
    res.status(204).end();
  });

  router.put(USER_PASSWORD_PATH, async (req, res) => {
    const password = parsePassword(req.body);
    const user = await findUser(req.params.id);
    if (user.source !== "local") {
      throw new HttpError(409, "IAM-Benutzer haben kein lokales Passwort.");
    }
    await users.update(user.id, { passwordHash: await hashPassword(password) });
    await sessions.deleteByUser(user.id);
    res.status(204).end();
  });

  return router;
}
