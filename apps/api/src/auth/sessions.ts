import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { readCookie } from "../http/cookies.js";
import { HttpError } from "../http/errors.js";
import type { SessionStore, StoredUser, UserStore } from "../stores/types.js";

export const SESSION_COOKIE = "c2r_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", secure };
}

export async function startSession(
  sessions: SessionStore,
  res: Response,
  userId: string,
  secure: boolean,
): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await sessions.create({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(secure), maxAge: SESSION_TTL_MS });
}

export async function endSession(
  sessions: SessionStore,
  req: Request,
  res: Response,
  secure: boolean,
): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await sessions.delete(hashSessionToken(token));
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure));
}

export function currentUser(res: Response): StoredUser {
  const user = res.locals.user as StoredUser | undefined;
  if (!user) throw new Error("Route is missing the session guard");
  return user;
}

// Loads the user on every request, so that role changes and deletions apply at once.
export function createRequireSession(users: UserStore, sessions: SessionStore): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await sessions.findByTokenHash(hashSessionToken(token)) : null;
    // The TTL index removes expired sessions only with a delay
    const user =
      session && session.expiresAt > new Date() ? await users.findById(session.userId) : null;
    if (!user) throw new HttpError(401, "Nicht angemeldet.");
    res.locals.user = user;
    next();
  };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (currentUser(res).role !== "ADMIN") throw new HttpError(403, "Keine Berechtigung.");
  next();
};
