import { API_PATHS, type AuthProvidersResponse } from "@c2r/shared";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { verifyPassword } from "../auth/passwords.js";
import { currentUser, endSession, startSession } from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";
import type { RouteContext } from "./context.js";
import { toPublicUser } from "./publicUser.js";
import { parseLogin } from "./validation.js";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const INVALID_LOGIN_MESSAGE = "Benutzername oder Passwort ist falsch.";

export function createAuthRouter(context: RouteContext): Router {
  const { stores, secureCookies, requireSessionAllowingPasswordChange, credentialLock } = context;
  const router = Router();

  // One instance per router, so that apps do not share their counters
  const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_MAX_FAILURES,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Zu viele fehlgeschlagene Versuche. Bitte später erneut versuchen." },
  });

  router.get(API_PATHS.authProviders, async (_req, res) => {
    const settings = await stores.oidcSettings.get();
    const body: AuthProvidersResponse = {
      oidc: settings?.enabled ? { displayName: settings.displayName } : null,
    };
    res.json(body);
  });

  router.post(API_PATHS.login, loginLimiter, async (req, res) => {
    const { username, password } = parseLogin(req.body);
    const user = await stores.users.findByUsername(username);
    // IAM users have no password: they run through the same check and fail the same way
    const storedHash = user?.source === "local" ? user.passwordHash : null;
    const valid = await verifyPassword(password, storedHash);
    if (!user || !valid) throw new HttpError(401, INVALID_LOGIN_MESSAGE);

    const current = await credentialLock(async () => {
      // A password change during the verification has already ended all sessions of the old
      // password, so a session opened with it now would outlive the change.
      const fresh = await stores.users.findById(user.id);
      if (fresh?.passwordHash !== storedHash) throw new HttpError(401, INVALID_LOGIN_MESSAGE);
      await startSession(stores.sessions, res, fresh.id, secureCookies);
      return fresh;
    });
    res.json(toPublicUser(current));
  });

  router.post(API_PATHS.logout, async (req, res) => {
    await endSession(stores.sessions, req, res, secureCookies);
    res.status(204).end();
  });

  router.get(API_PATHS.me, requireSessionAllowingPasswordChange, (_req, res) => {
    res.json(toPublicUser(currentUser(res)));
  });

  return router;
}
