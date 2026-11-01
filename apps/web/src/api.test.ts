import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NETWORK_ERROR_STATUS, apiRequest, createApiClient } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("sends JSON and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/x", { method: "POST", body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: '{"a":1}',
      headers: { "Content-Type": "application/json" },
    });
  });

  it("returns nothing for 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiRequest("/x")).resolves.toBeUndefined();
  });

  it("throws the server message with the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "Vergeben" }, { status: 409 })),
    );

    const error = await apiRequest("/x").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "Vergeben" });
  });

  it("falls back to a generic message when the error has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));

    await expect(apiRequest("/x")).rejects.toMatchObject({
      status: 502,
      message: "Die Anfrage ist fehlgeschlagen (Status 502).",
    });
  });

  it("reports network failures as ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/x")).rejects.toMatchObject({
      status: NETWORK_ERROR_STATUS,
      message: "Server nicht erreichbar. Bitte die Verbindung prüfen.",
    });
  });

  it("passes aborts through unchanged", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(apiRequest("/x", { signal: controller.signal })).rejects.toBe(abortError);
  });
});

describe("createApiClient", () => {
  it("reports a 401 and still throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "" }, { status: 401 })),
    );
    const onUnauthorized = vi.fn();

    await expect(createApiClient(onUnauthorized)("/x")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("ignores other errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "" }, { status: 403 })),
    );
    const onUnauthorized = vi.fn();

    await expect(createApiClient(onUnauthorized)("/x")).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
