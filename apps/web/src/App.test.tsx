import { API_PATHS } from "@c2r/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the greeting from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: "Hello test" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(API_PATHS.hello);
  });

  it("shows an error when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(<App />);

    expect(await screen.findByText("Server nicht erreichbar.")).toBeTruthy();
  });
});
