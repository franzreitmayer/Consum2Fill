import { API_PATHS, type Material, type StorageLocation } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { MasterDataArea } from "./MasterDataArea";
import { json, stubApi } from "./testing/stubApi";

const TIMES = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

function location(number: number, name: string): StorageLocation {
  return { id: `l-${number}`, number, name, ...TIMES };
}

function material(number: number, name: string, tags: string[] = []): Material {
  return { id: `m-${number}`, number, name, unit: "Stück", description: "", tags, ...TIMES };
}

const LOCATIONS_ROUTE = `GET ${API_PATHS.storageLocations}`;
const MATERIALS_ROUTE = `GET ${API_PATHS.materials}`;

function stubLists() {
  return stubApi({
    [LOCATIONS_ROUTE]: json([location(1, "Hauptlager")]),
    [MATERIALS_ROUTE]: json([material(1, "Schraube")]),
  });
}

function renderArea() {
  return render(<MasterDataArea api={createApiClient(vi.fn())} onCurrentUserChange={vi.fn()} />);
}

function panel(name: string) {
  return screen.getByRole("tabpanel", { name });
}

function openTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MasterDataArea tabs", () => {
  it("offers both tabs and starts with the storage locations", async () => {
    stubLists();

    renderArea();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Lagerorte",
      "Material",
    ]);
    expect(screen.getByRole("tab", { name: "Lagerorte", selected: true })).toBeTruthy();
    expect(await within(panel("Lagerorte")).findByText("Hauptlager")).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Material" })).toBeNull();
  });

  it("shows the material after changing the tab and hides the other panel", async () => {
    stubLists();

    renderArea();
    openTab("Material");

    expect(await within(panel("Material")).findByText("Schraube")).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Lagerorte" })).toBeNull();
  });

  it("keeps the panels mounted, so that the search survives a change of the tab", async () => {
    stubLists();

    renderArea();
    openTab("Material");
    const search = await screen.findByRole("searchbox", { name: "Material suchen" });
    fireEvent.change(search, { target: { value: "schr" } });
    openTab("Lagerorte");
    openTab("Material");

    expect(screen.getByRole("searchbox", { name: "Material suchen" })).toHaveProperty(
      "value",
      "schr",
    );
  });

  it("works with the storage locations inside the tab", async () => {
    const created = location(2, "Keller");
    const api = stubLists();
    api.routes[`POST ${API_PATHS.storageLocations}`] = json(created, 201);

    renderArea();
    fireEvent.click(await screen.findByRole("button", { name: "Lagerort anlegen" }));
    const dialog = screen.getByRole("dialog", { name: "Lagerort anlegen" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Keller" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Lagerort angelegt.")).toBeTruthy();
    expect(within(panel("Lagerorte")).getByText("Keller")).toBeTruthy();
  });
});

describe("MasterDataArea refresh of a panel shown again", () => {
  it("refreshes the list of the panel only when it becomes visible again", async () => {
    const api = stubLists();

    renderArea();
    await screen.findByText("Hauptlager");
    await screen.findByText("Schraube");
    expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(1);

    api.routes[MATERIALS_ROUTE] = json([material(1, "Schraube"), material(2, "Mutter", ["Neu"])]);
    openTab("Material");

    expect(await screen.findByText("Mutter")).toBeTruthy();
    expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2);
    expect(api.bodies(LOCATIONS_ROUTE)).toHaveLength(1);

    api.routes[LOCATIONS_ROUTE] = json([location(1, "Hauptlager"), location(2, "Keller")]);
    openTab("Lagerorte");

    expect(await screen.findByText("Keller")).toBeTruthy();
  });

  it("offers the tags of the refreshed list as suggestions", async () => {
    const api = stubLists();

    renderArea();
    await screen.findByText("Schraube");
    api.routes[MATERIALS_ROUTE] = json([material(1, "Schraube", ["Kleinteile"])]);
    openTab("Material");
    await screen.findByText("Kleinteile");

    fireEvent.click(screen.getByRole("button", { name: "Material anlegen" }));
    const field = screen.getByRole("combobox", { name: "Schlagworte" });
    fireEvent.change(field, { target: { value: "klein" } });

    expect(await screen.findByRole("option", { name: "Kleinteile" })).toBeTruthy();
  });

  it("recovers from a failed load when the panel is shown", async () => {
    const api = stubLists();
    api.routes[MATERIALS_ROUTE] = json({ message: "Kaputt" }, 500);

    renderArea();
    await screen.findByText("Kaputt");
    api.routes[MATERIALS_ROUTE] = json([material(1, "Schraube")]);
    openTab("Material");

    expect(await screen.findByText("Schraube")).toBeTruthy();
    expect(screen.queryByText("Kaputt")).toBeNull();
  });

  it("keeps the list when refreshing fails", async () => {
    const api = stubLists();

    renderArea();
    await screen.findByText("Schraube");
    api.routes[MATERIALS_ROUTE] = json({ message: "Kaputt" }, 500);
    openTab("Material");

    await waitFor(() => expect(api.bodies(MATERIALS_ROUTE)).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.getByText("Schraube")).toBeTruthy();
    expect(screen.queryByText("Kaputt")).toBeNull();
  });
});

describe("MasterDataArea sorted lists", () => {
  it("adds a new storage location at its place by number", async () => {
    const api = stubApi({
      [LOCATIONS_ROUTE]: json([location(1, "Hauptlager"), location(7, "Werkstatt")]),
      [MATERIALS_ROUTE]: json([]),
      [`POST ${API_PATHS.storageLocations}`]: json(location(3, "Keller"), 201),
    });

    renderArea();
    fireEvent.click(await screen.findByRole("button", { name: "Lagerort anlegen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Keller" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    await screen.findByText("Lagerort angelegt.");
    const numbers = within(panel("Lagerorte"))
      .getAllByText(/^Nr\. /)
      .map((node) => node.textContent);
    expect(numbers).toEqual(["Nr. 1", "Nr. 3", "Nr. 7"]);
    expect(api.bodies(`POST ${API_PATHS.storageLocations}`)).toHaveLength(1);
  });
});
