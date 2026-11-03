import { API_PATHS, orderDeliveredPath, type Role, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { CaptureArea } from "./CaptureArea";
import {
  CELLAR,
  CONSUMPTIONS_ROUTE,
  consumption,
  ERIKA,
  MAIN,
  MAX,
  ME_ROUTE,
  NOON_DATE,
  OIL,
  order,
  ORDERS_ROUTE,
  stubCapture,
  user,
} from "./testing/captureFixtures";
import { json, noContent, type RouteHandler } from "./testing/stubApi";
import { requestedByText } from "./OrdersAdmin";

const FIRST = order(1, { quantity: 1.5 });
const SECOND = order(2, {
  storageLocationId: CELLAR.id,
  materialId: OIL.id,
  quantity: 0.3,
  createdBy: MAX,
  requestedBy: [
    { number: 3, createdBy: ERIKA },
    { number: 4, createdBy: null },
    { number: 5, createdBy: ERIKA },
  ],
});
// From before createdBy and requestedBy were recorded.
const LEGACY = order(3, { createdBy: null });

const CREATE_ROUTE = `POST ${API_PATHS.orders}`;
const PATCH_FIRST = `PATCH ${API_PATHS.orders}/${FIRST.id}`;
const DELETE_FIRST = `DELETE ${API_PATHS.orders}/${FIRST.id}`;
const DELIVERED_FIRST = `POST ${orderDeliveredPath(FIRST.id)}`;
const FORBIDDEN = "Keine Berechtigung.";
const LOST_ROLE = /Die Berechtigung für die Bestellungen wurde entzogen/;

function stubAll(routes: Record<string, RouteHandler> = {}) {
  return stubCapture({
    [CONSUMPTIONS_ROUTE]: json([consumption(7)]),
    [ORDERS_ROUTE]: json([FIRST, SECOND]),
    ...routes,
  });
}

const api = createApiClient(vi.fn());

interface HarnessProps {
  role: Role;
  reloadSignal?: number;
  onUser?: (user: User) => void;
}

/** Keeps the user like the app does, so that a reloaded user changes the view. */
function Harness({ role, reloadSignal, onUser }: HarnessProps) {
  const [current, setCurrent] = useState(user(role));
  return (
    <CaptureArea
      api={api}
      user={current}
      reloadSignal={reloadSignal}
      onCurrentUserChange={(updated) => {
        onUser?.(updated);
        setCurrent(updated);
      }}
    />
  );
}

async function openOrders() {
  fireEvent.click(await screen.findByRole("tab", { name: "Bestellungen" }));
  return screen.getByRole("tabpanel", { name: "Bestellungen" });
}

function numbersIn(panel: HTMLElement) {
  return within(panel)
    .getAllByText(/^Nr\. /)
    .map((node) => node.textContent);
}

function press(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole("button", { name }));
}

async function chooseMaterial(dialog: HTMLElement, search: string, option: string) {
  const field = within(dialog).getByRole("combobox", { name: "Material" });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: search } });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Capture tabs", () => {
  it.each<Role>(["ADMIN", "MANAGER"])("offers both tabs to %s", async (role) => {
    const stub = stubAll();

    render(<Harness role={role} />);

    expect(screen.getByRole("tab", { name: "Verbrauch/Bedarf", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Bestellungen", selected: false })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Verbrauch/Bedarf" })).toBeNull();
    await screen.findByText("Nr. 7");
    // The orders load with the first visit of their tab.
    expect(stub.bodies(ORDERS_ROUTE)).toHaveLength(0);

    const panel = await openOrders();

    expect(screen.getByRole("tab", { name: "Bestellungen", selected: true })).toBeTruthy();
    expect(await within(panel).findByText("Nr. 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verbrauch erfassen" })).toBeNull();
  });

  it("shows USER only the consumptions under a heading and never loads orders", async () => {
    const stub = stubAll();

    render(<Harness role="USER" />);

    expect(screen.getByRole("heading", { level: 2, name: "Verbrauch/Bedarf" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(await screen.findByText("Nr. 7")).toBeTruthy();
    expect(stub.bodies(ORDERS_ROUTE)).toHaveLength(0);
  });

  it("keeps the filter of the consumptions when switching tabs and back", async () => {
    stubAll({
      [CONSUMPTIONS_ROUTE]: json([
        consumption(7),
        consumption(8, { storageLocationId: CELLAR.id }),
      ]),
    });

    render(<Harness role="MANAGER" />);
    await screen.findByText("Nr. 8");
    fireEvent.change(screen.getByRole("combobox", { name: "Nach Lagerort filtern" }), {
      target: { value: CELLAR.id },
    });
    await openOrders();
    fireEvent.click(screen.getByRole("tab", { name: "Verbrauch/Bedarf" }));

    const panel = screen.getByRole("tabpanel", { name: "Verbrauch/Bedarf" });
    expect(within(panel).getByRole("combobox", { name: "Nach Lagerort filtern" })).toHaveProperty(
      "value",
      CELLAR.id,
    );
    expect(numbersIn(panel)).toEqual(["Nr. 8"]);
  });

  it("loads the active tab again with the reload signal and stays in it", async () => {
    const stub = stubAll();

    const { rerender } = render(<Harness role="ADMIN" reloadSignal={0} />);
    const panel = await openOrders();
    await within(panel).findByText("Nr. 1");
    stub.routes[ORDERS_ROUTE] = json([FIRST, SECOND, order(9)]);
    rerender(<Harness role="ADMIN" reloadSignal={1} />);

    expect(await within(panel).findByText("Nr. 9")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Bestellungen", selected: true })).toBeTruthy();
  });
});

describe("Order list", () => {
  it("shows all fields, the newest first", async () => {
    stubAll({ [ORDERS_ROUTE]: json([FIRST, LEGACY, SECOND]) });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();
    await within(panel).findByText("Nr. 1");

    expect(numbersIn(panel)).toEqual(["Nr. 3", "Nr. 2", "Nr. 1"]);
    const items = within(panel).getAllByRole("listitem");
    const oil = within(items[1] as HTMLElement);
    expect(oil.getByRole("heading", { name: "Hydrauliköl" })).toBeTruthy();
    expect(oil.getByText("Menge: 0,3 Liter")).toBeTruthy();
    expect(oil.getByText("Lagerort: Keller")).toBeTruthy();
    expect(oil.getByText(`Datum: ${NOON_DATE}`)).toBeTruthy();
    expect(oil.getByText("Bestellt von: Max Beispiel")).toBeTruthy();
    expect(
      oil.getByText("Angefordert von: Erika Muster (Nr. 3, 5), unbekannt (Nr. 4)"),
    ).toBeTruthy();
  });

  it("shows an order from before this change with an unknown orderer and no requester", async () => {
    stubAll({ [ORDERS_ROUTE]: json([LEGACY]) });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();

    expect(await within(panel).findByText("Bestellt von: unbekannt")).toBeTruthy();
    expect(within(panel).queryByText(/Angefordert von/)).toBeNull();
    expect(within(panel).getByText("Menge: 1 Stück")).toBeTruthy();
  });

  it("groups the requesters in the order of their numbers", () => {
    expect(requestedByText(LEGACY)).toBeNull();
    expect(
      requestedByText(
        order(1, {
          requestedBy: [
            { number: 2, createdBy: MAX },
            { number: 6, createdBy: ERIKA },
            { number: 8, createdBy: MAX },
          ],
        }),
      ),
    ).toBe("Max Beispiel (Nr. 2, 8), Erika Muster (Nr. 6)");
  });

  it("shows the empty state", async () => {
    stubAll({ [ORDERS_ROUTE]: json([]) });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();

    expect(await within(panel).findByText("Keine offenen Bestellungen.")).toBeTruthy();
  });

  it("shows the loading state and a load error with a retry", async () => {
    const stub = stubAll({ [ORDERS_ROUTE]: json({ message: "Liste kaputt" }, 500) });

    render(<Harness role="ADMIN" />);
    await screen.findByText("Nr. 7");
    const panel = await openOrders();

    expect(
      within(panel).getByRole("progressbar", { name: "Bestellungen werden geladen" }),
    ).toBeTruthy();
    expect(await within(panel).findByText("Liste kaputt")).toBeTruthy();

    stub.routes[ORDERS_ROUTE] = json([FIRST]);
    press(panel, "Erneut versuchen");

    expect(await within(panel).findByText("Nr. 1")).toBeTruthy();
  });

  it("filters by location with its own filter and preselects it when creating", async () => {
    const stub = stubAll({ [CREATE_ROUTE]: json(order(4), 201) });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();
    await within(panel).findByText("Nr. 1");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Nach Lagerort filtern" }), {
      target: { value: CELLAR.id },
    });

    expect(numbersIn(panel)).toEqual(["Nr. 2"]);
    expect(within(panel).getByRole("status").textContent).toBe(
      "Filter aktiv: 1 von 2 Bestellungen",
    );

    press(panel, "Bestellung erfassen");
    const dialog = screen.getByRole("dialog", { name: "Bestellung erfassen" });
    expect(within(dialog).getByRole("combobox", { name: "Lagerort" })).toHaveProperty(
      "value",
      CELLAR.id,
    );
    await chooseMaterial(dialog, "hydr", "Hydrauliköl (Liter)");
    press(dialog, "Speichern");

    expect(await within(panel).findByText("Bestellung erfasst.")).toBeTruthy();
    expect(stub.bodies(CREATE_ROUTE)).toEqual([
      { storageLocationId: CELLAR.id, materialId: OIL.id, quantity: 1 },
    ]);
  });
});

describe("Order dialog", () => {
  it("creates an order by hand with a typed decimal quantity", async () => {
    const stub = stubAll({ [CREATE_ROUTE]: json(order(4, { quantity: 2.5 }), 201) });

    render(<Harness role="MANAGER" />);
    const panel = await openOrders();
    await within(panel).findByText("Nr. 1");
    press(panel, "Bestellung erfassen");
    const dialog = screen.getByRole("dialog", { name: "Bestellung erfassen" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Lagerort" }), {
      target: { value: MAIN.id },
    });
    await chooseMaterial(dialog, "schr", "Schraube (Stück)");
    press(dialog, "Menge erhöhen");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Menge" }), {
      target: { value: "2,5" },
    });
    press(dialog, "Speichern");

    expect(await within(panel).findByText("Bestellung erfasst.")).toBeTruthy();
    expect(numbersIn(panel)).toEqual(["Nr. 4", "Nr. 2", "Nr. 1"]);
    expect(stub.bodies(CREATE_ROUTE)).toEqual([
      { storageLocationId: MAIN.id, materialId: "m-1", quantity: 2.5 },
    ]);
  });

  it("changes an order with the values of the record preset", async () => {
    const stub = stubAll({ [PATCH_FIRST]: json({ ...FIRST, quantity: 2.5 }) });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Bearbeiten: Nr. 1");
    const dialog = screen.getByRole("dialog", { name: "Bestellung Nr. 1 bearbeiten" });

    const quantity = within(dialog).getByRole("textbox", { name: "Menge" });
    expect(quantity).toHaveProperty("value", "1,5");
    press(dialog, "Menge erhöhen");
    press(dialog, "Speichern");

    expect(await within(panel).findByText("Bestellung gespeichert.")).toBeTruthy();
    expect(stub.bodies(PATCH_FIRST)).toEqual([{ quantity: 2.5 }]);
    expect(within(panel).getByText("Menge: 2,5 Stück")).toBeTruthy();
  });
});

describe("Order delete and delivery", () => {
  it("deletes only after the question", async () => {
    const stub = stubAll({ [DELETE_FIRST]: noContent });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Löschen: Nr. 1");
    let dialog = screen.getByRole("dialog", { name: "Bestellung löschen" });
    expect(within(dialog).getByText(/Bestellung Nr\. 1 \(Schraube\)/)).toBeTruthy();
    press(dialog, "Abbrechen");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stub.bodies(DELETE_FIRST)).toHaveLength(0);

    press(panel, "Löschen: Nr. 1");
    dialog = screen.getByRole("dialog", { name: "Bestellung löschen" });
    press(dialog, "Löschen");

    expect(await within(panel).findByText("Bestellung gelöscht.")).toBeTruthy();
    expect(numbersIn(panel)).toEqual(["Nr. 2"]);
    expect(stub.bodies(DELETE_FIRST)).toHaveLength(1);
    expect(stub.bodies(DELIVERED_FIRST)).toHaveLength(0);
  });

  it("reports a delivery only after its own question, separate from deleting", async () => {
    const stub = stubAll({ [DELIVERED_FIRST]: noContent });

    render(<Harness role="MANAGER" />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Geliefert: Nr. 1");
    let dialog = screen.getByRole("dialog", { name: "Lieferung bestätigen" });
    expect(
      within(dialog).getByText(/Ist „Bestellung Nr\. 1 \(Schraube\)“ geliefert\?/),
    ).toBeTruthy();
    press(dialog, "Abbrechen");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stub.bodies(DELIVERED_FIRST)).toHaveLength(0);

    press(panel, "Geliefert: Nr. 1");
    dialog = screen.getByRole("dialog", { name: "Lieferung bestätigen" });
    press(dialog, "Geliefert");

    expect(await within(panel).findByText("Bestellung als geliefert entfernt.")).toBeTruthy();
    expect(numbersIn(panel)).toEqual(["Nr. 2"]);
    expect(stub.bodies(DELIVERED_FIRST)).toHaveLength(1);
    expect(stub.bodies(DELETE_FIRST)).toHaveLength(0);
  });

  it("closes for a delivered order that is gone and loads the list again", async () => {
    const stub = stubAll({
      [DELIVERED_FIRST]: json({ message: "Bestellung nicht gefunden." }, 404),
    });

    render(<Harness role="ADMIN" />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Geliefert: Nr. 1");
    stub.routes[ORDERS_ROUTE] = json([SECOND]);
    press(screen.getByRole("dialog"), "Geliefert");

    expect(await within(panel).findByText("Bestellung nicht gefunden.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(numbersIn(panel)).toEqual(["Nr. 2"]));
  });
});

describe("Orders after losing the role", () => {
  it("falls back to the consumptions with a notice after a 403 when writing", async () => {
    const onUser = vi.fn();
    stubAll({
      [DELIVERED_FIRST]: json({ message: FORBIDDEN }, 403),
      [ME_ROUTE]: json(user("USER")),
    });

    render(<Harness role="MANAGER" onUser={onUser} />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Geliefert: Nr. 1");
    press(screen.getByRole("dialog"), "Geliefert");

    expect(await screen.findByText(LOST_ROLE)).toBeTruthy();
    expect(onUser).toHaveBeenCalledWith(user("USER"));
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Verbrauch/Bedarf" })).toBeTruthy();
    expect(await screen.findByText("Nr. 7")).toBeTruthy();
    expect(screen.queryByText("Bestellt von: Erika Muster")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bestellen: Nr. 7" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(screen.queryByText(LOST_ROLE)).toBeNull();
  });

  it("falls back as well when reading the orders is forbidden", async () => {
    stubAll({
      [ORDERS_ROUTE]: json({ message: FORBIDDEN }, 403),
      [ME_ROUTE]: json(user("USER")),
    });

    render(<Harness role="ADMIN" />);
    await openOrders();

    expect(await screen.findByText(LOST_ROLE)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(await screen.findByText("Nr. 7")).toBeTruthy();
  });

  it("stays in the orders with the message when the role is unchanged", async () => {
    const stub = stubAll({
      [DELETE_FIRST]: json({ message: FORBIDDEN }, 403),
      [ME_ROUTE]: json(user("MANAGER")),
    });

    render(<Harness role="MANAGER" />);
    const panel = await openOrders();
    press(await within(panel).findByRole("list"), "Löschen: Nr. 1");
    press(screen.getByRole("dialog"), "Löschen");

    expect(await within(panel).findByText(FORBIDDEN)).toBeTruthy();
    await waitFor(() => expect(stub.bodies(ME_ROUTE)).toHaveLength(1));
    expect(await within(panel).findByText("Nr. 1")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Bestellungen", selected: true })).toBeTruthy();
    expect(screen.queryByText(LOST_ROLE)).toBeNull();
  });
});
