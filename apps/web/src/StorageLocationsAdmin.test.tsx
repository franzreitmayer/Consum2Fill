import { API_PATHS, type StorageLocation } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { StorageLocationsAdmin } from "./StorageLocationsAdmin";
import { type RouteHandler, json, noContent, stubApi } from "./testing/stubApi";

function location(number: number, name: string): StorageLocation {
  return {
    id: `id-${number}`,
    number,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const MAIN = location(1, "Hauptlager");
const WORKSHOP = location(7, "Werkstatt");
const LIST_ROUTE = `GET ${API_PATHS.storageLocations}`;
const CREATE_ROUTE = `POST ${API_PATHS.storageLocations}`;
const MAIN_PATH = `${API_PATHS.storageLocations}/${MAIN.id}`;

function renderAdmin() {
  render(<StorageLocationsAdmin api={createApiClient(vi.fn())} />);
}

function stubList(routes: Record<string, RouteHandler> = {}) {
  return stubApi({ [LIST_ROUTE]: json([MAIN, WORKSHOP]), ...routes });
}

async function openCreateDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Lagerort anlegen" }));
  return screen.getByRole("dialog", { name: "Lagerort anlegen" });
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Hauptlager" }));
  return screen.getByRole("dialog", { name: "Lagerort bearbeiten" });
}

async function openDeleteDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Löschen: Hauptlager" }));
  return screen.getByRole("dialog", { name: "Lagerort löschen" });
}

function enterName(dialog: HTMLElement, value: string) {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value } });
}

function clickButton(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole("button", { name }));
}

/** Replaces fetch so that writing requests stay pending until the test answers them. */
function stubPendingWrite() {
  let answer: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    answer = resolve;
  });
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
    (init?.method ?? "GET") === "GET" ? Response.json([MAIN]) : pending,
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    answer: (response: Response) => answer(response),
    writeCount: () =>
      fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET").length,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StorageLocationsAdmin list", () => {
  it("shows a loading indicator and then cards with number and name", async () => {
    stubList();

    renderAdmin();

    expect(screen.getByRole("progressbar", { name: "Lagerorte werden geladen" })).toBeTruthy();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Nr. 1")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("Hauptlager")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("Nr. 7")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("Werkstatt")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows an empty state", async () => {
    stubApi({ [LIST_ROUTE]: json([]) });

    renderAdmin();

    expect(await screen.findByText("Keine Lagerorte vorhanden.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Lagerort anlegen" })).toBeTruthy();
  });

  it("shows a load error with a retry", async () => {
    stubApi({ [LIST_ROUTE]: json({ message: "Kaputt" }, 500) });

    renderAdmin();

    expect(await screen.findByText("Kaputt")).toBeTruthy();

    stubList();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Hauptlager")).toBeTruthy();
    expect(screen.queryByText("Kaputt")).toBeNull();
  });
});

describe("StorageLocationsAdmin create", () => {
  it("sends the trimmed name and adds the card", async () => {
    const api = stubList({ [CREATE_ROUTE]: json(location(8, "Keller"), 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "  Keller  ");
    clickButton(dialog, "Speichern");

    expect(await screen.findByText("Lagerort angelegt.")).toBeTruthy();
    expect(screen.getByText("Keller")).toBeTruthy();
    expect(screen.getByText("Nr. 8")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.bodies(CREATE_ROUTE)).toEqual([{ name: "Keller" }]);
  });

  it("marks the name as required and uses a text keyboard", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    const field = within(dialog).getByRole("textbox", { name: "Name" }) as HTMLInputElement;

    expect(field.required).toBe(true);
    expect(field.inputMode).toBe("text");
  });

  it("rejects a blank name without asking the server", async () => {
    const api = stubList({ [CREATE_ROUTE]: json(location(8, "Keller"), 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "   ");
    clickButton(dialog, "Speichern");

    expect(await within(dialog).findByText("Bitte einen Namen eingeben.")).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });

  it.each([
    [409, "Der Name des Lagerorts ist bereits vergeben."],
    [400, "Der Name fehlt."],
  ])("keeps the dialog open with the server message for %i", async (status, message) => {
    stubList({ [CREATE_ROUTE]: json({ message }, status) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Hauptlager");
    clickButton(dialog, "Speichern");

    expect(await within(dialog).findByText(message)).toBeTruthy();
    const field = within(dialog).getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(field.value).toBe("Hauptlager");
    expect(field.readOnly).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Speichern" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("locks the dialog while sending and does not send twice", async () => {
    const write = stubPendingWrite();

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Keller");
    const submit = within(dialog).getByRole("button", { name: "Speichern" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(write.writeCount()).toBe(1));
    expect(submit).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty("readOnly", true);

    write.answer(Response.json(location(8, "Keller"), { status: 201 }));

    expect(await screen.findByText("Lagerort angelegt.")).toBeTruthy();
    expect(write.writeCount()).toBe(1);
  });
});

describe("StorageLocationsAdmin edit", () => {
  const route = `PATCH ${MAIN_PATH}`;

  it("prefills the name and sends the trimmed new name to the path of the location", async () => {
    const api = stubList({ [route]: json({ ...MAIN, name: "Zentrallager" }) });

    renderAdmin();
    const dialog = await openEditDialog();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty(
      "value",
      "Hauptlager",
    );
    enterName(dialog, " Zentrallager ");
    clickButton(dialog, "Speichern");

    expect(await screen.findByText("Lagerort gespeichert.")).toBeTruthy();
    expect(screen.getByText("Zentrallager")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.getByText("Nr. 1")).toBeTruthy();
    expect(api.bodies(route)).toEqual([{ name: "Zentrallager" }]);
  });

  it("closes without a request when the name did not change", async () => {
    const api = stubList({ [route]: json(MAIN) });

    renderAdmin();
    const dialog = await openEditDialog();
    enterName(dialog, " Hauptlager ");
    clickButton(dialog, "Speichern");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("keeps the dialog open when the new name is taken", async () => {
    const message = "Der Name des Lagerorts ist bereits vergeben.";
    stubList({ [route]: json({ message }, 409) });

    renderAdmin();
    const dialog = await openEditDialog();
    enterName(dialog, "Werkstatt");
    clickButton(dialog, "Speichern");

    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Lagerort bearbeiten" })).toBeTruthy();
  });

  it.each([
    [404, "Der Lagerort wurde nicht gefunden."],
    [403, "Keine Berechtigung."],
  ])("closes the dialog, shows the message and reloads after %i", async (status, message) => {
    const api = stubList({ [route]: json({ message }, status) });

    renderAdmin();
    const dialog = await openEditDialog();
    enterName(dialog, "Zentrallager");
    api.routes[LIST_ROUTE] = json([WORKSHOP]);
    clickButton(dialog, "Speichern");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(await screen.findByText("Werkstatt")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.bodies(LIST_ROUTE)).toHaveLength(2);
  });

  it("keeps the message when reloading the list fails as well", async () => {
    const api = stubList({ [route]: json({ message: "Nicht gefunden" }, 404) });

    renderAdmin();
    const dialog = await openEditDialog();
    enterName(dialog, "Zentrallager");
    api.routes[LIST_ROUTE] = json({ message: "Liste kaputt" }, 500);
    clickButton(dialog, "Speichern");

    expect(await screen.findByText("Liste kaputt")).toBeTruthy();
    expect(screen.getByText("Nicht gefunden")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("shows the message once when reloading fails with the same 403", async () => {
    const message = "Das Passwort muss zuerst geändert werden.";
    const api = stubList({ [route]: json({ message }, 403) });

    renderAdmin();
    const dialog = await openEditDialog();
    enterName(dialog, "Zentrallager");
    api.routes[LIST_ROUTE] = json({ message }, 403);
    clickButton(dialog, "Speichern");

    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getAllByText(message)).toHaveLength(1);
  });
});

describe("StorageLocationsAdmin delete", () => {
  const route = `DELETE ${MAIN_PATH}`;

  it("deletes only after a confirmation that names the location", async () => {
    const api = stubList({ [route]: noContent });

    renderAdmin();
    const dialog = await openDeleteDialog();

    expect(within(dialog).getByText("Soll „Hauptlager“ wirklich gelöscht werden?")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(0);

    clickButton(dialog, "Löschen");

    expect(await screen.findByText("Lagerort gelöscht.")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.getByText("Werkstatt")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(1);
  });

  it("sends nothing when deleting is cancelled", async () => {
    const api = stubList({ [route]: noContent });

    renderAdmin();
    const dialog = await openDeleteDialog();
    clickButton(dialog, "Abbrechen");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Hauptlager")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("shows the message and keeps the location when it is still in use", async () => {
    const message = "Der Lagerort wird noch verwendet und kann nicht gelöscht werden.";
    const api = stubList({ [route]: json({ message }, 409) });

    renderAdmin();
    const dialog = await openDeleteDialog();
    clickButton(dialog, "Löschen");

    expect(await within(dialog).findByText(message)).toBeTruthy();

    clickButton(dialog, "Abbrechen");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Hauptlager")).toBeTruthy();
    expect(api.bodies(LIST_ROUTE)).toHaveLength(1);
  });

  it("shows the message and reloads when the location no longer exists", async () => {
    const message = "Der Lagerort wurde nicht gefunden.";
    const api = stubList({ [route]: json({ message }, 404) });

    renderAdmin();
    const dialog = await openDeleteDialog();
    api.routes[LIST_ROUTE] = json([WORKSHOP]);
    clickButton(dialog, "Löschen");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(await screen.findByText("Werkstatt")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks the confirmation while sending and does not send twice", async () => {
    const write = stubPendingWrite();

    renderAdmin();
    const dialog = await openDeleteDialog();
    const submit = within(dialog).getByRole("button", { name: "Löschen" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(write.writeCount()).toBe(1));
    expect(submit).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toHaveProperty(
      "disabled",
      true,
    );

    write.answer(new Response(null, { status: 204 }));

    expect(await screen.findByText("Lagerort gelöscht.")).toBeTruthy();
    expect(write.writeCount()).toBe(1);
  });
});
