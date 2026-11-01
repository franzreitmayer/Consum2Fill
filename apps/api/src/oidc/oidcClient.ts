import * as client from "openid-client";

export interface OidcConnection {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface OidcAuthorization {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcCallback {
  currentUrl: URL;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcClaims {
  issuer: string;
  subject: string;
  preferredUsername: string | null;
  name: string | null;
  email: string | null;
}

// Port to the identity provider, replaced in tests
export interface OidcClientPort {
  startAuthorization(connection: OidcConnection, redirectUri: string): Promise<OidcAuthorization>;
  finishAuthorization(connection: OidcConnection, callback: OidcCallback): Promise<OidcClaims>;
  // Forgets cached provider metadata after the settings changed
  reset(): void;
}

const DISCOVERY_CACHE_MS = 5 * 60 * 1000;
const SCOPE = "openid profile email";

function textClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createOpenIdClient(fetchImpl?: client.CustomFetch): OidcClientPort {
  let cache: { key: string; config: client.Configuration; expiresAt: number } | undefined;

  async function configure(connection: OidcConnection): Promise<client.Configuration> {
    const key = JSON.stringify(connection);
    if (cache?.key === key && cache.expiresAt > Date.now()) return cache.config;

    const issuer = new URL(connection.issuerUrl);
    const config = await client.discovery(
      issuer,
      connection.clientId,
      connection.clientSecret,
      undefined,
      {
        // Plain http only for issuers configured that way, such as a local Keycloak
        ...(issuer.protocol === "http:" ? { execute: [client.allowInsecureRequests] } : {}),
        ...(fetchImpl ? { [client.customFetch]: fetchImpl } : {}),
      },
    );
    cache = { key, config, expiresAt: Date.now() + DISCOVERY_CACHE_MS };
    return config;
  }

  return {
    async startAuthorization(connection, redirectUri) {
      const config = await configure(connection);
      const state = client.randomState();
      const nonce = client.randomNonce();
      const codeVerifier = client.randomPKCECodeVerifier();
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: SCOPE,
        response_type: "code",
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state,
        nonce,
      });
      return { url: url.href, state, nonce, codeVerifier };
    },
    async finishAuthorization(connection, callback) {
      const config = await configure(connection);
      const tokens = await client.authorizationCodeGrant(
        config,
        callback.currentUrl,
        {
          pkceCodeVerifier: callback.codeVerifier,
          expectedState: callback.state,
          expectedNonce: callback.nonce,
          idTokenExpected: true,
        },
        { redirect_uri: callback.redirectUri },
      );
      const claims = tokens.claims();
      if (!claims) throw new Error("Token response has no ID token");
      return {
        issuer: claims.iss,
        subject: claims.sub,
        preferredUsername: textClaim(claims.preferred_username),
        name: textClaim(claims.name),
        email: textClaim(claims.email),
      };
    },
    reset() {
      cache = undefined;
    },
  };
}
