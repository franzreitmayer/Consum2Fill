import { API_PATHS } from "@c2r/shared";
import express, { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { currentUser, startSession } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import type { RouteContext } from "./context.js";
import { toPublicUser } from "./publicUser.js";
import { parseChangeOwnPassword } from "./validation.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
// 400 instead of 401: the frontend reads a 401 as an expired session
const WRONG_PASSWORD_MESSAGE = "Das aktuelle Passwort ist falsch.";

const requireLocalUser: RequestHandler = (_req, res, next) => {
  if (currentUser(res).source !== "local") {
    throw new HttpError(409, "IAM-Benutzer haben kein lokales Passwort.");
  }
  next();
};

// Parses the body itself, after its guards, so that app.ts mounts it ahead of its own parser.
export function createOwnPasswordRouter(context: RouteContext): Router {
  const { stores, secureCookies, requireSessionAllowingPasswordChange, credentialLock } = context;
  const { users, sessions } = stores;
  const router = Router();

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
      const { id, passwordHash: verifiedHash } = currentUser(res);
      if (!(await verifyPassword(currentPassword, verifiedHash))) {
        throw new HttpError(400, WRONG_PASSWORD_MESSAGE);
      }
      if (newPassword === currentPassword) {
        throw new HttpError(400, "Das neue Passwort muss sich vom aktuellen unterscheiden.");
      }
      const passwordHash = await hashPassword(newPassword);

      const updated = await credentialLock(async () => {
        const user = await users.findById(id);
        if (!user) throw new HttpError(401, "Nicht angemeldet.");
        // The verified password has been replaced in the meantime, by a change or an administrator
        if (user.passwordHash !== verifiedHash) throw new HttpError(400, WRONG_PASSWORD_MESSAGE);
        const changed = await users.update(id, { passwordHash, mustChangePassword: false });
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
