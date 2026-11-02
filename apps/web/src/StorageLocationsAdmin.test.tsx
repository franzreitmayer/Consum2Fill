import { API_PATHS, type StorageLocation, type User } from "@c2r/shared";
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

function renderAdmin(onCurrentUserChange = vi.fn(), onUnauthorized = vi.fn()) {
  return render(
    <StorageLocationsAdmin
      api={createApiClient(onUnauthorized)}
      onCurrentUserChange={onCurrentUserChange}
    />,
  );
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
    expect(api.bodies(LIST_ROUTE)).toHaveLength(2);
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

const NETWORK_MESSAGE = "Server nicht erreichbar. Bitte die Verbindung prüfen.";
const networkFailure: RouteHandler = () => {
  throw new TypeError("Failed to fetch");
};
const KELLER = location(8, "Keller");
const MAIN_PATCH = `PATCH ${MAIN_PATH}`;
const MAIN_DELETE = `DELETE ${MAIN_PATH}`;

interface WriteCase {
  label: string;
  route: string;
  success: RouteHandler;
  open: () => Promise<HTMLElement>;
  submitLabel: string;
  successMessage: string;
}

const WRITE_CASES: WriteCase[] = [
  {
    label: "POST",
    route: CREATE_ROUTE,
    success: json(KELLER, 201),
    open: async () => {
      const dialog = await openCreateDialog();
      enterName(dialog, "Keller");
      return dialog;
    },
    submitLabel: "Speichern",
    successMessage: "Lagerort angelegt.",
  },
  {
    label: "PATCH",
    route: MAIN_PATCH,
    success: json({ ...MAIN, name: "Keller" }),
    open: async () => {
      const dialog = await openEditDialog();
      enterName(dialog, "Keller");
      return dialog;
    },
    submitLabel: "Speichern",
    successMessage: "Lagerort gespeichert.",
  },
  {
    label: "DELETE",
    route: MAIN_DELETE,
    success: noContent,
    open: openDeleteDialog,
    submitLabel: "Löschen",
    successMessage: "Lagerort gelöscht.",
  },
];
const LABELLED_WRITE_CASES = WRITE_CASES.map((writeCase) => [writeCase.label, writeCase] as const);

function caseFor(label: string): WriteCase {
  const found = WRITE_CASES.find((writeCase) => writeCase.label === label);
  if (!found) throw new Error(label);
  return found;
}

describe("StorageLocationsAdmin failures while writing", () => {
  it.each(LABELLED_WRITE_CASES)(
    "keeps the dialog open after a network failure on %s and can send again",
    async (_label, writeCase) => {
      const api = stubList({ [writeCase.route]: networkFailure });

      renderAdmin();
      const dialog = await writeCase.open();
      clickButton(dialog, writeCase.submitLabel);

      expect(await within(dialog).findByText(NETWORK_MESSAGE)).toBeTruthy();
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: writeCase.submitLabel })).toHaveProperty(
        "disabled",
        false,
      );

      api.routes[writeCase.route] = writeCase.success;
      clickButton(dialog, writeCase.submitLabel);

      expect(await screen.findByText(writeCase.successMessage)).toBeTruthy();
      expect(api.bodies(writeCase.route)).toHaveLength(2);
    },
  );

  it.each([
    ["POST", 403],
    ["POST", 404],
    ["DELETE", 403],
  ])("closes the dialog, shows the message and reloads after %s with %i", async (label, status) => {
    const writeCase = caseFor(label);
    const api = stubList({ [writeCase.route]: json({ message: "Abgelehnt" }, status) });

    renderAdmin();
    const dialog = await writeCase.open();
    api.routes[LIST_ROUTE] = json([WORKSHOP]);
    clickButton(dialog, writeCase.submitLabel);

    expect(await screen.findByText("Abgelehnt")).toBeTruthy();
    expect(await screen.findByText("Werkstatt")).toBeTruthy();
    expect(screen.queryByText("Hauptlager")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.bodies(LIST_ROUTE)).toHaveLength(2);
  });

  it("keeps the dialog open with the message after a 400 on PATCH", async () => {
    const writeCase = caseFor("PATCH");
    stubList({ [writeCase.route]: json({ message: "Der Name ist ungültig." }, 400) });

    renderAdmin();
    const dialog = await writeCase.open();
    clickButton(dialog, writeCase.submitLabel);

    expect(await within(dialog).findByText("Der Name ist ungültig.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each(LABELLED_WRITE_CASES)(
    "reports a 401 on %s to the client without reloading the user",
    async (_label, writeCase) => {
      const api = stubList({ [writeCase.route]: json({ message: "Nicht angemeldet" }, 401) });
      const onUnauthorized = vi.fn();

      renderAdmin(vi.fn(), onUnauthorized);
      const dialog = await writeCase.open();
      clickButton(dialog, writeCase.submitLabel);

      await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
      expect(api.bodies(`GET ${API_PATHS.me}`)).toHaveLength(0);
    },
  );

  it.each(LABELLED_WRITE_CASES)(
    "sends once when the %s form is submitted repeatedly by Enter",
    async (_label, writeCase) => {
      const write = stubPendingWrite();

      renderAdmin();
      const dialog = await writeCase.open();
      const form = dialog.querySelector("form") as HTMLFormElement;
      fireEvent.submit(form);
      fireEvent.submit(form);

      await waitFor(() => expect(write.writeCount()).toBe(1));
      fireEvent.submit(form);
      await new Promise((resolve) => setTimeout(resolve));
      expect(write.writeCount()).toBe(1);
    },
  );
});

describe("StorageLocationsAdmin current user after a write", () => {
  const ME_ROUTE = `GET ${API_PATHS.me}`;
  const DEMOTED_USER: User = {
    id: "u1",
    username: "erika",
    displayName: "Erika Muster",
    email: null,
    role: "USER",
    source: "local",
    mustChangePassword: false,
  };

  it("hands the reloaded user over after a 403", async () => {
    const writeCase = caseFor("PATCH");
    stubList({
      [writeCase.route]: json({ message: "Keine Berechtigung." }, 403),
      [ME_ROUTE]: json(DEMOTED_USER),
    });
    const onCurrentUserChange = vi.fn();

    renderAdmin(onCurrentUserChange);
    const dialog = await writeCase.open();
    clickButton(dialog, writeCase.submitLabel);

    await waitFor(() => expect(onCurrentUserChange).toHaveBeenCalledWith(DEMOTED_USER));
  });

  it("does not reload the user after a 404", async () => {
    const writeCase = caseFor("PATCH");
    const api = stubList({
      [writeCase.route]: json({ message: "Nicht gefunden" }, 404),
      [ME_ROUTE]: json(DEMOTED_USER),
    });

    renderAdmin();
    const dialog = await writeCase.open();
    clickButton(dialog, writeCase.submitLabel);

    expect(await screen.findByText("Nicht gefunden")).toBeTruthy();
    expect(api.bodies(ME_ROUTE)).toHaveLength(0);
  });

  it("ignores the answer after the view was left", async () => {
    let answerMe: (response: Response) => void = () => undefined;
    const pendingMe = new Promise<Response>((resolve) => {
      answerMe = resolve;
    });
    let meSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === API_PATHS.me) {
          meSignal = init?.signal;
          return pendingMe;
        }
        return init?.method === "PATCH"
          ? Response.json({ message: "Keine Berechtigung." }, { status: 403 })
          : Response.json([MAIN]);
      }),
    );
    const onCurrentUserChange = vi.fn();

    const { unmount } = renderAdmin(onCurrentUserChange);
    const dialog = await openEditDialog();
    enterName(dialog, "Keller");
    clickButton(dialog, "Speichern");
    await waitFor(() => expect(meSignal).toBeTruthy());

    unmount();
    expect(meSignal?.aborted).toBe(true);
    answerMe(Response.json(DEMOTED_USER));
    await new Promise((resolve) => setTimeout(resolve));

    expect(onCurrentUserChange).not.toHaveBeenCalled();
  });
});

describe("StorageLocationsAdmin background refresh after a 409", () => {
  const message = "Konflikt";

  it.each(LABELLED_WRITE_CASES)(
    "updates the list behind the open dialog on %s",
    async (_label, writeCase) => {
      const api = stubList({ [writeCase.route]: json({ message }, 409) });

      renderAdmin();
      const dialog = await writeCase.open();
      api.routes[LIST_ROUTE] = json([MAIN, WORKSHOP, location(9, "Neu von anderswo")]);
      clickButton(dialog, writeCase.submitLabel);

      expect(await within(dialog).findByText(message)).toBeTruthy();
      expect(await screen.findByText("Neu von anderswo")).toBeTruthy();
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(within(dialog).getByText(message)).toBeTruthy();
      expect(api.bodies(LIST_ROUTE)).toHaveLength(2);
    },
  );

  it("keeps the input in the dialog while the list is replaced", async () => {
    const api = stubList({ [CREATE_ROUTE]: json({ message }, 409) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Keller");
    api.routes[LIST_ROUTE] = json([MAIN, KELLER]);
    clickButton(dialog, "Speichern");

    expect(await screen.findByText("Nr. 8")).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty("value", "Keller");
  });

  it("keeps list, dialog and message when the refresh fails", async () => {
    const api = stubList({ [CREATE_ROUTE]: json({ message }, 409) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Keller");
    api.routes[LIST_ROUTE] = json({ message: "Liste kaputt" }, 500);
    clickButton(dialog, "Speichern");

    await waitFor(() => expect(api.bodies(LIST_ROUTE)).toHaveLength(2));
    await within(dialog).findByText(message);
    await new Promise((resolve) => setTimeout(resolve));
    expect(within(dialog).getByText(message)).toBeTruthy();
    expect(screen.getByText("Hauptlager")).toBeTruthy();
    expect(screen.queryByText("Liste kaputt")).toBeNull();
  });

  function deferred() {
    let resolve: (response: Response) => void = () => undefined;
    const promise = new Promise<Response>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  /** Answers the calls of each method in order. */
  function stubSequence(answers: {
    GET: (Response | Promise<Response>)[];
    POST: (Response | Promise<Response>)[];
  }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        const answer = (init?.method === "POST" ? answers.POST : answers.GET).shift();
        if (!answer) throw new Error("Unerwartete Anfrage");
        return answer;
      }),
    );
  }

  it("ignores a refresh that was overtaken by a successful save", async () => {
    const list = deferred();
    stubSequence({
      GET: [Response.json([MAIN]), list.promise],
      POST: [Response.json({ message }, { status: 409 }), Response.json(KELLER, { status: 201 })],
    });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Hauptlager");
    clickButton(dialog, "Speichern");
    await within(dialog).findByText(message);
    enterName(dialog, "Keller");
    clickButton(dialog, "Speichern");
    expect(await screen.findByText("Lagerort angelegt.")).toBeTruthy();

    list.resolve(Response.json([MAIN]));
    await new Promise((resolve) => setTimeout(resolve));

    expect(screen.getByText("Keller")).toBeTruthy();
  });

  it("does not lose or duplicate entries when a refresh arrives during a save", async () => {
    const list = deferred();
    const save = deferred();
    stubSequence({
      GET: [Response.json([MAIN]), list.promise],
      POST: [Response.json({ message }, { status: 409 }), save.promise],
    });

    renderAdmin();
    const dialog = await openCreateDialog();
    enterName(dialog, "Hauptlager");
    clickButton(dialog, "Speichern");
    await within(dialog).findByText(message);
    enterName(dialog, "Keller");
    clickButton(dialog, "Speichern");

    list.resolve(Response.json([MAIN, KELLER, location(9, "Anderswo")]));
    expect(await screen.findByText("Anderswo")).toBeTruthy();

    save.resolve(Response.json(KELLER, { status: 201 }));

    expect(await screen.findByText("Lagerort angelegt.")).toBeTruthy();
    expect(screen.getAllByText("Keller")).toHaveLength(1);
    expect(screen.getByText("Anderswo")).toBeTruthy();
  });
});
