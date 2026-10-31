import { API_PATHS } from "@c2r/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("API", () => {
  it("returns the greeting", async () => {
    const res = await request(createApp({ isDbConnected: () => true })).get(API_PATHS.hello);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from consumption2refill" });
  });

  it("reports a connected database as healthy", async () => {
    const res = await request(createApp({ isDbConnected: () => true })).get(API_PATHS.health);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });

  it("reports a disconnected database as degraded", async () => {
    const res = await request(createApp({ isDbConnected: () => false })).get(API_PATHS.health);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "disconnected" });
  });

  it("answers unknown API paths with 404", async () => {
    const res = await request(createApp({ isDbConnected: () => true })).get("/api/unknown");

    expect(res.status).toBe(404);
  });
});
