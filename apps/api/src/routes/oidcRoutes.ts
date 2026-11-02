import { API_PATHS } from "@c2r/shared";
import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { startSession } from "../auth/sessions.js";
import { readCookie } from "../http/cookies.js";
import type { OidcConnection } from "../oidc/oidcClient.js";
import { provisionOidcUser } from "../oidc/provisionUser.js";
import type { RouteContext } from "./context.js";
import { buildRedirectUri } from "./redirectUri.js";

export const OIDC_STATE_COOKIE = "c2r_oidc";
const OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const OIDC_COOKIE_PATH = "/api/auth/oidc";
const FAILURE_REDIRECT = "/?loginError=oidc";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_REQUESTS = 20;

interface LoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}

export function createOidcRouter(context: RouteContext): Router {
  const { stores, oidcClient, secretBox, publicUrl, secureCookies } = context;
  const router = Router();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    path: OIDC_COOKIE_PATH,
    secure: secureCookies,
  } as const;

  async function loadConnection(): Promise<OidcConnection> {
    const settings = await stores.oidcSettings.get();
    if (!settings?.enabled || !settings.clientSecretEncrypted) {
      throw new Error("OIDC is not enabled");
    }
    return {
      issuerUrl: settings.issuerUrl,
      clientId: settings.clientId,
      clientSecret: secretBox.decrypt(settings.clientSecretEncrypted, "oidc-client-secret"),
    };
  }

  function readLoginState(req: Request): LoginState {
    const cookie = readCookie(req, OIDC_STATE_COOKIE);
    if (!cookie) throw new Error("OIDC state cookie is missing");
    const loginState = JSON.parse(secretBox.decrypt(cookie, "oidc-login-state")) as LoginState;
    if (loginState.expiresAt <= Date.now()) throw new Error("OIDC state cookie has expired");
    return loginState;
  }

  function fail(res: Response, err: unknown): void {
    console.error("OIDC login failed:", err);
    res.redirect(302, FAILURE_REDIRECT);
  }

  // A browser navigation, so that the client gets the usual redirect instead of a JSON error
  const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_MAX_REQUESTS,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      console.warn("OIDC login rate limit exceeded");
      res.redirect(302, FAILURE_REDIRECT);
    },
  });

  router.get(API_PATHS.oidcLogin, loginLimiter, async (req, res) => {
    try {
      const redirectUri = buildRedirectUri(req, publicUrl);
      const { url, state, nonce, codeVerifier } = await oidcClient.startAuthorization(
        await loadConnection(),
        redirectUri,
      );
      const loginState: LoginState = {
        state,
        nonce,
        codeVerifier,
        redirectUri,
        expiresAt: Date.now() + OIDC_STATE_TTL_MS,
      };
      res.cookie(
        OIDC_STATE_COOKIE,
        secretBox.encrypt(JSON.stringify(loginState), "oidc-login-state"),
        { ...cookieOptions, maxAge: OIDC_STATE_TTL_MS },
      );
      res.redirect(302, url);
    } catch (err) {
      fail(res, err);
    }
  });

  router.get(API_PATHS.oidcCallback, async (req, res) => {
    res.clearCookie(OIDC_STATE_COOKIE, cookieOptions);
    try {
      const { state, nonce, codeVerifier, redirectUri } = readLoginState(req);
      if (req.query.state !== state) throw new Error("OIDC state does not match");

      const currentUrl = new URL(redirectUri);
      currentUrl.search = new URL(req.originalUrl, currentUrl).search;
      const claims = await oidcClient.finishAuthorization(await loadConnection(), {
        currentUrl,
        redirectUri,
        state,
        nonce,
        codeVerifier,
      });
      const user = await provisionOidcUser(stores.users, claims);
      await startSession(stores.sessions, res, user.id, secureCookies);
      res.redirect(302, "/");
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
