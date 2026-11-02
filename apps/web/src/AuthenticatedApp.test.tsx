import { API_PATHS, type Material, type Role, type StorageLocation, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
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
    expect(screen.getByRole("tab", { name: "Lagerorte", selected: true })).toBeTruthy();
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

describe("AuthenticatedApp view filter for a changed user prop", () => {
  it("leaves the master data view when the role no longer allows it", async () => {
    stubRoutes("MANAGER");

    const { rerender } = render(appWithRole("MANAGER"));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");

    rerender(appWithRole("USER"));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("leaves the administration view when the role no longer allows it", async () => {
    stubRoutes("ADMIN");

    const { rerender } = render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Administration" }));
    await screen.findByRole("tab", { name: "Benutzer" });

    rerender(appWithRole("MANAGER"));

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(navLabels()).toEqual(["Start", "Stammdaten"]);
  });

  it("keeps the master data view when the new role still allows it", async () => {
    stubRoutes("ADMIN");

    const { rerender } = render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");

    rerender(appWithRole("MANAGER"));

    expect(screen.getByText("Hauptlager")).toBeTruthy();
  });
});

describe("AuthenticatedApp role taken away elsewhere", () => {
  const SAVE_ROUTE = `PATCH ${API_PATHS.storageLocations}/${LOCATION.id}`;
  const FORBIDDEN = "Keine Berechtigung.";

  function StatefulApp() {
    const [user, setUser] = useState(userWithRole("MANAGER"));
    return (
      <AuthenticatedApp
        api={api}
        user={user}
        onUserChange={setUser}
        onLoggedOut={vi.fn()}
        onProvidersChange={vi.fn()}
      />
    );
  }

  async function saveInMasterData() {
    render(<StatefulApp />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Hauptlager" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Zentrallager" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  }

  it("falls back to the start view without navigation after a 403 and the reloaded user", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    await saveInMasterData();

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Stammdaten" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("USER")).toBeTruthy();
  });

  it("stays in the master data with the message when the role is unchanged", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("MANAGER"));

    await saveInMasterData();

    expect(await screen.findByText(FORBIDDEN)).toBeTruthy();
    await waitFor(() => expect(stub.bodies(`GET ${API_PATHS.me}`)).toHaveLength(1));
    expect(await screen.findByText("Hauptlager")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stammdaten" })).toBeTruthy();
    expect(screen.getByText(FORBIDDEN)).toBeTruthy();
  });

  const UNSAVED = /Die Änderung wurde nicht gespeichert/;

  it("explains on the start view that the change was not saved", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    await saveInMasterData();

    expect(await screen.findByText(UNSAVED)).toBeTruthy();
    expect(await screen.findByText("Hello test")).toBeTruthy();
  });

  it("explains it as well for a material from the material tab", async () => {
    const stub = stubRoutes("MANAGER");
    const material: Material = {
      ...LOCATION,
      name: "Schraube",
      unit: "Stück",
      description: "",
      tags: [],
    };
    stub.routes[`GET ${API_PATHS.materials}`] = json([material]);
    stub.routes[`DELETE ${API_PATHS.materials}/${material.id}`] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    render(<StatefulApp />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: Schraube" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));

    expect(await screen.findByText(UNSAVED)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Stammdaten" })).toBeNull();
  });

  it("closes the explanation with a touch on its button", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    await saveInMasterData();
    await screen.findByText(UNSAVED);
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));

    expect(screen.queryByText(UNSAVED)).toBeNull();
    expect(screen.getByText("USER")).toBeTruthy();
  });

  it("removes the explanation with the next change of the view", async () => {
    // A USER has no navigation, so the test gives the role back to reach a change of the view.
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));
    function App() {
      const [user, setUser] = useState(userWithRole("MANAGER"));
      return (
        <>
          <button onClick={() => setUser(userWithRole("MANAGER"))}>Rolle zurück</button>
          <AuthenticatedApp
            api={api}
            user={user}
            onUserChange={setUser}
            onLoggedOut={vi.fn()}
            onProvidersChange={vi.fn()}
          />
        </>
      );
    }

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Hauptlager" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Zentrallager" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText(UNSAVED);

    fireEvent.click(screen.getByRole("button", { name: "Rolle zurück" }));
    expect(screen.getByText(UNSAVED)).toBeTruthy();
    expect(await screen.findByText("Hello test")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));

    expect(screen.queryByText(UNSAVED)).toBeNull();
    expect(screen.getByRole("heading", { name: "Stammdaten" })).toBeTruthy();
  });

  it("does not show the explanation when the role still allows the master data", async () => {
    const stub = stubRoutes("ADMIN");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("MANAGER"));

    await saveInMasterData();

    await screen.findByText(FORBIDDEN);
    await waitFor(() => expect(stub.bodies(`GET ${API_PATHS.me}`)).toHaveLength(1));
    await screen.findByText("Hauptlager");
    expect(screen.queryByText(UNSAVED)).toBeNull();
  });

  it("does not show the explanation when the role stays the same", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("MANAGER"));

    await saveInMasterData();

    await waitFor(() => expect(stub.bodies(`GET ${API_PATHS.me}`)).toHaveLength(1));
    await screen.findByText("Hauptlager");
    expect(screen.queryByText(UNSAVED)).toBeNull();
  });

  it("keeps the view and the message when reloading the user fails", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json({ message: "Kaputt" }, 500);

    await saveInMasterData();

    await waitFor(() => expect(stub.bodies(`GET ${API_PATHS.me}`)).toHaveLength(1));
    expect(await screen.findByText("Hauptlager")).toBeTruthy();
    expect(screen.getByText(FORBIDDEN)).toBeTruthy();
    expect(screen.queryByText("Kaputt")).toBeNull();
  });
});
