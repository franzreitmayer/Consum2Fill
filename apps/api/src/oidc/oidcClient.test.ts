import { describe, expect, it } from "vitest";
import { createOpenIdClient, type OidcConnection } from "./oidcClient.js";

const REDIRECT_URI = "http://refill.test/api/auth/oidc/callback";

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// A minimal provider behind a fake fetch, so that the real openid-client runs without a network.
function createProvider(issuer: string) {
  const provider = {
    requests: [] as { url: string; body: string }[],
    nonce: "",
    claims: {
      sub: "sub-1",
      preferred_username: "erika",
      name: "Erika Muster",
      email: "erika@example.org",
    } as object,
    async fetch(url: string, init: { body?: unknown }): Promise<Response> {
      provider.requests.push({ url, body: String(init.body ?? "") });
      if (url.endsWith("/.well-known/openid-configuration")) {
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/auth`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/certs`,
          id_token_signing_alg_values_supported: ["RS256"],
        });
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = [
        encode({ alg: "RS256", typ: "JWT" }),
        encode({
          iss: issuer,
          aud: "c2r",
          iat: now,
          exp: now + 60,
          nonce: provider.nonce,
          ...provider.claims,
        }),
        "signature",
      ].join(".");
      return Response.json({ access_token: "at", token_type: "Bearer", id_token: idToken });
    },
  };
  return provider;
}

function connectionFor(issuerUrl: string): OidcConnection {
  return { issuerUrl, clientId: "c2r", clientSecret: "secret" };
}

async function runFlow(issuer: string, claims?: object) {
  const provider = createProvider(issuer);
  if (claims) provider.claims = claims;
  const client = createOpenIdClient(provider.fetch);
  const connection = connectionFor(issuer);
  const auth = await client.startAuthorization(connection, REDIRECT_URI);
  provider.nonce = auth.nonce;
  const currentUrl = new URL(REDIRECT_URI);
  currentUrl.searchParams.set("code", "the-code");
  currentUrl.searchParams.set("state", auth.state);
  const result = await client.finishAuthorization(connection, {
    currentUrl,
    redirectUri: REDIRECT_URI,
    state: auth.state,
    nonce: auth.nonce,
    codeVerifier: auth.codeVerifier,
  });
  return { provider, auth, result };
}

describe("createOpenIdClient", () => {
  const issuer = "https://idp.example/realms/test";

  it("builds an authorization URL with PKCE, state, nonce and scope", async () => {
    const provider = createProvider(issuer);
    const client = createOpenIdClient(provider.fetch);

    const auth = await client.startAuthorization(connectionFor(issuer), REDIRECT_URI);

    const { origin, pathname, searchParams } = new URL(auth.url);
    expect(`${origin}${pathname}`).toBe(`${issuer}/auth`);
    expect(Object.fromEntries(searchParams)).toMatchObject({
      client_id: "c2r",
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid profile email",
      code_challenge_method: "S256",
      state: auth.state,
      nonce: auth.nonce,
    });
    expect(searchParams.get("code_challenge")).toBeTruthy();
    expect(auth.url).not.toContain(auth.codeVerifier);
  });

  it("exchanges the code and maps the claims", async () => {
    const { provider, auth, result } = await runFlow(issuer);

    expect(result).toEqual({
      issuer,
      subject: "sub-1",
      preferredUsername: "erika",
      name: "Erika Muster",
      email: "erika@example.org",
    });
    const tokenRequest = provider.requests.find((entry) => entry.url.endsWith("/token"));
    const body = new URLSearchParams(tokenRequest?.body);
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe(auth.codeVerifier);
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("maps missing claims to null", async () => {
    const { result } = await runFlow(issuer, { sub: "sub-2" });

    expect(result).toMatchObject({
      subject: "sub-2",
      preferredUsername: null,
      name: null,
      email: null,
    });
  });

  it("accepts plain http for an http issuer", async () => {
    const { result } = await runFlow("http://keycloak.test/realms/test");

    expect(result.subject).toBe("sub-1");
  });

  it("rejects a wrong nonce in the ID token", async () => {
    const provider = createProvider(issuer);
    const client = createOpenIdClient(provider.fetch);
    const connection = connectionFor(issuer);
    const auth = await client.startAuthorization(connection, REDIRECT_URI);
    provider.nonce = "another-nonce";
    const currentUrl = new URL(REDIRECT_URI);
    currentUrl.searchParams.set("code", "the-code");
    currentUrl.searchParams.set("state", auth.state);

    await expect(
      client.finishAuthorization(connection, {
        currentUrl,
        redirectUri: REDIRECT_URI,
        state: auth.state,
        nonce: auth.nonce,
        codeVerifier: auth.codeVerifier,
      }),
    ).rejects.toThrow();
  });

  it("caches the discovery until reset", async () => {
    const provider = createProvider(issuer);
    const client = createOpenIdClient(provider.fetch);
    const connection = connectionFor(issuer);
    const discoveries = () =>
      provider.requests.filter((entry) => entry.url.includes(".well-known")).length;

    await client.startAuthorization(connection, REDIRECT_URI);
    await client.startAuthorization(connection, REDIRECT_URI);
    expect(discoveries()).toBe(1);

    client.reset();
    await client.startAuthorization(connection, REDIRECT_URI);
    expect(discoveries()).toBe(2);
  });
});
