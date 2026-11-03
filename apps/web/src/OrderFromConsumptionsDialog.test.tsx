import { API_PATHS, MAX_CONSUMPTIONS_PER_ORDER, type Role } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { CaptureArea } from "./CaptureArea";
import {
  CELLAR,
  CONSUMPTIONS_ROUTE,
  consumption,
  MAX,
  OIL,
  order,
  ORDERS_ROUTE,
  stubCapture,
  user,
} from "./testing/captureFixtures";
import { json, type RouteHandler } from "./testing/stubApi";

const ORDER_ROUTE = `POST ${API_PATHS.ordersFromConsumptions}`;

// Nr. 1, 2 and 5 share material and location; 3 and 4 differ in one of them.
const ONE = consumption(1, { quantity: 0.1 });
const TWO = consumption(2, {
  quantity: 0.2,
  createdBy: MAX,
  updatedAt: "2026-03-16T08:30:00.000Z",
});
const OTHER_LOCATION = consumption(3, { storageLocationId: CELLAR.id });
const OTHER_MATERIAL = consumption(4, { materialId: OIL.id });
const FIVE = consumption(5, { quantity: 1.5 });
const ALL = [ONE, TWO, OTHER_LOCATION, OTHER_MATERIAL, FIVE];
const CREATED = order(9, {
  quantity: 1.8,
  requestedBy: [
    { number: 1, createdBy: ONE.createdBy },
    { number: 2, createdBy: MAX },
    { number: 5, createdBy: FIVE.createdBy },
  ],
});

function stubAll(routes: Record<string, RouteHandler> = {}) {
  return stubCapture({ [CONSUMPTIONS_ROUTE]: json(ALL), ...routes });
}

function renderArea(role: Role = "MANAGER") {
  return render(
    <CaptureArea api={createApiClient(vi.fn())} user={user(role)} onCurrentUserChange={vi.fn()} />,
  );
}

async function openOrderFor(number: number) {
  fireEvent.click(await screen.findByRole("button", { name: `Bestellen: Nr. ${number}` }));
  return screen.getByRole("dialog", { name: "Bestellung aus Verbrauch" });
}

function checkbox(dialog: HTMLElement, number: number) {
  return within(dialog).getByRole("checkbox", {
    name: new RegExp(`^Nr\\. ${number}:`),
  }) as HTMLInputElement;
}

function checkedNumbers(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole("checkbox")
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => /^Nr\. (\d+):/.exec(labelOf(box))?.[1]);
}

function labelOf(box: HTMLElement): string {
  return box.closest("label")?.textContent ?? "";
}

function quantity(dialog: HTMLElement) {
  return (within(dialog).getByRole("textbox", { name: "Menge" }) as HTMLInputElement).value;
}

function numbers() {
  return screen
    .getAllByText(/^Nr\. \d+$/)
    .filter((node) => node.closest("[hidden]") === null)
    .map((node) => node.textContent);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Order button on consumptions", () => {
  it.each<[Role, boolean]>([
    ["ADMIN", true],
    ["MANAGER", true],
    ["USER", false],
  ])("is offered to %s: %s", async (role, offered) => {
    stubAll();

    renderArea(role);
    await screen.findByText("Nr. 5");

    for (const record of ALL) {
      const button = screen.queryByRole("button", { name: `Bestellen: Nr. ${record.number}` });
      expect(button !== null).toBe(offered);
    }
    // USER keeps the buttons for the own records.
    expect(screen.getByRole("button", { name: "Bearbeiten: Nr. 1" })).toBeTruthy();
  });
});

describe("Order from consumptions dialog", () => {
  it("offers all loaded consumptions of the material and location, all checked", async () => {
    stubAll();

    renderArea();
    const dialog = await openOrderFor(2);

    expect(within(dialog).getByText("Material: Schraube")).toBeTruthy();
    expect(within(dialog).getByText("Lagerort: Hauptlager")).toBeTruthy();
    // Fixed: no fields to choose them.
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
    expect(checkedNumbers(dialog)).toEqual(["1", "2", "5"]);
    expect(labelOf(checkbox(dialog, 2))).toBe("Nr. 2: 0,2 Stück, Max Beispiel, 15.03.2026");
    expect(quantity(dialog)).toBe("1,8");
  });

  it("adds without rounding errors and follows the choice", async () => {
    stubAll();

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.click(checkbox(dialog, 5));

    // 0.1 + 0.2 as binary numbers would be 0.30000000000000004.
    expect(quantity(dialog)).toBe("0,3");

    fireEvent.click(checkbox(dialog, 5));
    expect(quantity(dialog)).toBe("1,8");
  });

  it("toggles with a tap on the text of the row", async () => {
    stubAll();

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.click(within(dialog).getByText(/^Nr\. 2:/));

    expect(checkbox(dialog, 2).checked).toBe(false);
    expect(quantity(dialog)).toBe("1,6");
  });

  it("keeps at least one consumption checked", async () => {
    stubAll();

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.click(checkbox(dialog, 2));
    fireEvent.click(checkbox(dialog, 5));

    expect(checkbox(dialog, 1).checked).toBe(true);
    expect(checkbox(dialog, 1).disabled).toBe(true);
    expect(quantity(dialog)).toBe("0,1");

    // Another one checked again releases the last one.
    fireEvent.click(checkbox(dialog, 2));
    expect(checkbox(dialog, 1).disabled).toBe(false);
    fireEvent.click(checkbox(dialog, 1));
    expect(checkedNumbers(dialog)).toEqual(["2"]);
    expect(quantity(dialog)).toBe("0,2");
  });

  it("keeps the quantity changeable and sends the loaded state of the checked ones", async () => {
    const stub = stubAll({ [ORDER_ROUTE]: json(CREATED, 201) });

    renderArea();
    const dialog = await openOrderFor(5);
    fireEvent.click(checkbox(dialog, 1));
    press(dialog, "Menge erhöhen");
    expect(quantity(dialog)).toBe("2,7");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Menge" }), {
      target: { value: "3,25" },
    });
    press(dialog, "Bestellen");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stub.bodies(ORDER_ROUTE)).toEqual([
      {
        consumptions: [
          { id: TWO.id, updatedAt: TWO.updatedAt },
          { id: FIVE.id, updatedAt: FIVE.updatedAt },
        ],
        quantity: 3.25,
      },
    ]);
  });

  it("sends the exact sum unchanged", async () => {
    const stub = stubAll({ [ORDER_ROUTE]: json(CREATED, 201) });

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.click(checkbox(dialog, 5));
    press(dialog, "Bestellen");

    await waitFor(() => expect(stub.bodies(ORDER_ROUTE)).toHaveLength(1));
    expect(stub.bodies(ORDER_ROUTE)[0]).toMatchObject({ quantity: 0.3 });
  });

  it("refuses an invalid quantity without sending", async () => {
    const stub = stubAll();

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Menge" }), {
      target: { value: "0" },
    });
    press(dialog, "Bestellen");

    expect(await within(dialog).findByText(/größer als 0/)).toBeTruthy();
    expect(stub.bodies(ORDER_ROUTE)).toHaveLength(0);
  });

  it("removes the consumptions after saving and shows the new order in its tab", async () => {
    const stub = stubAll({ [ORDER_ROUTE]: json(CREATED, 201) });

    renderArea();
    const dialog = await openOrderFor(1);
    stub.routes[CONSUMPTIONS_ROUTE] = json([OTHER_LOCATION, OTHER_MATERIAL]);
    stub.routes[ORDERS_ROUTE] = json([CREATED]);
    press(dialog, "Bestellen");

    expect(
      await screen.findByText("Bestellung Nr. 9 angelegt, 3 Verbräuche übernommen."),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(numbers()).toEqual(["Nr. 4", "Nr. 3"]);
    await waitFor(() => expect(stub.bodies(CONSUMPTIONS_ROUTE)).toHaveLength(2));

    fireEvent.click(screen.getByRole("tab", { name: "Bestellungen" }));
    const panel = screen.getByRole("tabpanel", { name: "Bestellungen" });
    expect(await within(panel).findByText("Nr. 9")).toBeTruthy();
    expect(
      within(panel).getByText("Angefordert von: Erika Muster (Nr. 1, 5), Max Beispiel (Nr. 2)"),
    ).toBeTruthy();
  });

  it("updates an orders tab that was open before", async () => {
    const stub = stubAll({ [ORDER_ROUTE]: json(CREATED, 201) });

    renderArea();
    await screen.findByText("Nr. 5");
    fireEvent.click(screen.getByRole("tab", { name: "Bestellungen" }));
    await within(screen.getByRole("tabpanel", { name: "Bestellungen" })).findByText(
      "Keine offenen Bestellungen.",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Verbrauch/Bedarf" }));
    const dialog = await openOrderFor(1);
    stub.routes[ORDERS_ROUTE] = json([CREATED]);
    press(dialog, "Bestellen");
    await screen.findByText(/Bestellung Nr\. 9 angelegt/);
    fireEvent.click(screen.getByRole("tab", { name: "Bestellungen" }));

    const panel = screen.getByRole("tabpanel", { name: "Bestellungen" });
    expect(await within(panel).findByText("Nr. 9")).toBeTruthy();
  });

  it("changes nothing when cancelled", async () => {
    const stub = stubAll();

    renderArea();
    const dialog = await openOrderFor(1);
    fireEvent.click(checkbox(dialog, 2));
    press(dialog, "Abbrechen");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stub.bodies(ORDER_ROUTE)).toHaveLength(0);
    expect(numbers()).toEqual(["Nr. 5", "Nr. 4", "Nr. 3", "Nr. 2", "Nr. 1"]);

    // A new dialog starts again with all of them.
    expect(checkedNumbers(await openOrderFor(1))).toEqual(["1", "2", "5"]);
  });

  it.each<[number, string]>([
    [404, "Verbrauch nicht gefunden."],
    [409, "Verbrauch wurde geändert."],
  ])("shows a %d in the dialog and loads the consumptions again", async (status, message) => {
    const changedTwo = { ...TWO, quantity: 0.5, updatedAt: "2026-03-17T09:00:00.000Z" };
    const stub = stubAll({ [ORDER_ROUTE]: json({ message }, status) });

    renderArea();
    const dialog = await openOrderFor(1);
    stub.routes[CONSUMPTIONS_ROUTE] = json([ONE, changedTwo, OTHER_LOCATION, OTHER_MATERIAL]);
    press(dialog, "Bestellen");

    // One hint replaces the server message, which would ask for a reload that already runs.
    const alert = await within(dialog).findByText(/inzwischen geändert oder gelöscht/);
    expect(alert.textContent).toContain("Die Liste wird neu geladen");
    expect(alert.textContent).not.toContain(message);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(stub.bodies(CONSUMPTIONS_ROUTE)).toHaveLength(2));

    // The dialog shows the current state: Nr. 5 is gone, Nr. 2 has its new quantity.
    await waitFor(() => expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2));
    expect(quantity(dialog)).toBe("0,6");

    stub.routes[ORDER_ROUTE] = json(CREATED, 201);
    press(dialog, "Bestellen");
    await waitFor(() => expect(stub.bodies(ORDER_ROUTE)).toHaveLength(2));
    expect(stub.bodies(ORDER_ROUTE)[1]).toEqual({
      consumptions: [
        { id: ONE.id, updatedAt: ONE.updatedAt },
        { id: TWO.id, updatedAt: changedTwo.updatedAt },
      ],
      quantity: 0.6,
    });
  });

  it("shows a 400 in the dialog", async () => {
    stubAll({
      [ORDER_ROUTE]: json({ message: "Material und Lagerort müssen gleich sein." }, 400),
    });

    renderArea();
    const dialog = await openOrderFor(1);
    press(dialog, "Bestellen");

    expect(
      await within(dialog).findByText("Material und Lagerort müssen gleich sein."),
    ).toBeTruthy();
    expect(numbers()).toHaveLength(5);
  });

  it("offers the chosen one and the oldest others up to the limit", async () => {
    const many = Array.from({ length: MAX_CONSUMPTIONS_PER_ORDER + 2 }, (_, index) =>
      consumption(index + 1),
    );
    stubAll({ [CONSUMPTIONS_ROUTE]: json(many) });

    renderArea();
    const dialog = await openOrderFor(MAX_CONSUMPTIONS_PER_ORDER + 2);

    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(MAX_CONSUMPTIONS_PER_ORDER);
    expect(checkbox(dialog, MAX_CONSUMPTIONS_PER_ORDER + 2).checked).toBe(true);
    expect(checkbox(dialog, 1).checked).toBe(true);
    expect(within(dialog).queryByRole("checkbox", { name: /^Nr\. 100:/ })).toBeNull();
    expect(within(dialog).queryByRole("checkbox", { name: /^Nr\. 101:/ })).toBeNull();
    expect(within(dialog).getByText(/2 weitere bleiben/)).toBeTruthy();
    expect(quantity(dialog)).toBe(String(MAX_CONSUMPTIONS_PER_ORDER));
  });
});

function press(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole("button", { name }));
}
