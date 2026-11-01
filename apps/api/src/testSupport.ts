import type { Express } from "express";
import request from "supertest";
import { createApp, type AppOptions } from "./app.js";
import { seedDefaultUsers } from "./auth/seed.js";
import type { OidcClaims, OidcClientPort, OidcConnection } from "./oidc/oidcClient.js";
import { createMemoryStores } from "./stores/memoryStores.js";

export const AUTH_SECRET = "test-auth-secret";
export const TEST_ISSUER = "https://idp.example/realms/test";
export const FAKE_STATE = "fake-state";

// Stands in for openid-client, so that the routes run without a provider
export interface FakeOidcClient extends OidcClientPort {
  claims: OidcClaims;
  failWith: Error | null;
  resets: number;
  connections: OidcConnection[];
  callbackUrls: string[];
  redirectUris: string[];
}

export function createFakeOidcClient(): FakeOidcClient {
  const fake: FakeOidcClient = {
    claims: {
      issuer: TEST_ISSUER,
      subject: "sub-1",
      preferredUsername: "erika",
      name: "Erika Muster",
      email: "erika@example.org",
    },
    failWith: null,
    resets: 0,
    connections: [],
    callbackUrls: [],
    redirectUris: [],
    async startAuthorization(connection, redirectUri) {
      fake.connections.push(connection);
      fake.redirectUris.push(redirectUri);
      return {
        url: `${connection.issuerUrl}/auth`,
        state: FAKE_STATE,
        nonce: "fake-nonce",
        codeVerifier: "fake-verifier",
      };
    },
    async finishAuthorization(_connection, callback) {
      fake.callbackUrls.push(callback.currentUrl.href);
      if (fake.failWith) throw fake.failWith;
      return fake.claims;
    },
    reset() {
      fake.resets += 1;
    },
  };
  return fake;
}

export function createTestContext(options: Partial<AppOptions> = {}) {
  const stores = createMemoryStores();
  const oidcClient = createFakeOidcClient();
  const app = createApp({
    isDbConnected: () => true,
    stores,
    oidcClient,
    authSecret: AUTH_SECRET,
    ...options,
  });
  return { app, stores, oidcClient };
}

export async function createSeededContext(options: Partial<AppOptions> = {}) {
  const context = createTestContext(options);
  // Keeps the expected default password warning out of the test output
  const { warn } = console;
  console.warn = () => undefined;
  await seedDefaultUsers(context.stores.users);
  console.warn = warn;
  return context;
}

export async function loginAs(app: Express, name: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username: name, password: name });
  if (res.status !== 200) throw new Error(`Login as ${name} failed with ${res.status}`);
  return agent;
}
