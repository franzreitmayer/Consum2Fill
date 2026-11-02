import { API_PATHS, type Role, type StorageLocation, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { json, stubApi } from "./testing/stubApi";

const LOCATION: StorageLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 1,
  name: "Hauptlager",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function userWithRole(role: Role): User {
  return {
    id: "u1",
    username: "erika",
    displayName: "Erika Muster",
    email: null,
    role,
    source: "local",
    mustChangePassword: false,
  };
}

function stubRoutes(role: Role) {
  return stubApi({
    [`GET ${API_PATHS.hello}`]: json({ message: "Hello test" }),
    [`GET ${API_PATHS.storageLocations}`]: json([LOCATION]),
    [`GET ${API_PATHS.adminUsers}`]: json([userWithRole(role)]),
    [`GET ${API_PATHS.adminOidcSettings}`]: json({
      enabled: false,
      displayName: "",
      issuerUrl: "",
      clientId: "",
      clientSecretSet: false,
      redirectUri: "http://localhost/api/auth/oidc/callback",
    }),
  });
}

const api = createApiClient(vi.fn());

function appWithRole(role: Role) {
  return (
    <AuthenticatedApp
      api={api}
      user={userWithRole(role)}
      onUserChange={vi.fn()}
      onLoggedOut={vi.fn()}
      onProvidersChange={vi.fn()}
    />
  );
}

function navLabels(): string[] {
  const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
  return within(nav)
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthenticatedApp navigation", () => {
  it.each<[Role, string[]]>([
    ["ADMIN", ["Start", "Stammdaten", "Administration"]],
    ["MANAGER", ["Start", "Stammdaten"]],
  ])("offers the items allowed for %s", async (role, labels) => {
    stubRoutes(role);

    render(appWithRole(role));
    await screen.findByText("Hello test");

    expect(navLabels()).toEqual(labels);
  });

  it("shows no navigation to USER and does not load master data", async () => {
    const stub = stubRoutes("USER");

    render(appWithRole("USER"));
    await screen.findByText("Hello test");

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stammdaten" })).toBeNull();
    expect(stub.bodies(`GET ${API_PATHS.storageLocations}`)).toHaveLength(0);
  });

  it.each<Role>(["ADMIN", "MANAGER"])("opens the storage locations for %s", async (role) => {
    stubRoutes(role);

    render(appWithRole(role));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));

    expect(screen.getByRole("button", { name: "Stammdaten" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("heading", { name: "Stammdaten" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lagerorte" })).toBeTruthy();
    expect(await screen.findByText("Hauptlager")).toBeTruthy();
  });

  it("does not show storage locations in the administration", async () => {
    const stub = stubRoutes("ADMIN");

    render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Administration" }));

    expect(await screen.findByRole("tab", { name: "Benutzer" })).toBeTruthy();
    expect(screen.queryByText("Lagerorte")).toBeNull();
    expect(stub.bodies(`GET ${API_PATHS.storageLocations}`)).toHaveLength(0);
  });
});

describe("AuthenticatedApp role changes", () => {
  it("returns to the start view when the master data role is taken away", async () => {
    stubRoutes("MANAGER");

    const { rerender } = render(appWithRole("MANAGER"));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");

    rerender(appWithRole("USER"));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("returns to the start view when an ADMIN in the administration becomes MANAGER", async () => {
    stubRoutes("ADMIN");

    const { rerender } = render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Administration" }));
    await screen.findByRole("tab", { name: "Benutzer" });

    rerender(appWithRole("MANAGER"));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(navLabels()).toEqual(["Start", "Stammdaten"]);
  });

  it("keeps the master data open when an ADMIN becomes MANAGER", async () => {
    stubRoutes("ADMIN");

    const { rerender } = render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");

    rerender(appWithRole("MANAGER"));

    expect(screen.getByText("Hauptlager")).toBeTruthy();
  });
});
