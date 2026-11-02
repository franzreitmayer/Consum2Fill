import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { API_PATHS, adminUserPasswordPath, adminUserPath } from "@c2r/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededContext, createTestContext, loginAs } from "./testSupport.js";

describe("API", () => {
  it("returns the greeting to a signed-in user", async () => {
    const { app } = await createSeededContext();
    const agent = await loginAs(app, "user");

    const res = await agent.get(API_PATHS.hello);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from consumption2refill" });
  });

  it("reports a connected database as healthy without a session", async () => {
    const res = await request(createTestContext().app).get(API_PATHS.health);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });

  it("reports a disconnected database as degraded", async () => {
    const { app } = createTestContext({ isDbConnected: () => false });

    const res = await request(app).get(API_PATHS.health);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "disconnected" });
  });

  it("answers unknown API paths with 404 and a message", async () => {
    const res = await request(createTestContext().app).get("/api/unknown");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Not found" });
  });

  it("answers malformed JSON with 400 and a message", async () => {
    const res = await request(createTestContext().app)
      .post(API_PATHS.login)
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: expect.any(String) });
  });

  it("hides internal errors from the client", async () => {
    const context = createTestContext();
    context.stores.oidcSettings.get = () => Promise.reject(new Error("database detail"));
    const { error } = console;
    console.error = () => undefined;

    const res = await request(context.app).get(API_PATHS.authProviders);

    console.error = error;
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("database detail");
  });
});

describe("order of the checks under /api/admin", () => {
  const malformed = ["application/json", "{broken"] as const;
  const unknownCharset = ["application/json; charset=foo", "{}"] as const;
  const tooLarge = ["application/json", JSON.stringify({ a: "x".repeat(200 * 1024) })] as const;
  const routes = [
    ["post", API_PATHS.adminUsers],
    ["patch", adminUserPath("1")],
    ["put", adminUserPasswordPath("1")],
    ["put", API_PATHS.adminOidcSettings],
    ["post", "/api/ADMIN/users"],
  ] as const;

  describe.each(routes)("%s %s", (method, path) => {
    it.each([
      ["a malformed body", malformed, 400],
      ["an unknown charset", unknownCharset, 415],
      ["a body too large", tooLarge, 413],
    ] as const)("answers %s by session and role first", async (_name, [type, body], status) => {
      const { app } = await createSeededContext();
      const send = (agent: ReturnType<typeof request.agent>) =>
        agent[method](path).set("Content-Type", type).send(body);

      expect((await send(request.agent(app))).status).toBe(401);
      expect((await send(await loginAs(app, "user"))).status).toBe(403);
      expect((await send(await loginAs(app, "manager"))).status).toBe(403);
      const res = await send(await loginAs(app, "admin"));
      expect(res.status).toBe(status);
      expect(res.body).toEqual({ message: expect.any(String) });
    });
  });

  it("still hands parsed bodies to the admin routes", async () => {
    const { app, stores } = await createSeededContext();
    const admin = await loginAs(app, "admin");

    const res = await admin.post(API_PATHS.adminUsers).send({
      username: "neu",
      displayName: "Neu",
      role: "USER",
      password: "langes-passwort",
    });

    expect(res.status).toBe(201);
    expect(await stores.users.findByUsername("neu")).not.toBeNull();
  });
});

describe("security headers", () => {
  const CSP = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "script-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ];

  function directives(res: request.Response): string[] {
    return (res.get("Content-Security-Policy") ?? "").split(";").map((part) => part.trim());
  }

  it("sets the agreed policy without upgrading requests", async () => {
    const res = await request(createTestContext().app).get(API_PATHS.health);

    expect(directives(res).sort()).toEqual([...CSP].sort());
    expect(res.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
    expect(res.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.get("X-Frame-Options")).toBeDefined();
    expect(res.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.get("X-Powered-By")).toBeUndefined();
  });

  it("leaves out HSTS and COOP on a plain http origin", async () => {
    const res = await request(createTestContext({ publicUrl: "http://192.168.1.2:3001" }).app).get(
      API_PATHS.health,
    );

    expect(res.get("Strict-Transport-Security")).toBeUndefined();
    expect(res.get("Cross-Origin-Opener-Policy")).toBeUndefined();
  });

  it("leaves out HSTS and COOP without PUBLIC_URL", async () => {
    const res = await request(createTestContext().app).get(API_PATHS.health);

    expect(res.get("Strict-Transport-Security")).toBeUndefined();
    expect(res.get("Cross-Origin-Opener-Policy")).toBeUndefined();
  });

  it("sets HSTS and COOP for an https PUBLIC_URL", async () => {
    const { app } = createTestContext({ publicUrl: "https://refill.example.org" });

    const res = await request(app).get(API_PATHS.health);

    expect(res.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(res.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("also covers API errors", async () => {
    const { app } = createTestContext();

    const notFound = await request(app).get("/api/unknown");
    const unauthorized = await request(app).get(API_PATHS.me);
    const malformed = await request(app)
      .post(API_PATHS.login)
      .set("Content-Type", "application/json")
      .send("{broken");

    for (const res of [notFound, unauthorized, malformed]) {
      expect(directives(res).sort()).toEqual([...CSP].sort());
    }
  });

  describe("delivered frontend", () => {
    let webDistDir: string;

    beforeAll(async () => {
      webDistDir = await mkdtemp(path.join(tmpdir(), "c2r-web-"));
      await writeFile(path.join(webDistDir, "index.html"), "<!doctype html><title>c2r</title>");
      await writeFile(path.join(webDistDir, "app.js"), "export {};");
    });

    afterAll(async () => {
      await rm(webDistDir, { recursive: true, force: true });
    });

    it.each(["/", "/app.js", "/some/client/route"])("covers %s", async (url) => {
      const res = await request(createTestContext({ webDistDir }).app).get(url);

      expect(res.status).toBe(200);
      expect(directives(res).sort()).toEqual([...CSP].sort());
      expect(res.get("X-Powered-By")).toBeUndefined();
    });
  });
});
