import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSecretBox } from "../auth/secretBox.js";
import {
  AUTH_SECRET,
  FAKE_STATE,
  TEST_ISSUER,
  createSeededContext,
  loginAs,
} from "../testSupport.js";

const FAILURE = "/?loginError=oidc";
const settings = {
  enabled: true,
  displayName: "Keycloak",
  issuerUrl: TEST_ISSUER,
  clientId: "c2r",
  clientSecret: "streng-geheim",
};

type Context = Awaited<ReturnType<typeof createSeededContext>>;

async function enableOidc({ app }: Context) {
  const admin = await loginAs(app, "admin");
  const res = await admin.put(API_PATHS.adminOidcSettings).send(settings);
  if (res.status !== 200) throw new Error(`Saving settings failed with ${res.status}`);
  return admin;
}

// Runs the browser side of the flow up to the callback
async function runLogin({ app }: Context, state = FAKE_STATE) {
  const agent = request.agent(app);
  await agent.get(API_PATHS.oidcLogin);
  const res = await agent.get(API_PATHS.oidcCallback).query({ code: "code", state });
  return { agent, res };
}

describe("OIDC settings", () => {
  let context: Context;
  let admin: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    context = await createSeededContext();
    admin = await loginAs(context.app, "admin");
  });

  it("starts out empty and names the redirect URI", async () => {
    const res = await admin.get(API_PATHS.adminOidcSettings).set("Host", "refill.test:5173");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: false,
      displayName: "",
      issuerUrl: "",
      clientId: "",
      clientSecretSet: false,
      redirectUri: `http://refill.test:5173${API_PATHS.oidcCallback}`,
    });
  });

  it("prefers PUBLIC_URL for the redirect URI", async () => {
    const { app } = await createSeededContext({ publicUrl: "https://refill.example.org" });
    const agent = request.agent(app);
    const login = await agent.post(API_PATHS.login).send({ username: "admin", password: "admin" });
    const cookie = login.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";

    const res = await request(app).get(API_PATHS.adminOidcSettings).set("Cookie", cookie);

    expect(res.body.redirectUri).toBe(`https://refill.example.org${API_PATHS.oidcCallback}`);
  });

  it("never returns the secret and stores it encrypted", async () => {
    const saved = await admin.put(API_PATHS.adminOidcSettings).send(settings);
    const read = await admin.get(API_PATHS.adminOidcSettings);

    expect(saved.status).toBe(200);
    for (const res of [saved, read]) {
      expect(res.text).not.toContain(settings.clientSecret);
      expect(res.body).not.toHaveProperty("clientSecret");
      expect(res.body).not.toHaveProperty("clientSecretEncrypted");
      expect(res.body.clientSecretSet).toBe(true);
    }
    const stored = await context.stores.oidcSettings.get();
    expect(stored?.clientSecretEncrypted).not.toContain(settings.clientSecret);
    expect(
      createSecretBox(AUTH_SECRET).decrypt(
        stored?.clientSecretEncrypted ?? "",
        "oidc-client-secret",
      ),
    ).toBe(settings.clientSecret);
  });

  it("does not send the stored secret to a new issuer", async () => {
    await admin.put(API_PATHS.adminOidcSettings).send(settings);
    const changed = { ...settings, issuerUrl: "https://evil.example/realm", clientSecret: "" };

    const rejected = await admin.put(API_PATHS.adminOidcSettings).send(changed);
    const disabled = await admin
      .put(API_PATHS.adminOidcSettings)
      .send({ ...changed, enabled: false });

    expect(rejected.status).toBe(400);
    expect(disabled.body.clientSecretSet).toBe(false);
  });

  it.each([
    ["a missing", undefined],
    ["an empty", ""],
  ])("keeps the stored secret with %s secret", async (_name, clientSecret) => {
    await admin.put(API_PATHS.adminOidcSettings).send(settings);
    const before = await context.stores.oidcSettings.get();

    const res = await admin
      .put(API_PATHS.adminOidcSettings)
      .send({ ...settings, displayName: "Neu", clientSecret });

    expect(res.status).toBe(200);
    expect(res.body.clientSecretSet).toBe(true);
    const after = await context.stores.oidcSettings.get();
    expect(after?.clientSecretEncrypted).toBe(before?.clientSecretEncrypted);
    expect(after?.displayName).toBe("Neu");
  });

  it("allows saving incomplete settings while disabled", async () => {
    const res = await admin
      .put(API_PATHS.adminOidcSettings)
      .send({ enabled: false, displayName: "", issuerUrl: "", clientId: "" });

    expect(res.status).toBe(200);
    expect(res.body.clientSecretSet).toBe(false);
  });

  it.each([
    ["no displayName", { displayName: "" }],
    ["no clientId", { clientId: " " }],
    ["no issuerUrl", { issuerUrl: "" }],
    ["a non-URL issuer", { issuerUrl: "keycloak" }],
    ["a non-http issuer", { issuerUrl: "ftp://idp.example" }],
    ["no secret at all", { clientSecret: undefined }],
  ])("rejects enabling with %s", async (_name, change) => {
    const res = await admin.put(API_PATHS.adminOidcSettings).send({ ...settings, ...change });

    expect(res.status).toBe(400);
    expect(await context.stores.oidcSettings.get()).toBeNull();
  });

  it.each([
    ["enabled as text", { enabled: "true" }],
    ["an object as issuerUrl", { issuerUrl: { $ne: "" } }],
    ["a missing clientId", { clientId: undefined }],
    ["a number as secret", { clientSecret: 1 }],
  ])("rejects %s", async (_name, change) => {
    const res = await admin.put(API_PATHS.adminOidcSettings).send({ ...settings, ...change });

    expect(res.status).toBe(400);
  });

  it("drops cached provider data after saving", async () => {
    await admin.put(API_PATHS.adminOidcSettings).send(settings);

    expect(context.oidcClient.resets).toBe(1);
  });

  it("names the provider only while enabled", async () => {
    const providers = () => request(context.app).get(API_PATHS.authProviders);

    await admin.put(API_PATHS.adminOidcSettings).send(settings);
    expect((await providers()).body).toEqual({ oidc: { displayName: "Keycloak" } });

    await admin.put(API_PATHS.adminOidcSettings).send({ ...settings, enabled: false });
    expect((await providers()).body).toEqual({ oidc: null });
  });
});

describe("OIDC login", () => {
  let context: Context;

  beforeEach(async () => {
    context = await createSeededContext();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to the provider with the decrypted secret and a protected state cookie", async () => {
    await enableOidc(context);

    const res = await request(context.app).get(API_PATHS.oidcLogin).set("Host", "refill.test:5173");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${TEST_ISSUER}/auth`);
    expect(context.oidcClient.connections[0]?.clientSecret).toBe(settings.clientSecret);
    expect(context.oidcClient.redirectUris[0]).toBe(
      `http://refill.test:5173${API_PATHS.oidcCallback}`,
    );
    const cookie = res.get("Set-Cookie")?.[0] ?? "";
    expect(cookie).toMatch(/^c2r_oidc=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).not.toContain(FAKE_STATE);
  });

  it("fails without an enabled provider", async () => {
    const res = await request(context.app).get(API_PATHS.oidcLogin);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILURE);
  });

  it("fails without leaking details if the provider is unreachable", async () => {
    await enableOidc(context);
    context.oidcClient.startAuthorization = () => Promise.reject(new Error("secret detail"));

    const res = await request(context.app).get(API_PATHS.oidcLogin);

    expect(res.headers.location).toBe(FAILURE);
    expect(res.text).not.toContain("secret detail");
    expect(console.error).toHaveBeenCalled();
  });

  it("creates the user with the role USER and starts a session", async () => {
    await enableOidc(context);

    const { agent, res } = await runLogin(context);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect((await agent.get(API_PATHS.me)).body).toEqual({
      id: expect.any(String),
      username: "erika",
      displayName: "Erika Muster",
      email: "erika@example.org",
      role: "USER",
      source: "oidc",
    });
    expect(context.oidcClient.callbackUrls[0]).toContain("code=code");
  });

  it("deletes the state cookie after the callback", async () => {
    await enableOidc(context);

    const { res } = await runLogin(context);

    const cleared = res.get("Set-Cookie")?.find((cookie) => cookie.startsWith("c2r_oidc="));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("refreshes name and email on later logins but keeps role and username", async () => {
    await enableOidc(context);
    await runLogin(context);
    const created = await context.stores.users.findByUsername("erika");
    await context.stores.users.update(created?.id ?? "", { role: "MANAGER" });
    context.oidcClient.claims = {
      ...context.oidcClient.claims,
      preferredUsername: "erika.neu",
      name: "Erika Neu",
      email: null,
    };

    const { agent } = await runLogin(context);

    expect((await agent.get(API_PATHS.me)).body).toMatchObject({
      id: created?.id,
      username: "erika",
      displayName: "Erika Neu",
      email: null,
      role: "MANAGER",
    });
    expect(await context.stores.users.count()).toBe(4);
  });

  it("never takes over the local admin with the same username", async () => {
    await enableOidc(context);
    const localAdmin = await context.stores.users.findByUsername("admin");
    context.oidcClient.claims = {
      ...context.oidcClient.claims,
      subject: "kc-admin",
      preferredUsername: "admin",
      name: "Fake Admin",
    };

    const { agent } = await runLogin(context);

    const me = (await agent.get(API_PATHS.me)).body;
    expect(me).toMatchObject({ username: "oidc-kc-admin", role: "USER", source: "oidc" });
    expect(me.id).not.toBe(localAdmin?.id);
    expect(await context.stores.users.findByUsername("admin")).toEqual(localAdmin);
    expect((await agent.get(API_PATHS.adminUsers)).status).toBe(403);
  });

  it("does not link by email either", async () => {
    await enableOidc(context);
    const admin = await context.stores.users.findByUsername("admin");
    await context.stores.users.update(admin?.id ?? "", { email: "boss@example.org" });
    context.oidcClient.claims = {
      ...context.oidcClient.claims,
      subject: "kc-boss",
      preferredUsername: "boss",
      email: "boss@example.org",
    };

    const { agent } = await runLogin(context);

    const me = (await agent.get(API_PATHS.me)).body;
    expect(me.id).not.toBe(admin?.id);
    expect(me.role).toBe("USER");
  });

  it("uses oidc-<sub> if preferred_username is missing", async () => {
    await enableOidc(context);
    context.oidcClient.claims = {
      issuer: TEST_ISSUER,
      subject: "abc",
      preferredUsername: null,
      name: null,
      email: null,
    };

    const { agent } = await runLogin(context);

    expect((await agent.get(API_PATHS.me)).body).toMatchObject({
      username: "oidc-abc",
      displayName: "oidc-abc",
    });
  });

  it("treats the same subject of another issuer as another person", async () => {
    await enableOidc(context);
    await runLogin(context);
    context.oidcClient.claims = {
      ...context.oidcClient.claims,
      issuer: "https://other.example",
    };

    const { agent } = await runLogin(context);

    expect((await agent.get(API_PATHS.me)).body.username).toBe("oidc-sub-1");
  });

  it("does not create a local login for the provisioned user", async () => {
    await enableOidc(context);
    await runLogin(context);

    const res = await request(context.app)
      .post(API_PATHS.login)
      .send({ username: "erika", password: "erika" });

    expect(res.status).toBe(401);
  });

  it("fails on a wrong state and creates nobody", async () => {
    await enableOidc(context);

    const { agent, res } = await runLogin(context, "forged");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILURE);
    expect(context.oidcClient.callbackUrls).toEqual([]);
    expect(await context.stores.users.count()).toBe(3);
    expect((await agent.get(API_PATHS.me)).status).toBe(401);
  });

  it("fails on a repeated state parameter", async () => {
    await enableOidc(context);
    const agent = request.agent(context.app);
    await agent.get(API_PATHS.oidcLogin);

    const res = await agent.get(
      `${API_PATHS.oidcCallback}?state=${FAKE_STATE}&state=${FAKE_STATE}`,
    );

    expect(res.headers.location).toBe(FAILURE);
  });

  it("fails without or with a forged state cookie", async () => {
    await enableOidc(context);
    const callback = () => request(context.app).get(API_PATHS.oidcCallback);

    const without = await callback().query({ state: FAKE_STATE });
    const forged = await callback().query({ state: FAKE_STATE }).set("Cookie", "c2r_oidc=forged");

    expect(without.headers.location).toBe(FAILURE);
    expect(forged.headers.location).toBe(FAILURE);
    expect(context.oidcClient.callbackUrls).toEqual([]);
  });

  it("fails if the state cookie has expired", async () => {
    await enableOidc(context);
    const agent = request.agent(context.app);
    await agent.get(API_PATHS.oidcLogin);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);

    const res = await agent.get(API_PATHS.oidcCallback).query({ state: FAKE_STATE });

    expect(res.headers.location).toBe(FAILURE);
  });

  it("does not accept the state cookie twice", async () => {
    await enableOidc(context);
    const { agent } = await runLogin(context);

    const again = await agent.get(API_PATHS.oidcCallback).query({ state: FAKE_STATE });

    expect(again.headers.location).toBe(FAILURE);
  });

  it("fails without leaking details if the exchange fails", async () => {
    await enableOidc(context);
    context.oidcClient.failWith = new Error("secret detail");

    const { agent, res } = await runLogin(context);

    expect(res.headers.location).toBe(FAILURE);
    expect(res.text).not.toContain("secret detail");
    expect(console.error).toHaveBeenCalled();
    expect((await agent.get(API_PATHS.me)).status).toBe(401);
  });
});
