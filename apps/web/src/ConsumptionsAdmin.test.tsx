import {
  API_PATHS,
  type Consumption,
  type Material,
  type Role,
  type StorageLocation,
  type User,
} from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { CaptureArea } from "./CaptureArea";
import { json, noContent, type RouteHandler, stubApi } from "./testing/stubApi";

const TIMES = { createdAt: "2026-03-15T12:00:00.000Z", updatedAt: "2026-03-15T12:00:00.000Z" };
const NOON_DATE = "15.03.2026";
const OWN_ID = "u-own";

function location(number: number, name: string): StorageLocation {
  return { id: `l-${number}`, number, name, ...TIMES };
}

function material(number: number, name: string, overrides: Partial<Material> = {}): Material {
  return {
    id: `m-${number}`,
    number,
    name,
    unit: "Stück",
    description: "",
    tags: [],
    ...TIMES,
    ...overrides,
  };
}

function consumption(number: number, overrides: Partial<Consumption> = {}): Consumption {
  return {
    id: `c-${number}`,
    number,
    storageLocationId: MAIN.id,
    materialId: SCREW.id,
    quantity: 1,
    createdBy: { id: OWN_ID, displayName: "Erika Muster" },
    ...TIMES,
    ...overrides,
  };
}

function user(role: Role): User {
  return {
    id: OWN_ID,
    username: "erika",
    displayName: "Erika Muster",
    email: null,
    role,
    source: "local",
    mustChangePassword: false,
  };
}

const MAIN = location(1, "Hauptlager");
const CELLAR = location(2, "Keller");
const SCREW = material(1, "Schraube", { tags: ["Kleinteile"] });
const OIL = material(2, "Hydrauliköl", { unit: "Liter", description: "Für die Presse" });
const FIRST = consumption(1, { quantity: 1.5 });
const SECOND = consumption(2, { storageLocationId: CELLAR.id, materialId: OIL.id, quantity: 0.3 });

const LOCATIONS_ROUTE = `GET ${API_PATHS.storageLocations}`;
const MATERIALS_ROUTE = `GET ${API_PATHS.materials}`;
const LIST_ROUTE = `GET ${API_PATHS.consumptions}`;
const CREATE_ROUTE = `POST ${API_PATHS.consumptions}`;
const PATCH_FIRST = `PATCH ${API_PATHS.consumptions}/${FIRST.id}`;
const DELETE_FIRST = `DELETE ${API_PATHS.consumptions}/${FIRST.id}`;
const ME_ROUTE = `GET ${API_PATHS.me}`;
const NETWORK_MESSAGE = "Server nicht erreichbar. Bitte die Verbindung prüfen.";

function stubAll(routes: Record<string, RouteHandler> = {}) {
  return stubApi({
    [LOCATIONS_ROUTE]: json([MAIN, CELLAR]),
    [MATERIALS_ROUTE]: json([SCREW, OIL]),
    [LIST_ROUTE]: json([FIRST, SECOND]),
    ...routes,
  });
}

function renderArea(role: Role = "ADMIN", onCurrentUserChange = vi.fn()) {
  return render(
    <CaptureArea
      api={createApiClient(vi.fn())}
      user={user(role)}
      onCurrentUserChange={onCurrentUserChange}
    />,
  );
}

async function openCreate() {
  fireEvent.click(await screen.findByRole("button", { name: "Verbrauch erfassen" }));
  return screen.getByRole("dialog", { name: "Verbrauch erfassen" });
}

async function openEditFirst() {
  fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Nr. 1" }));
  return screen.getByRole("dialog", { name: "Verbrauch Nr. 1 bearbeiten" });
}

function quantityField(dialog: HTMLElement) {
  return within(dialog).getByRole("textbox", { name: "Menge" }) as HTMLInputElement;
}

function locationField(dialog: HTMLElement) {
  return within(dialog).getByRole("combobox", { name: "Lagerort" }) as HTMLSelectElement;
}

function materialField(dialog: HTMLElement) {
  return within(dialog).getByRole("combobox", { name: "Material" }) as HTMLInputElement;
}

function filterField() {
  return screen.getByRole("combobox", { name: "Nach Lagerort filtern" }) as HTMLSelectElement;
}

function setQuantity(dialog: HTMLElement, value: string) {
  fireEvent.change(quantityField(dialog), { target: { value } });
}

function press(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole("button", { name }));
}

async function chooseMaterial(dialog: HTMLElement, search: string, option: string) {
  // Focus as with a real tap: without it, the Autocomplete resets the text of a selected value.
  fireEvent.focus(materialField(dialog));
  fireEvent.change(materialField(dialog), { target: { value: search } });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

function numbers() {
  return screen.getAllByText(/^Nr\. /).map((node) => node.textContent);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CaptureArea", () => {
  it("names the area with headings and without tabs for USER", async () => {
    stubAll();

    renderArea("USER");

    expect(screen.getByRole("heading", { level: 1, name: "Erfassung" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Verbrauch/Bedarf" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    await screen.findByText("Nr. 1");
  });
});

describe("Consumption list", () => {
  it("shows all fields of a record with German numbers and dates", async () => {
    stubAll();

    renderArea();

    const items = await screen.findAllByRole("listitem");
    const oil = within(items[0] as HTMLElement);
    expect(oil.getByText("Nr. 2")).toBeTruthy();
    expect(oil.getByRole("heading", { name: "Hydrauliköl" })).toBeTruthy();
    expect(oil.getByText("Menge: 0,3 Liter")).toBeTruthy();
    expect(oil.getByText("Lagerort: Keller")).toBeTruthy();
    expect(oil.getByText(`Datum: ${NOON_DATE}`)).toBeTruthy();
    expect(oil.getByText("Erfasst von: Erika Muster")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("Menge: 1,5 Stück")).toBeTruthy();
  });

  it("shows the newest records first, whatever the order from the server", async () => {
    stubAll({ [LIST_ROUTE]: json([consumption(1), consumption(3), consumption(2)]) });

    renderArea();
    await screen.findAllByRole("listitem");

    expect(numbers()).toEqual(["Nr. 3", "Nr. 2", "Nr. 1"]);
  });

  it("adds a new record at the top", async () => {
    stubAll({ [CREATE_ROUTE]: json(consumption(3), 201) });

    renderArea();
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    press(dialog, "Speichern");

    expect(await screen.findByText("Verbrauch erfasst.")).toBeTruthy();
    expect(numbers()).toEqual(["Nr. 3", "Nr. 2", "Nr. 1"]);
  });

  it("shows an unknown creator for a record without createdBy", async () => {
    stubAll({ [LIST_ROUTE]: json([consumption(1, { createdBy: null })]) });

    renderArea();

    expect(await screen.findByText("Erfasst von: unbekannt")).toBeTruthy();
  });

  it("shows placeholders for references missing from the lists", async () => {
    stubAll({
      [LIST_ROUTE]: json([consumption(1, { storageLocationId: "gone", materialId: "gone" })]),
    });

    renderArea();

    expect(await screen.findByRole("heading", { name: "Unbekanntes Material" })).toBeTruthy();
    expect(screen.getByText("Lagerort: Unbekannter Lagerort")).toBeTruthy();
    expect(screen.getByText("Menge: 1")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    stubAll({ [LIST_ROUTE]: json([]) });

    renderArea();

    expect(await screen.findByText("Noch kein Verbrauch erfasst.")).toBeTruthy();
  });

  it("shows loading indicators and a load error with a retry", async () => {
    const api = stubAll({ [LIST_ROUTE]: json({ message: "Liste kaputt" }, 500) });

    renderArea();

    expect(
      screen.getByRole("progressbar", { name: "Lagerorte und Material werden geladen" }),
    ).toBeTruthy();
    expect(await screen.findByText("Liste kaputt")).toBeTruthy();

    api.routes[LIST_ROUTE] = json([FIRST]);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Nr. 1")).toBeTruthy();
  });
});

describe("Consumption lookups", () => {
  it.each([
    ["locations", LOCATIONS_ROUTE],
    ["materials", MATERIALS_ROUTE],
  ])("shows a failed list of %s as an error and retries it", async (_name, route) => {
    const api = stubAll({ [route]: json({ message: "Lookup kaputt" }, 500) });
    const working = route === LOCATIONS_ROUTE ? MATERIALS_ROUTE : LOCATIONS_ROUTE;

    renderArea();

    expect(await screen.findByText("Lookup kaputt")).toBeTruthy();
    expect(screen.queryByText(/Zum Erfassen fehlt/)).toBeNull();
    expect(screen.queryByText("Nr. 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Verbrauch erfassen" })).toBeNull();

    api.routes[route] = route === LOCATIONS_ROUTE ? json([MAIN, CELLAR]) : json([SCREW, OIL]);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Nr. 1")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(2);
    expect(api.bodies(working)).toHaveLength(1);
  });

  it("shows one message when both lists fail", async () => {
    stubAll({
      [LOCATIONS_ROUTE]: json({ message: "Kaputt" }, 500),
      [MATERIALS_ROUTE]: json({ message: "Kaputt" }, 500),
    });

    renderArea();

    await waitFor(() => expect(screen.getAllByText("Kaputt")).toHaveLength(1));
  });
});

describe("Consumption hint without master data", () => {
  it.each<[Role, string, string, RegExp]>([
    ["USER", LOCATIONS_ROUTE, "Lagerort", /Bitte an ADMIN oder MANAGER wenden/],
    ["USER", MATERIALS_ROUTE, "Material", /Bitte an ADMIN oder MANAGER wenden/],
    ["MANAGER", LOCATIONS_ROUTE, "Lagerort", /in den Stammdaten anlegen/],
    ["ADMIN", MATERIALS_ROUTE, "Material", /in den Stammdaten anlegen/],
  ])("explains it to %s for %s instead of a dialog", async (role, route, missing, solution) => {
    stubAll({ [route]: json([]) });

    renderArea(role);

    const hint = await screen.findByText(solution);
    expect(hint.textContent).toContain(missing);
    expect(screen.queryByRole("button", { name: "Verbrauch erfassen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("Nr. 1")).toBeTruthy();
  });

  it("does not mention the master data to USER", async () => {
    stubAll({ [MATERIALS_ROUTE]: json([]) });

    renderArea("USER");

    const hint = await screen.findByText(/Zum Erfassen fehlt/);
    expect(hint.textContent).not.toContain("Stammdaten");
  });

  it("offers the dialog after new master data were loaded by the button", async () => {
    const api = stubAll({ [MATERIALS_ROUTE]: json([]) });

    renderArea("USER");
    await screen.findByText(/Zum Erfassen fehlt/);
    api.routes[MATERIALS_ROUTE] = json([SCREW]);
    fireEvent.click(screen.getByRole("button", { name: "Neu laden" }));

    expect(await screen.findByRole("button", { name: "Verbrauch erfassen" })).toBeTruthy();
    expect(screen.queryByText(/Zum Erfassen fehlt/)).toBeNull();
  });

  describe("loading again with the button", () => {
    function reloadButton() {
      return screen.getByRole("button", { name: "Neu laden" }) as HTMLButtonElement;
    }

    it("shows the progress and blocks the button until the answer", async () => {
      let finish: (response: Response) => void = () => undefined;
      const api = stubAll({ [MATERIALS_ROUTE]: json([]) });

      renderArea("USER");
      await screen.findByText(/Zum Erfassen fehlt/);
      api.routes[MATERIALS_ROUTE] = (() =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })) as unknown as RouteHandler;
      fireEvent.click(reloadButton());

      expect(screen.getByRole("progressbar", { name: "Wird neu geladen" })).toBeTruthy();
      expect(reloadButton().disabled).toBe(true);
      fireEvent.click(reloadButton());
      await waitFor(() => expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2));

      finish(Response.json([]));
      await screen.findByRole("status");
      expect(screen.queryByRole("progressbar", { name: "Wird neu geladen" })).toBeNull();
      expect(reloadButton().disabled).toBe(false);
      expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2);
    });

    it("says so when the answer is still empty", async () => {
      const api = stubAll({ [MATERIALS_ROUTE]: json([]) });

      renderArea("USER");
      await screen.findByText(/Zum Erfassen fehlt/);
      expect(screen.queryByText(/Die Daten fehlen weiterhin/)).toBeNull();
      fireEvent.click(reloadButton());

      expect(await screen.findByText("Neu geladen: Die Daten fehlen weiterhin.")).toBeTruthy();
      expect(screen.getByText(/Zum Erfassen fehlt/)).toBeTruthy();
      expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2);
    });

    it.each<[string, RouteHandler, string]>([
      ["a server error", json({ message: "Kaputt" }, 500), "Kaputt"],
      [
        "a lost connection",
        () => {
          throw new TypeError("Failed to fetch");
        },
        NETWORK_MESSAGE,
      ],
    ])("shows %s with a retry that can succeed", async (_name, failure, message) => {
      const api = stubAll({ [MATERIALS_ROUTE]: json([]) });

      renderArea("USER");
      await screen.findByText(/Zum Erfassen fehlt/);
      api.routes[MATERIALS_ROUTE] = failure;
      fireEvent.click(reloadButton());

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText(/Zum Erfassen fehlt/)).toBeTruthy();
      expect(screen.queryByText(/Die Daten fehlen weiterhin/)).toBeNull();

      api.routes[MATERIALS_ROUTE] = json([SCREW]);
      fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

      expect(await screen.findByRole("button", { name: "Verbrauch erfassen" })).toBeTruthy();
      expect(screen.queryByText(message)).toBeNull();
    });
  });

  it("still allows changing an existing record, showing its own values", async () => {
    stubAll({ [LOCATIONS_ROUTE]: json([]), [MATERIALS_ROUTE]: json([]) });

    renderArea();
    const dialog = await openEditFirst();

    expect(locationField(dialog).selectedOptions[0]?.textContent).toBe("Unbekannter Lagerort");
    expect(materialField(dialog).value).toBe("Unbekanntes Material");
  });
});

describe("Consumption filter", () => {
  it("shows all locations first, then the chosen one with the number of hits", async () => {
    stubAll();

    renderArea();
    await screen.findByText("Nr. 1");
    expect(filterField().value).toBe("");
    expect(filterField().selectedOptions[0]?.textContent).toBe("Alle Lagerorte");
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.change(filterField(), { target: { value: CELLAR.id } });

    expect(numbers()).toEqual(["Nr. 2"]);
    expect(screen.getByRole("status").textContent).toBe("Filter aktiv: 1 von 2 Verbräuchen");

    fireEvent.change(filterField(), { target: { value: "" } });

    expect(numbers()).toEqual(["Nr. 2", "Nr. 1"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says so when the location has no records", async () => {
    stubAll({ [LIST_ROUTE]: json([FIRST]) });

    renderArea();
    await screen.findByText("Nr. 1");
    fireEvent.change(filterField(), { target: { value: CELLAR.id } });

    expect(screen.getByText("Keine Einträge für „Keller“.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Filter aktiv: 0 von 1 Verbrauch");
  });

  it("preselects the filtered location when creating, and it stays changeable", async () => {
    const api = stubAll({ [CREATE_ROUTE]: json(consumption(3), 201) });

    renderArea();
    await screen.findByText("Nr. 1");
    fireEvent.change(filterField(), { target: { value: CELLAR.id } });
    const dialog = await openCreate();

    expect(locationField(dialog).value).toBe(CELLAR.id);

    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    press(dialog, "Speichern");

    await screen.findByText("Verbrauch erfasst.");
    expect(api.bodies(CREATE_ROUTE)).toEqual([
      { storageLocationId: MAIN.id, materialId: SCREW.id, quantity: 1 },
    ]);
  });

  it("preselects nothing without a filter", async () => {
    stubAll();

    renderArea();
    const dialog = await openCreate();

    expect(locationField(dialog).value).toBe("");
  });

  it("keeps the filter visible when a new record does not match it", async () => {
    stubAll({ [LIST_ROUTE]: json([FIRST]), [CREATE_ROUTE]: json(consumption(3), 201) });

    renderArea();
    await screen.findByText("Nr. 1");
    fireEvent.change(filterField(), { target: { value: CELLAR.id } });
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    press(dialog, "Speichern");

    expect(await screen.findByText("Verbrauch erfasst.")).toBeTruthy();
    expect(filterField().value).toBe(CELLAR.id);
    expect(screen.getByRole("status").textContent).toBe("Filter aktiv: 0 von 2 Verbräuchen");
    expect(screen.queryByText("Nr. 3")).toBeNull();
  });

  it("falls back to all locations when the filtered location vanished", async () => {
    const api = stubAll({
      [LIST_ROUTE]: json([FIRST]),
      [CREATE_ROUTE]: json({ message: "Lagerort unbekannt" }, 400),
    });

    renderArea();
    await screen.findByText("Nr. 1");
    fireEvent.change(filterField(), { target: { value: CELLAR.id } });
    expect(screen.queryByText("Nr. 1")).toBeNull();

    // A rejected reference loads the lists again behind the dialog.
    const dialog = await openCreate();
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    api.routes[LOCATIONS_ROUTE] = json([MAIN]);
    press(dialog, "Speichern");
    await within(dialog).findByText("Lagerort unbekannt");
    press(dialog, "Abbrechen");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await waitFor(() =>
      expect(filterField().selectedOptions[0]?.textContent).toBe("Alle Lagerorte"),
    );
    expect(screen.getByText("Nr. 1")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(locationField(await openCreate()).value).toBe("");
  });
});

describe("Consumption rights", () => {
  const OTHER = consumption(2, { createdBy: { id: "u-other", displayName: "Max" } });
  const LEGACY = consumption(3, { createdBy: null });
  const ALL = [FIRST, OTHER, LEGACY];

  it.each<[Role, number[]]>([
    ["ADMIN", [1, 2, 3]],
    ["MANAGER", [1, 2, 3]],
    ["USER", [1]],
  ])("offers the buttons to %s for records %j", async (role, allowed) => {
    stubAll({ [LIST_ROUTE]: json(ALL) });

    renderArea(role);
    await screen.findByText("Nr. 1");

    for (const number of [1, 2, 3]) {
      const expected = allowed.includes(number);
      expect(screen.queryByRole("button", { name: `Bearbeiten: Nr. ${number}` }) !== null).toBe(
        expected,
      );
      expect(screen.queryByRole("button", { name: `Löschen: Nr. ${number}` }) !== null).toBe(
        expected,
      );
    }
  });

  it("offers USER to create records", async () => {
    stubAll();

    renderArea("USER");

    expect(await screen.findByRole("button", { name: "Verbrauch erfassen" })).toBeTruthy();
  });

  it("updates the buttons when the role changes", async () => {
    stubAll({ [LIST_ROUTE]: json([OTHER]) });
    const api = createApiClient(vi.fn());

    const { rerender } = render(
      <CaptureArea api={api} user={user("MANAGER")} onCurrentUserChange={vi.fn()} />,
    );
    await screen.findByRole("button", { name: "Bearbeiten: Nr. 2" });
    rerender(<CaptureArea api={api} user={user("USER")} onCurrentUserChange={vi.fn()} />);

    expect(screen.getByText("Nr. 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten: Nr. 2" })).toBeNull();
  });
});

describe("Consumption dialog: create", () => {
  it("starts with the quantity 1 and no unit, then shows the unit of the material", async () => {
    stubAll();

    renderArea();
    const dialog = await openCreate();

    expect(quantityField(dialog).value).toBe("1");
    expect(quantityField(dialog).getAttribute("inputmode")).toBe("decimal");
    expect(within(dialog).queryByText("Liter")).toBeNull();

    await chooseMaterial(dialog, "hydraulik", "Hydrauliköl (Liter)");

    expect(materialField(dialog).value).toBe("Hydrauliköl");
    // The full name stays readable below the narrow field.
    expect(within(dialog).getByText("Hydrauliköl")).toBeTruthy();
    expect(within(dialog).queryByText(/^Suche nach Name/)).toBeNull();
    expect(within(dialog).getByText("Liter")).toBeTruthy();
  });

  it("sends the location, the material and the typed quantity", async () => {
    const api = stubAll({ [CREATE_ROUTE]: json(consumption(3), 201) });

    renderArea();
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: CELLAR.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    setQuantity(dialog, "2,5");
    press(dialog, "Speichern");

    expect(await screen.findByText("Verbrauch erfasst.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.bodies(CREATE_ROUTE)).toEqual([
      { storageLocationId: CELLAR.id, materialId: SCREW.id, quantity: 2.5 },
    ]);
  });

  it("asks for a location and a material without sending", async () => {
    const api = stubAll();

    renderArea();
    const dialog = await openCreate();
    press(dialog, "Speichern");

    expect(await within(dialog).findByText("Bitte einen Lagerort wählen.")).toBeTruthy();

    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    press(dialog, "Speichern");

    expect(await within(dialog).findByText("Bitte ein Material wählen.")).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });

  it("does not send twice while the request is pending", async () => {
    let finish: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const api = stubAll({
      [CREATE_ROUTE]: (() => pending) as unknown as RouteHandler,
    });

    renderArea();
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    press(dialog, "Speichern");
    await waitFor(() => expect(api.bodies(CREATE_ROUTE)).toHaveLength(1));
    fireEvent.submit(within(dialog).getByRole("button", { name: "Speichern" }).closest("form")!);

    expect(api.bodies(CREATE_ROUTE)).toHaveLength(1);

    finish(Response.json(consumption(3), { status: 201 }));
    await screen.findByText("Verbrauch erfasst.");
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(1);
  });
});

describe("Consumption dialog: material search", () => {
  async function optionsFor(search: string) {
    stubAll({
      [MATERIALS_ROUTE]: json([SCREW, OIL, material(3, "Mutter", { unit: "Packung" })]),
    });
    renderArea();
    const dialog = await openCreate();
    fireEvent.focus(materialField(dialog));
    if (search === "") press(dialog, "Liste öffnen");
    else fireEvent.change(materialField(dialog), { target: { value: search } });
    // Without the listbox, the options of the select for the location would count as well.
    const listbox = screen.queryByRole("listbox");
    if (!listbox) return [];
    return within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  it.each<[string, string[]]>([
    ["SCHRAUBE", ["Schraube (Stück)"]],
    ["kleinteile", ["Schraube (Stück)"]],
    ["presse", ["Hydrauliköl (Liter)"]],
    ["hyd pres", ["Hydrauliköl (Liter)"]],
    ["", ["Schraube (Stück)", "Hydrauliköl (Liter)", "Mutter (Packung)"]],
  ])("finds by name, tag and description for %j like the material tab", async (search, hits) => {
    expect(await optionsFor(search)).toEqual(hits);
  });

  it("says so when nothing was found", async () => {
    expect(await optionsFor("gibtsnicht")).toEqual([]);
    expect(screen.getByText("Kein Material gefunden")).toBeTruthy();
  });
});

describe("Consumption dialog: quantity", () => {
  async function dialogWithQuantity(value?: string) {
    stubAll();
    renderArea();
    const dialog = await openCreate();
    if (value !== undefined) setQuantity(dialog, value);
    return dialog;
  }

  function minus(dialog: HTMLElement) {
    return within(dialog).getByRole("button", { name: "Menge verringern" }) as HTMLButtonElement;
  }

  function plus(dialog: HTMLElement) {
    return within(dialog).getByRole("button", { name: "Menge erhöhen" }) as HTMLButtonElement;
  }

  it("changes by 1 with + and − and blocks − at 1", async () => {
    const dialog = await dialogWithQuantity();
    expect(minus(dialog).disabled).toBe(true);

    fireEvent.click(plus(dialog));
    expect(quantityField(dialog).value).toBe("2");
    expect(minus(dialog).disabled).toBe(false);

    fireEvent.click(minus(dialog));
    expect(quantityField(dialog).value).toBe("1");
    expect(minus(dialog).disabled).toBe(true);
  });

  it("stays exact with decimals", async () => {
    const dialog = await dialogWithQuantity("1,1");

    fireEvent.click(plus(dialog));
    expect(quantityField(dialog).value).toBe("2,1");
    fireEvent.click(plus(dialog));
    expect(quantityField(dialog).value).toBe("3,1");
    fireEvent.click(minus(dialog));
    fireEvent.click(minus(dialog));
    fireEvent.click(minus(dialog));
    expect(quantityField(dialog).value).toBe("0,1");
    expect(minus(dialog).disabled).toBe(true);
  });

  it("accepts a point and turns it into a comma with a button", async () => {
    const dialog = await dialogWithQuantity("1.5");

    fireEvent.click(plus(dialog));

    expect(quantityField(dialog).value).toBe("2,5");
  });

  it("blocks both buttons for text that is no number", async () => {
    const dialog = await dialogWithQuantity("1,2,3");

    expect(minus(dialog).disabled).toBe(true);
    expect(plus(dialog).disabled).toBe(true);
  });

  it("allows only + in an empty field", async () => {
    const dialog = await dialogWithQuantity("");

    expect(minus(dialog).disabled).toBe(true);
    fireEvent.click(plus(dialog));

    expect(quantityField(dialog).value).toBe("1");
  });

  it.each<[string, RegExp]>([
    ["", /Bitte eine Menge/],
    ["abc", /muss eine Zahl sein/],
    ["1,2,3", /muss eine Zahl sein/],
    ["0", /größer als 0/],
    ["0,0", /größer als 0/],
    ["-2", /größer als 0/],
    ["1,2345", /Nachkommastellen/],
  ])("shows a message for %j and sends nothing", async (value, message) => {
    const api = stubAll();
    renderArea();
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    setQuantity(dialog, value);
    press(dialog, "Speichern");

    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });
});

describe("Consumption dialog: change", () => {
  it("starts with the values of the record", async () => {
    stubAll();

    renderArea();
    await screen.findByText("Nr. 1");
    fireEvent.change(filterField(), { target: { value: MAIN.id } });
    const dialog = await openEditFirst();

    expect(locationField(dialog).value).toBe(MAIN.id);
    expect(materialField(dialog).value).toBe("Schraube");
    expect(quantityField(dialog).value).toBe("1,5");
    expect(within(dialog).getByText("Stück")).toBeTruthy();
  });

  it("closes without a request when nothing changed", async () => {
    const api = stubAll();

    renderArea();
    const dialog = await openEditFirst();
    press(dialog, "Speichern");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(PATCH_FIRST)).toHaveLength(0);
    expect(screen.queryByText("Verbrauch gespeichert.")).toBeNull();
  });

  it("treats the same quantity in another notation as unchanged", async () => {
    const api = stubAll();

    renderArea();
    const dialog = await openEditFirst();
    setQuantity(dialog, "1.50");
    press(dialog, "Speichern");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(PATCH_FIRST)).toHaveLength(0);
  });

  it.each<[string, (dialog: HTMLElement) => Promise<void> | void, object]>([
    ["quantity", (dialog) => setQuantity(dialog, "2,5"), { quantity: 2.5 }],
    [
      "location",
      (dialog) => {
        fireEvent.change(locationField(dialog), { target: { value: CELLAR.id } });
      },
      { storageLocationId: CELLAR.id },
    ],
    [
      "material",
      (dialog) => chooseMaterial(dialog, "hydraulik", "Hydrauliköl (Liter)"),
      { materialId: OIL.id },
    ],
  ])("sends only the changed %s", async (_name, change, body) => {
    const api = stubAll({ [PATCH_FIRST]: json({ ...FIRST, quantity: 2.5 }) });

    renderArea();
    const dialog = await openEditFirst();
    await change(dialog);
    press(dialog, "Speichern");

    expect(await screen.findByText("Verbrauch gespeichert.")).toBeTruthy();
    expect(api.bodies(PATCH_FIRST)).toEqual([body]);
    expect(screen.getByText("Menge: 2,5 Stück")).toBeTruthy();
  });

  it("keeps a record usable whose references are missing", async () => {
    const lost = consumption(1, { storageLocationId: "gone-l", materialId: "gone-m", quantity: 2 });
    const api = stubAll({
      [LIST_ROUTE]: json([lost]),
      [PATCH_FIRST]: json({ ...lost, quantity: 3 }),
    });

    renderArea();
    const dialog = await openEditFirst();

    expect(materialField(dialog).value).toBe("Unbekanntes Material");
    expect(locationField(dialog).value).toBe("gone-l");

    press(dialog, "Menge erhöhen");
    press(dialog, "Speichern");

    expect(await screen.findByText("Menge: 3")).toBeTruthy();
    expect(api.bodies(PATCH_FIRST)).toEqual([{ quantity: 3 }]);
  });

  it("blocks both steps for an older quantity with too many decimals", async () => {
    const old = consumption(1, { quantity: 1.23456 });
    const api = stubAll({
      [LIST_ROUTE]: json([old]),
      [PATCH_FIRST]: json({ ...old, quantity: 2 }),
    });

    renderArea();
    const dialog = await openEditFirst();

    expect(quantityField(dialog).value).toBe("1,23456");
    const plus = within(dialog).getByRole("button", { name: "Menge erhöhen" });
    const minus = within(dialog).getByRole("button", { name: "Menge verringern" });
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    expect((minus as HTMLButtonElement).disabled).toBe(true);

    setQuantity(dialog, "2");
    expect((plus as HTMLButtonElement).disabled).toBe(false);
    press(dialog, "Speichern");

    await screen.findByText("Verbrauch gespeichert.");
    expect(api.bodies(PATCH_FIRST)).toEqual([{ quantity: 2 }]);
  });

  it("does not reject an older record for having too many decimals", async () => {
    const old = consumption(1, { quantity: 1.23456 });
    const api = stubAll({ [LIST_ROUTE]: json([old]), [PATCH_FIRST]: json(old) });

    renderArea();
    const dialog = await openEditFirst();
    fireEvent.change(locationField(dialog), { target: { value: CELLAR.id } });
    press(dialog, "Speichern");

    await screen.findByText("Verbrauch gespeichert.");
    expect(api.bodies(PATCH_FIRST)).toEqual([{ storageLocationId: CELLAR.id }]);
  });
});

describe("Consumption quantity with thousands points", () => {
  it("refuses it with a clear message and blocks the steps", async () => {
    const api = stubAll();
    renderArea();
    const dialog = await openCreate();
    fireEvent.change(locationField(dialog), { target: { value: MAIN.id } });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    setQuantity(dialog, "1.000");

    expect(
      (within(dialog).getByRole("button", { name: "Menge erhöhen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    press(dialog, "Speichern");

    expect(await within(dialog).findByText(/ohne Tausenderpunkt/)).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });
});

describe("Consumption delete", () => {
  it("asks first and names the record", async () => {
    const api = stubAll({ [DELETE_FIRST]: noContent });

    renderArea();
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: Nr. 1" }));
    const dialog = screen.getByRole("dialog", { name: "Verbrauch löschen" });

    expect(within(dialog).getByText(/Verbrauch Nr\. 1 \(Schraube\)/)).toBeTruthy();
    expect(api.bodies(DELETE_FIRST)).toHaveLength(0);

    press(dialog, "Löschen");

    expect(await screen.findByText("Verbrauch gelöscht.")).toBeTruthy();
    expect(api.bodies(DELETE_FIRST)).toHaveLength(1);
    expect(numbers()).toEqual(["Nr. 2"]);
  });

  it("does nothing after cancelling", async () => {
    const api = stubAll();

    renderArea();
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: Nr. 1" }));
    press(screen.getByRole("dialog"), "Abbrechen");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(DELETE_FIRST)).toHaveLength(0);
    expect(numbers()).toEqual(["Nr. 2", "Nr. 1"]);
  });
});

describe("Consumption errors", () => {
  async function savePatch(routes: Record<string, RouteHandler>, onUser = vi.fn()) {
    const api = stubAll(routes);
    renderArea("MANAGER", onUser);
    const dialog = await openEditFirst();
    setQuantity(dialog, "2");
    press(dialog, "Speichern");
    return { api, dialog };
  }

  it.each<[string, number]>([
    ["Das Material ist unbekannt.", 400],
    ["Konflikt mit dem Stand.", 409],
  ])("shows %s in the dialog for %d", async (message, status) => {
    const { dialog } = await savePatch({ [PATCH_FIRST]: json({ message }, status) });

    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(quantityField(dialog).value).toBe("2");
  });

  it("shows a network error in the dialog and can send again", async () => {
    const { api, dialog } = await savePatch({
      [PATCH_FIRST]: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await within(dialog).findByText(NETWORK_MESSAGE)).toBeTruthy();

    api.routes[PATCH_FIRST] = json({ ...FIRST, quantity: 2 });
    press(dialog, "Speichern");

    expect(await screen.findByText("Verbrauch gespeichert.")).toBeTruthy();
  });

  it("refreshes the lists behind the dialog after an unknown reference", async () => {
    const { api, dialog } = await savePatch({
      [PATCH_FIRST]: json({ message: "Das Material ist unbekannt." }, 400),
    });

    await within(dialog).findByText("Das Material ist unbekannt.");

    await waitFor(() => expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2));
    expect(api.bodies(LOCATIONS_ROUTE)).toHaveLength(2);
  });

  it("closes for a 404, shows the message and loads the list again", async () => {
    const { api } = await savePatch({
      [PATCH_FIRST]: json({ message: "Nicht gefunden." }, 404),
    });

    expect(await screen.findByText("Nicht gefunden.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(api.bodies(LIST_ROUTE)).toHaveLength(2));
    expect(api.bodies(ME_ROUTE)).toHaveLength(0);
  });

  it("closes for a 403, loads the list again and compares the own user", async () => {
    const onUser = vi.fn();
    const { api } = await savePatch(
      {
        [PATCH_FIRST]: json({ message: "Keine Berechtigung." }, 403),
        [ME_ROUTE]: json(user("USER")),
      },
      onUser,
    );

    expect(await screen.findByText("Keine Berechtigung.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(onUser).toHaveBeenCalledWith(user("USER")));
    await waitFor(() => expect(api.bodies(LIST_ROUTE)).toHaveLength(2));
  });

  it("handles a 403 when deleting in the same way", async () => {
    const onUser = vi.fn();
    stubAll({
      [DELETE_FIRST]: json({ message: "Keine Berechtigung." }, 403),
      [ME_ROUTE]: json(user("MANAGER")),
    });

    renderArea("MANAGER", onUser);
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: Nr. 1" }));
    press(screen.getByRole("dialog"), "Löschen");

    expect(await screen.findByText("Keine Berechtigung.")).toBeTruthy();
    await waitFor(() => expect(onUser).toHaveBeenCalledTimes(1));
  });

  it("goes back to the login for a 401", async () => {
    const onUnauthorized = vi.fn();
    stubAll({ [LIST_ROUTE]: json({ message: "Nicht angemeldet" }, 401) });

    render(
      <CaptureArea
        api={createApiClient(onUnauthorized)}
        user={user("USER")}
        onCurrentUserChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
