import { API_PATHS } from "@c2r/shared";
import express, { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { currentUser, startSession } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import { createMutex } from "../http/mutex.js";
import type { RouteContext } from "./context.js";
import { toPublicUser } from "./publicUser.js";
import { parseChangeOwnPassword } from "./validation.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const requireLocalUser: RequestHandler = (_req, res, next) => {
  if (currentUser(res).source !== "local") {
    throw new HttpError(409, "IAM-Benutzer haben kein lokales Passwort.");
  }
  next();
};

// Parses the body itself, after its guards, so that app.ts mounts it ahead of its own parser.
export function createOwnPasswordRouter(context: RouteContext): Router {
  const { stores, secureCookies, requireSessionAllowingPasswordChange } = context;
  const { users, sessions } = stores;
  const router = Router();
  // With the old password known to two parties, only the first change may succeed. Otherwise the
  // session of the loser could outlive the deletion of all sessions.
  const passwordChange = createMutex();

  // After the guards, so that only attempts of signed-in local users count
  const failureLimiter = rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_FAILURES,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Zu viele fehlgeschlagene Versuche. Bitte später erneut versuchen." },
  });

  router.put(
    API_PATHS.ownPassword,
    requireSessionAllowingPasswordChange,
    requireLocalUser,
    failureLimiter,
    express.json(),
    async (req, res) => {
      const { currentPassword, newPassword } = parseChangeOwnPassword(req.body);
      const { id } = currentUser(res);
      const updated = await passwordChange(async () => {
        const user = await users.findById(id);
        if (!user) throw new HttpError(401, "Nicht angemeldet.");
        // 400 instead of 401: the frontend reads a 401 as an expired session
        if (!(await verifyPassword(currentPassword, user.passwordHash))) {
          throw new HttpError(400, "Das aktuelle Passwort ist falsch.");
        }
        if (newPassword === currentPassword) {
          throw new HttpError(400, "Das neue Passwort muss sich vom aktuellen unterscheiden.");
        }
        const changed = await users.update(id, {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
        });
        if (!changed) throw new HttpError(401, "Nicht angemeldet.");
        await sessions.deleteByUser(id);
        await startSession(sessions, res, id, secureCookies);
        return changed;
      });
      res.json(toPublicUser(updated));
    },
  );

  return router;
}
