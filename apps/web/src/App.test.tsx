import { API_PATHS, type Role, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { type RouteHandler, json, noContent, stubApi } from "./testing/stubApi";

const UNAUTHORIZED = json({ message: "Nicht angemeldet" }, 401);

function userWithRole(role: Role): User {
  return {
    id: "u1",
    username: "erika",
    displayName: "Erika Muster",
    email: null,
    role,
    source: "local",
  };
}

function signedInRoutes(role: Role): Record<string, RouteHandler> {
  return {
    [`GET ${API_PATHS.me}`]: json(userWithRole(role)),
    [`GET ${API_PATHS.authProviders}`]: json({ oidc: null }),
    [`GET ${API_PATHS.hello}`]: json({ message: "Hello test" }),
    [`GET ${API_PATHS.adminUsers}`]: json([userWithRole(role)]),
    [`GET ${API_PATHS.adminOidcSettings}`]: json({
      enabled: false,
      displayName: "",
      issuerUrl: "",
      clientId: "",
      clientSecretSet: false,
      redirectUri: "http://localhost/api/auth/oidc/callback",
    }),
    [`POST ${API_PATHS.logout}`]: noContent,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App startup", () => {
  it("shows a loading indicator first", async () => {
    stubApi(signedInRoutes("USER"));

    render(<App />);

    expect(screen.getByRole("progressbar", { name: "Wird geladen" })).toBeTruthy();
    await screen.findByText("Hello test");
  });

  it("shows the login screen when there is no session", async () => {
    stubApi({ ...signedInRoutes("USER"), [`GET ${API_PATHS.me}`]: UNAUTHORIZED });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
  });

  it("shows an error and retries when the server is unavailable", async () => {
    const routes = signedInRoutes("USER");
    stubApi({ ...routes, [`GET ${API_PATHS.me}`]: json({ message: "kaputt" }, 500) });

    render(<App />);

    expect(await screen.findByText("Server nicht erreichbar.")).toBeTruthy();

    stubApi(routes);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Hello test")).toBeTruthy();
  });

  it("shows an error when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    render(<App />);

    expect(await screen.findByText("Server nicht erreichbar.")).toBeTruthy();
  });

  it("shows an OIDC login error and removes it from the URL", async () => {
    window.history.replaceState(null, "", "/?loginError=oidc&keep=1");
    stubApi({ ...signedInRoutes("USER"), [`GET ${API_PATHS.me}`]: UNAUTHORIZED });

    render(<App />);

    expect(
      await screen.findByText("Die Anmeldung beim Identity Provider ist fehlgeschlagen."),
    ).toBeTruthy();
    expect(window.location.search).toBe("?keep=1");
  });
});

describe("App session", () => {
  it("shows greeting, name and role after a login", async () => {
    stubApi({
      ...signedInRoutes("MANAGER"),
      [`GET ${API_PATHS.me}`]: UNAUTHORIZED,
      [`POST ${API_PATHS.login}`]: json(userWithRole("MANAGER")),
    });

    render(<App />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Benutzername" }), {
      target: { value: "erika" },
    });
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: "geheim123" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.getByText("Erika Muster")).toBeTruthy();
    expect(screen.getByText("MANAGER")).toBeTruthy();
    expect(screen.getByText("Angemeldet als Erika Muster, Rolle MANAGER")).toBeTruthy();
  });

  it("returns to the login screen after logout", async () => {
    const api = stubApi(signedInRoutes("USER"));

    render(<App />);
    await screen.findByText("Hello test");
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    expect(api.bodies(`POST ${API_PATHS.logout}`)).toHaveLength(1);
  });

  it("stays signed in and shows the error when logout fails", async () => {
    stubApi(signedInRoutes("USER"));

    render(<App />);
    await screen.findByText("Hello test");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(
      await screen.findByText("Server nicht erreichbar. Bitte die Verbindung prüfen."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeTruthy();
  });

  it("returns to the login screen when a later request answers with 401", async () => {
    stubApi({ ...signedInRoutes("USER"), [`GET ${API_PATHS.hello}`]: UNAUTHORIZED });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    expect(screen.getByText("Die Sitzung ist abgelaufen. Bitte erneut anmelden.")).toBeTruthy();
  });

  it("shows the hello error with a retry", async () => {
    const routes = signedInRoutes("USER");
    stubApi({ ...routes, [`GET ${API_PATHS.hello}`]: json({ message: "Fehler beim Laden" }, 500) });

    render(<App />);

    expect(await screen.findByText("Fehler beim Laden")).toBeTruthy();

    stubApi(routes);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Hello test")).toBeTruthy();
  });
});

describe("App administration access", () => {
  it("offers the administration to ADMIN", async () => {
    stubApi(signedInRoutes("ADMIN"));

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Administration" }));

    expect(await screen.findByRole("heading", { name: "Administration" })).toBeTruthy();
    expect(await screen.findByRole("tab", { name: "Benutzer" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "OIDC" })).toBeTruthy();
  });

  it.each(["MANAGER", "USER"] as const)("hides the administration from %s", async (role) => {
    const api = stubApi(signedInRoutes(role));

    render(<App />);
    await screen.findByText("Hello test");

    expect(screen.queryByRole("button", { name: "Administration" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(api.bodies(`GET ${API_PATHS.adminUsers}`)).toHaveLength(0);
  });

  it("leaves the administration when the own role is taken away", async () => {
    stubApi({
      ...signedInRoutes("ADMIN"),
      [`PATCH /api/admin/users/u1`]: json(userWithRole("USER")),
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Administration" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: erika" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rolle" }), {
      target: { value: "USER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Administration" })).toBeNull();
  });

  it("refreshes the login options after saving the OIDC settings", async () => {
    const saved = {
      enabled: true,
      displayName: "Keycloak",
      issuerUrl: "https://idp.example/realms/c2r",
      clientId: "c2r",
      clientSecretSet: true,
      redirectUri: "http://localhost/api/auth/oidc/callback",
    };
    const routes = signedInRoutes("ADMIN");
    routes[`PUT ${API_PATHS.adminOidcSettings}`] = () => {
      routes[`GET ${API_PATHS.authProviders}`] = json({ oidc: { displayName: "Keycloak" } });
      return Response.json(saved);
    };
    stubApi(routes);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Administration" }));
    fireEvent.click(await screen.findByRole("tab", { name: "OIDC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Speichern" }));
    await screen.findByText("Einstellungen gespeichert.");

    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("button", { name: "Anmelden mit Keycloak" })).toBeTruthy();
  });
});
