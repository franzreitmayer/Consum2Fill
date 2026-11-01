import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
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
