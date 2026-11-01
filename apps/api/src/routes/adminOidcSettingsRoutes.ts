import { API_PATHS, type OidcSettings } from "@c2r/shared";
import { Router, type Request } from "express";
import { HttpError } from "../http/errors.js";
import type { StoredOidcSettings } from "../stores/types.js";
import type { RouteContext } from "./context.js";
import { buildRedirectUri } from "./redirectUri.js";
import { parseOidcSettings } from "./validation.js";

export function createAdminOidcSettingsRouter(context: RouteContext): Router {
  const { stores, oidcClient, secretBox, publicUrl } = context;
  const router = Router();

  function toResponse(req: Request, settings: StoredOidcSettings | null): OidcSettings {
    return {
      enabled: settings?.enabled ?? false,
      displayName: settings?.displayName ?? "",
      issuerUrl: settings?.issuerUrl ?? "",
      clientId: settings?.clientId ?? "",
      clientSecretSet: Boolean(settings?.clientSecretEncrypted),
      redirectUri: buildRedirectUri(req, publicUrl),
    };
  }

  router.get(API_PATHS.adminOidcSettings, async (req, res) => {
    res.json(toResponse(req, await stores.oidcSettings.get()));
  });

  router.put(API_PATHS.adminOidcSettings, async (req, res) => {
    const { clientSecret, ...input } = parseOidcSettings(req.body);
    const stored = await stores.oidcSettings.get();
    // The stored secret only ever goes to the issuer it was entered for: a stolen admin session
    // must not be able to send it to a server of its own.
    const issuerChanged = stored !== null && stored.issuerUrl !== input.issuerUrl;
    if (issuerChanged && input.enabled && stored.clientSecretEncrypted && !clientSecret) {
      throw new HttpError(
        400,
        "Bei einer neuen Issuer-URL muss das Client-Secret neu eingegeben werden.",
      );
    }
    const kept = issuerChanged ? null : (stored?.clientSecretEncrypted ?? null);
    const clientSecretEncrypted = clientSecret
      ? secretBox.encrypt(clientSecret, "oidc-client-secret")
      : kept;
    if (input.enabled && !clientSecretEncrypted) {
      throw new HttpError(400, "Zum Aktivieren ist ein Client-Secret nötig.");
    }
    const settings: StoredOidcSettings = { ...input, clientSecretEncrypted };
    await stores.oidcSettings.save(settings);
    oidcClient.reset();
    res.json(toResponse(req, settings));
  });

  return router;
}
