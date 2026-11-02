import {
  API_PATHS,
  type Consumption,
  type Material,
  type Role,
  type StorageLocation,
  type User,
} from "@c2r/shared";
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

const SCREW: Material = {
  ...LOCATION,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Schraube",
  unit: "Stück",
  description: "",
  tags: [],
};

const CONSUMPTION: Consumption = {
  ...LOCATION,
  id: "33333333-3333-4333-8333-333333333333",
  storageLocationId: LOCATION.id,
  materialId: SCREW.id,
  quantity: 2,
  createdBy: { id: "someone-else", displayName: "Max Beispiel" },
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
    [`GET ${API_PATHS.storageLocations}`]: json([LOCATION]),
    [`GET ${API_PATHS.materials}`]: json([SCREW]),
    [`GET ${API_PATHS.consumptions}`]: json([CONSUMPTION]),
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
    ["ADMIN", ["Erfassung", "Stammdaten", "Administration"]],
    ["MANAGER", ["Erfassung", "Stammdaten"]],
  ])("offers the items allowed for %s", async (role, labels) => {
    stubRoutes(role);

    render(appWithRole(role));
    await screen.findByText("Nr. 1");

    expect(navLabels()).toEqual(labels);
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("offers only the capture to USER", async () => {
    const stub = stubRoutes("USER");

    render(appWithRole("USER"));
    await screen.findByText("Nr. 1");

    expect(navLabels()).toEqual(["Erfassung"]);
    expect(screen.queryByRole("button", { name: "Stammdaten" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Erfassung" })).toBeTruthy();
    expect(stub.bodies(`GET ${API_PATHS.adminUsers}`)).toHaveLength(0);
  });

  it.each<Role>(["ADMIN", "MANAGER", "USER"])("starts with the capture for %s", async (role) => {
    stubRoutes(role);

    render(appWithRole(role));

    expect(screen.getByRole("heading", { name: "Erfassung" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Verbrauch/Bedarf" })).toBeTruthy();
    await screen.findByText("Nr. 1");
    expect(screen.queryByRole("heading", { name: "Stammdaten" })).toBeNull();
  });

  it("offers new master data after coming back from the master data", async () => {
    const stub = stubRoutes("MANAGER");

    render(appWithRole("MANAGER"));
    await screen.findByText("Nr. 1");
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");
    stub.routes[`GET ${API_PATHS.storageLocations}`] = json([
      LOCATION,
      { ...LOCATION, id: "l2", number: 2, name: "Keller" },
    ]);
    stub.routes[`GET ${API_PATHS.materials}`] = json([
      SCREW,
      { ...SCREW, id: "m2", number: 2, name: "Mutter" },
    ]);
    stub.routes[`GET ${API_PATHS.consumptions}`] = json([
      CONSUMPTION,
      { ...CONSUMPTION, id: "c2", number: 2 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Erfassung" }));

    expect(await screen.findByText("Nr. 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verbrauch erfassen" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("option", { name: "Keller" })).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Material" }), {
      target: { value: "mut" },
    });
    expect(await screen.findByRole("option", { name: "Mutter (Stück)" })).toBeTruthy();
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

  describe("tap on the active item", () => {
    const LOCATIONS_ROUTE = `GET ${API_PATHS.storageLocations}`;
    const MATERIALS_ROUTE = `GET ${API_PATHS.materials}`;
    const LIST_ROUTE = `GET ${API_PATHS.consumptions}`;

    it("loads the capture again and keeps the filter", async () => {
      const stub = stubRoutes("USER");
      const keller = { ...LOCATION, id: "l2", number: 2, name: "Keller" };
      stub.routes[LOCATIONS_ROUTE] = json([LOCATION, keller]);

      render(appWithRole("USER"));
      await screen.findByText("Nr. 1");
      const filter = screen.getByRole("combobox", { name: "Nach Lagerort filtern" });
      fireEvent.change(filter, { target: { value: LOCATION.id } });
      stub.routes[LIST_ROUTE] = json([CONSUMPTION, { ...CONSUMPTION, id: "c2", number: 2 }]);
      stub.routes[MATERIALS_ROUTE] = json([
        SCREW,
        { ...SCREW, id: "m2", number: 2, name: "Mutter" },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Erfassung" }));

      expect(await screen.findByText("Nr. 2")).toBeTruthy();
      expect(screen.getByRole("combobox", { name: "Nach Lagerort filtern" })).toHaveProperty(
        "value",
        LOCATION.id,
      );
      expect(screen.getByText("Nr. 1")).toBeTruthy();
      expect(stub.bodies(LOCATIONS_ROUTE)).toHaveLength(2);
      await waitFor(() => expect(stub.bodies(MATERIALS_ROUTE)).toHaveLength(2));
    });

    it("keeps the list when loading again fails", async () => {
      const stub = stubRoutes("USER");

      render(appWithRole("USER"));
      await screen.findByText("Nr. 1");
      stub.routes[LIST_ROUTE] = json({ message: "Kaputt" }, 500);
      stub.routes[LOCATIONS_ROUTE] = json({ message: "Kaputt" }, 500);
      fireEvent.click(screen.getByRole("button", { name: "Erfassung" }));

      await waitFor(() => expect(stub.bodies(LIST_ROUTE)).toHaveLength(2));
      await waitFor(() => expect(stub.bodies(LOCATIONS_ROUTE)).toHaveLength(2));
      await new Promise((resolve) => setTimeout(resolve));
      expect(screen.getByText("Nr. 1")).toBeTruthy();
      expect(screen.queryByText("Kaputt")).toBeNull();
    });

    it("loads the master data again and stays in the tab", async () => {
      const stub = stubRoutes("MANAGER");

      render(appWithRole("MANAGER"));
      fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
      await screen.findByText("Hauptlager");
      stub.routes[LOCATIONS_ROUTE] = json([
        LOCATION,
        { ...LOCATION, id: "l2", number: 2, name: "Keller" },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));

      expect(await screen.findByText("Keller")).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Lagerorte", selected: true })).toBeTruthy();
    });

    it("does not load anything twice when changing the view", async () => {
      const stub = stubRoutes("MANAGER");

      render(appWithRole("MANAGER"));
      await screen.findByText("Nr. 1");
      fireEvent.click(screen.getByRole("button", { name: "Erfassung" }));
      await waitFor(() => expect(stub.bodies(LIST_ROUTE)).toHaveLength(2));
      fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
      await screen.findByText("Hauptlager");
      fireEvent.click(screen.getByRole("button", { name: "Erfassung" }));
      await screen.findByText("Nr. 1");

      expect(stub.bodies(LIST_ROUTE)).toHaveLength(3);
    });
  });

  it("does not show storage locations in the administration", async () => {
    const stub = stubRoutes("ADMIN");

    render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Administration" }));

    expect(await screen.findByRole("tab", { name: "Benutzer" })).toBeTruthy();
    expect(screen.queryByText("Lagerorte")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Erfassung" })).toBeNull();
    expect(stub.bodies(`GET ${API_PATHS.adminUsers}`)).toHaveLength(1);
  });
});

describe("AuthenticatedApp view filter for a changed user prop", () => {
  it("leaves the master data view when the role no longer allows it", async () => {
    stubRoutes("MANAGER");

    const { rerender } = render(appWithRole("MANAGER"));
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
    await screen.findByText("Hauptlager");

    rerender(appWithRole("USER"));

    expect(await screen.findByText("Nr. 1")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Stammdaten" })).toBeNull();
    expect(navLabels()).toEqual(["Erfassung"]);
  });

  it("leaves the administration view when the role no longer allows it", async () => {
    stubRoutes("ADMIN");

    const { rerender } = render(appWithRole("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Administration" }));
    await screen.findByRole("tab", { name: "Benutzer" });

    rerender(appWithRole("MANAGER"));

    expect(await screen.findByText("Nr. 1")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(navLabels()).toEqual(["Erfassung", "Stammdaten"]);
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

describe("AuthenticatedApp role taken away while in the capture", () => {
  const OWN: Consumption = {
    ...CONSUMPTION,
    createdBy: { id: "u1", displayName: "Erika Muster" },
  };
  const OTHER: Consumption = { ...CONSUMPTION, id: "c2", number: 2 };
  const SAVE_ROUTE = `PATCH ${API_PATHS.consumptions}/${OTHER.id}`;
  const FORBIDDEN = "Keine Berechtigung.";

  function App() {
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

  async function saveOther(role: Role) {
    const stub = stubRoutes("MANAGER");
    stub.routes[`GET ${API_PATHS.consumptions}`] = json([OWN, OTHER]);
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole(role));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Nr. 2" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Menge" }), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    return stub;
  }

  it("stays in the capture and only offers the buttons of the new role", async () => {
    await saveOther("USER");

    expect(await screen.findByText(FORBIDDEN)).toBeTruthy();
    await screen.findByText("USER");
    await screen.findByText("Nr. 2");
    expect(screen.getByRole("heading", { name: "Erfassung" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten: Nr. 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bearbeiten: Nr. 1" })).toBeTruthy();
    expect(screen.queryByText(/Die Änderung wurde nicht gespeichert/)).toBeNull();
    expect(navLabels()).toEqual(["Erfassung"]);
  });

  it("keeps the message and the buttons when the role is unchanged", async () => {
    const stub = await saveOther("MANAGER");

    expect(await screen.findByText(FORBIDDEN)).toBeTruthy();
    await waitFor(() => expect(stub.bodies(`GET ${API_PATHS.me}`)).toHaveLength(1));
    expect(await screen.findByRole("button", { name: "Bearbeiten: Nr. 2" })).toBeTruthy();
    expect(screen.getByText(FORBIDDEN)).toBeTruthy();
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

  it("falls back to the capture with only its menu item after a 403 and the reloaded user", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    await saveInMasterData();

    expect(await screen.findByText("Nr. 1")).toBeTruthy();
    expect(navLabels()).toEqual(["Erfassung"]);
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

  it("explains in the capture that the change was not saved", async () => {
    const stub = stubRoutes("MANAGER");
    stub.routes[SAVE_ROUTE] = json({ message: FORBIDDEN }, 403);
    stub.routes[`GET ${API_PATHS.me}`] = json(userWithRole("USER"));

    await saveInMasterData();

    expect(await screen.findByText(UNSAVED)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Erfassung" })).toBeTruthy();
    expect(await screen.findByText("Nr. 1")).toBeTruthy();
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
    // A USER has only one menu item, so the test gives the role back to reach a change of the view.
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
    expect(await screen.findByText("Nr. 1")).toBeTruthy();

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
