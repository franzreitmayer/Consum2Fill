import {
  API_PATHS,
  DEFAULT_UNIT,
  type Material,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  type User,
} from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { MaterialsAdmin } from "./MaterialsAdmin";
import { json, noContent, type RouteHandler, stubApi } from "./testing/stubApi";

function material(number: number, name: string, overrides: Partial<Material> = {}): Material {
  return {
    id: `id-${number}`,
    number,
    name,
    unit: DEFAULT_UNIT,
    description: "",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const SCREW = material(1, "Schraube", {
  unit: "Packung",
  description: "Verzinkt\nfür Holz",
  tags: ["Kleinteile", "Befestigung"],
});
const OIL = material(5, "Hydrauliköl", {
  unit: "Liter",
  description: "Für die Presse",
  tags: ["Betriebsstoff"],
});
const LIST_ROUTE = `GET ${API_PATHS.materials}`;
const CREATE_ROUTE = `POST ${API_PATHS.materials}`;
const SCREW_PATH = `${API_PATHS.materials}/${SCREW.id}`;
const PATCH_ROUTE = `PATCH ${SCREW_PATH}`;
const DELETE_ROUTE = `DELETE ${SCREW_PATH}`;
const ME_ROUTE = `GET ${API_PATHS.me}`;
const NETWORK_MESSAGE = "Server nicht erreichbar. Bitte die Verbindung prüfen.";
const networkFailure: RouteHandler = () => {
  throw new TypeError("Failed to fetch");
};

function renderAdmin(onCurrentUserChange = vi.fn()) {
  return render(
    <MaterialsAdmin api={createApiClient(vi.fn())} onCurrentUserChange={onCurrentUserChange} />,
  );
}

function stubList(routes: Record<string, RouteHandler> = {}) {
  return stubApi({ [LIST_ROUTE]: json([SCREW, OIL]), ...routes });
}

async function openCreateDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Material anlegen" }));
  return screen.getByRole("dialog", { name: "Material anlegen" });
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: Schraube" }));
  return screen.getByRole("dialog", { name: "Material bearbeiten" });
}

async function openDeleteDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Löschen: Schraube" }));
  return screen.getByRole("dialog", { name: "Material löschen" });
}

function enter(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByRole("textbox", { name: label }), { target: { value } });
}

function save(dialog: HTMLElement, label = "Speichern") {
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
}

function tagField(dialog: HTMLElement) {
  return within(dialog).getByRole("combobox", { name: "Schlagworte" }) as HTMLInputElement;
}

function typeTag(dialog: HTMLElement, value: string) {
  fireEvent.change(tagField(dialog), { target: { value } });
}

function chipLabels(dialog: HTMLElement) {
  return within(dialog)
    .queryAllByRole("button", { name: /^Schlagwort entfernen: / })
    .map((button) => button.getAttribute("aria-label")?.replace("Schlagwort entfernen: ", ""));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MaterialsAdmin list", () => {
  it("shows a loading indicator, then number, name, unit, description and tags", async () => {
    stubList();

    renderAdmin();

    expect(screen.getByRole("progressbar", { name: "Material wird geladen" })).toBeTruthy();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0] as HTMLElement);
    expect(first.getByText("Nr. 1")).toBeTruthy();
    expect(first.getByRole("heading", { name: "Schraube" })).toBeTruthy();
    expect(first.getByText("Mengeneinheit: Packung")).toBeTruthy();
    expect(first.getByText("Kleinteile")).toBeTruthy();
    expect(first.getByText("Befestigung")).toBeTruthy();
    expect(first.queryByRole("button", { name: /Schlagwort entfernen/ })).toBeNull();
  });

  it("keeps the line breaks and allows long words to wrap", async () => {
    stubList();

    renderAdmin();

    const description = await screen.findByText(/Verzinkt/);
    expect(description.textContent).toBe("Verzinkt\nfür Holz");
    expect(getComputedStyle(description).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(description).overflowWrap).toBe("anywhere");
  });

  it("shows an empty state without a search field", async () => {
    stubApi({ [LIST_ROUTE]: json([]) });

    renderAdmin();

    expect(await screen.findByText("Kein Material vorhanden.")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Material anlegen" })).toBeTruthy();
  });

  it("shows a load error with a retry and no search field", async () => {
    stubApi({ [LIST_ROUTE]: json({ message: "Kaputt" }, 500) });

    renderAdmin();

    expect(await screen.findByText("Kaputt")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();

    stubList();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Schraube")).toBeTruthy();
  });
});

describe("MaterialsAdmin create", () => {
  it("prefills the default unit and sends the full trimmed body", async () => {
    const created = material(8, "Mutter", {
      description: "Zeile 1\nZeile 2",
      tags: ["Kleinteile"],
    });
    const api = stubList({ [CREATE_ROUTE]: json(created, 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    expect(within(dialog).getByRole("textbox", { name: "Mengeneinheit" })).toHaveProperty(
      "value",
      DEFAULT_UNIT,
    );
    enter(dialog, "Name", "  Mutter ");
    enter(dialog, "Beschreibung", " Zeile 1\nZeile 2 ");
    typeTag(dialog, " Kleinteile,");
    save(dialog);

    expect(await screen.findByText("Material angelegt.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Mutter" })).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toEqual([
      { name: "Mutter", unit: DEFAULT_UNIT, description: "Zeile 1\nZeile 2", tags: ["Kleinteile"] },
    ]);
  });

  it("sends the default unit when the unit field is left empty", async () => {
    const api = stubList({ [CREATE_ROUTE]: json(material(8, "Mutter"), 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    enter(dialog, "Mengeneinheit", "   ");
    save(dialog);

    await screen.findByText("Material angelegt.");
    expect(api.bodies(CREATE_ROUTE)).toEqual([
      { name: "Mutter", unit: DEFAULT_UNIT, description: "", tags: [] },
    ]);
  });

  it("rejects a blank name without asking the server", async () => {
    const api = stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "   ");
    save(dialog);

    expect(await within(dialog).findByText("Bitte einen Namen eingeben.")).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });

  it("adds a new material at its place by number", async () => {
    const created = material(3, "Mutter");
    stubList({ [CREATE_ROUTE]: json(created, 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    save(dialog);

    await screen.findByText("Material angelegt.");
    expect(screen.getAllByText(/^Nr\. /).map((node) => node.textContent)).toEqual([
      "Nr. 1",
      "Nr. 3",
      "Nr. 5",
    ]);
  });

  it("does not send twice while the request is pending", async () => {
    let answer: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? pending : Response.json([SCREW]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").length;

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    const form = dialog.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(writes()).toBe(1));
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty("readOnly", true);
    expect(tagField(dialog).readOnly).toBe(true);

    answer(Response.json(material(8, "Mutter"), { status: 201 }));

    await screen.findByText("Material angelegt.");
    expect(writes()).toBe(1);
  });
});

describe("MaterialsAdmin edit", () => {
  it("prefills the form", async () => {
    stubList();

    renderAdmin();
    const dialog = await openEditDialog();

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty(
      "value",
      "Schraube",
    );
    expect(within(dialog).getByRole("textbox", { name: "Mengeneinheit" })).toHaveProperty(
      "value",
      "Packung",
    );
    expect(within(dialog).getByRole("textbox", { name: "Beschreibung" })).toHaveProperty(
      "value",
      "Verzinkt\nfür Holz",
    );
    expect(chipLabels(dialog)).toEqual(["Kleinteile", "Befestigung"]);
  });

  it.each([
    ["Name", "Bolzen", { name: "Bolzen" }],
    ["Mengeneinheit", "Karton", { unit: "Karton" }],
    ["Beschreibung", "Neu", { description: "Neu" }],
  ])("sends only the changed field %s", async (label, value, body) => {
    const api = stubList({ [PATCH_ROUTE]: json({ ...SCREW, ...body }) });

    renderAdmin();
    const dialog = await openEditDialog();
    enter(dialog, label, value);
    save(dialog);

    expect(await screen.findByText("Material gespeichert.")).toBeTruthy();
    expect(api.bodies(PATCH_ROUTE)).toEqual([body]);
  });

  it("sends the whole list of tags after removing one", async () => {
    const api = stubList({ [PATCH_ROUTE]: json({ ...SCREW, tags: ["Befestigung"] }) });

    renderAdmin();
    const dialog = await openEditDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Schlagwort entfernen: Kleinteile" }),
    );
    expect(chipLabels(dialog)).toEqual(["Befestigung"]);
    save(dialog);

    await screen.findByText("Material gespeichert.");
    expect(api.bodies(PATCH_ROUTE)).toEqual([{ tags: ["Befestigung"] }]);
  });

  it("closes without a request when nothing changed", async () => {
    const api = stubList();

    renderAdmin();
    const dialog = await openEditDialog();
    enter(dialog, "Name", " Schraube ");
    save(dialog);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(PATCH_ROUTE)).toHaveLength(0);
  });

  it("replaces only the changed card and keeps its place", async () => {
    stubList({ [PATCH_ROUTE]: json({ ...SCREW, name: "Bolzen" }) });

    renderAdmin();
    const dialog = await openEditDialog();
    enter(dialog, "Name", "Bolzen");
    save(dialog);

    await screen.findByText("Material gespeichert.");
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByRole("heading", { name: "Bolzen" })).toBeTruthy();
    expect(
      within(items[1] as HTMLElement).getByRole("heading", { name: "Hydrauliköl" }),
    ).toBeTruthy();
  });
});

describe("MaterialsAdmin delete", () => {
  it("deletes only after a confirmation that names the material", async () => {
    const api = stubList({ [DELETE_ROUTE]: noContent });

    renderAdmin();
    const dialog = await openDeleteDialog();

    expect(within(dialog).getByText("Soll „Schraube“ wirklich gelöscht werden?")).toBeTruthy();
    expect(api.bodies(DELETE_ROUTE)).toHaveLength(0);

    save(dialog, "Löschen");

    expect(await screen.findByText("Material gelöscht.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Schraube" })).toBeNull();
    expect(api.bodies(DELETE_ROUTE)).toHaveLength(1);
  });

  it("shows the message of the API and keeps a material in use", async () => {
    const message = "Das Material wird noch verwendet und kann nicht gelöscht werden.";
    stubList({ [DELETE_ROUTE]: json({ message }, 409) });

    renderAdmin();
    const dialog = await openDeleteDialog();
    save(dialog, "Löschen");

    expect(await within(dialog).findByText(message)).toBeTruthy();
    save(dialog, "Abbrechen");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Schraube" })).toBeTruthy();
  });
});

describe("MaterialsAdmin failures while writing", () => {
  const dialogCases = [
    [400, "Eine Beschreibung ist zu lang."],
    [409, "Der Name des Materials ist bereits vergeben."],
    [409, "Die Mengeneinheit kann nicht geändert werden, weil das Material verwendet wird."],
  ] as const;

  it.each(dialogCases)(
    "keeps the input in the dialog on a create with %i: %s",
    async (status, message) => {
      stubList({ [CREATE_ROUTE]: json({ message }, status) });

      renderAdmin();
      const dialog = await openCreateDialog();
      enter(dialog, "Name", "Schraube");
      typeTag(dialog, "Neu,");
      save(dialog);

      expect(await within(dialog).findByText(message)).toBeTruthy();
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveProperty(
        "value",
        "Schraube",
      );
      expect(chipLabels(dialog)).toEqual(["Neu"]);
    },
  );

  it.each(dialogCases)(
    "keeps the input in the dialog on an edit with %i: %s",
    async (status, message) => {
      stubList({ [PATCH_ROUTE]: json({ message }, status) });

      renderAdmin();
      const dialog = await openEditDialog();
      enter(dialog, "Mengeneinheit", "Karton");
      save(dialog);

      expect(await within(dialog).findByText(message)).toBeTruthy();
      expect(within(dialog).getByRole("textbox", { name: "Mengeneinheit" })).toHaveProperty(
        "value",
        "Karton",
      );
      expect(within(dialog).getByRole("button", { name: "Speichern" })).toHaveProperty(
        "disabled",
        false,
      );
    },
  );

  it("refreshes the list behind the dialog after a 409", async () => {
    const api = stubList({ [PATCH_ROUTE]: json({ message: "Konflikt" }, 409) });

    renderAdmin();
    const dialog = await openEditDialog();
    enter(dialog, "Name", "Bolzen");
    api.routes[LIST_ROUTE] = json([SCREW, OIL, material(9, "Von anderswo")]);
    save(dialog);

    expect(await screen.findByText("Von anderswo")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByText("Konflikt")).toBeTruthy();
  });

  it.each([
    [404, "Das Material wurde nicht gefunden.", 0],
    [403, "Keine Berechtigung.", 1],
  ])("closes the dialog and reloads after %i", async (status, message, userCalls) => {
    const user: User = {
      id: "u",
      username: "u",
      displayName: "U",
      email: null,
      role: "MANAGER",
      source: "local",
      mustChangePassword: false,
    };
    const api = stubList({ [PATCH_ROUTE]: json({ message }, status), [ME_ROUTE]: json(user) });
    const onCurrentUserChange = vi.fn();

    renderAdmin(onCurrentUserChange);
    const dialog = await openEditDialog();
    enter(dialog, "Name", "Bolzen");
    api.routes[LIST_ROUTE] = json([OIL]);
    save(dialog);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Hydrauliköl" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Schraube" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.bodies(ME_ROUTE)).toHaveLength(userCalls);
    await waitFor(() => expect(onCurrentUserChange).toHaveBeenCalledTimes(userCalls));
  });

  it("keeps the dialog after a network failure and can send again", async () => {
    const api = stubList({ [CREATE_ROUTE]: networkFailure });

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    typeTag(dialog, "Eins,");
    save(dialog);

    expect(await within(dialog).findByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(chipLabels(dialog)).toEqual(["Eins"]);

    api.routes[CREATE_ROUTE] = json(material(8, "Mutter", { tags: ["Eins"] }), 201);
    save(dialog);

    expect(await screen.findByText("Material angelegt.")).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(2);
  });

  it("brings the message into view in a long form", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    stubList({ [CREATE_ROUTE]: json({ message: "Konflikt" }, 409) });

    try {
      renderAdmin();
      const dialog = await openCreateDialog();
      enter(dialog, "Name", "Mutter");
      save(dialog);

      await within(dialog).findByText("Konflikt");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});

describe("MaterialsAdmin description", () => {
  it("is multiline and counts up to the limit", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    const field = within(dialog).getByRole("textbox", { name: "Beschreibung" });

    expect(field.tagName).toBe("TEXTAREA");
    expect(within(dialog).getByText(`0 von ${MAX_DESCRIPTION_LENGTH} Zeichen`)).toBeTruthy();

    fireEvent.change(field, { target: { value: "Hallo\nWelt" } });

    expect(within(dialog).getByText(`10 von ${MAX_DESCRIPTION_LENGTH} Zeichen`)).toBeTruthy();
  });

  it("does not send a description over the limit and does not shorten it", async () => {
    const api = stubList();
    const tooLong = "x".repeat(MAX_DESCRIPTION_LENGTH + 1);

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    enter(dialog, "Beschreibung", tooLong);
    save(dialog);

    expect(
      await within(dialog).findByText(
        `Die Beschreibung darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen haben.`,
      ),
    ).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Beschreibung" })).toHaveProperty(
      "value",
      tooLong,
    );
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });
});

describe("MaterialsAdmin tags", () => {
  it("confirms a tag with Enter and does not send the form", async () => {
    const api = stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    typeTag(dialog, " Eins ");
    const notPrevented = fireEvent.keyDown(tagField(dialog), { key: "Enter" });

    expect(notPrevented).toBe(false);
    expect(chipLabels(dialog)).toEqual(["Eins"]);
    expect(tagField(dialog).value).toBe("");
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("does not send the form with Enter in the empty field", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();

    expect(fireEvent.keyDown(tagField(dialog), { key: "Enter" })).toBe(false);
    expect(chipLabels(dialog)).toEqual([]);
  });

  it("confirms with a comma in the text, as sent by a phone keyboard without a key event", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "Eins,");
    expect(chipLabels(dialog)).toEqual(["Eins"]);
    expect(tagField(dialog).value).toBe("");

    typeTag(dialog, "Zwei, Drei,Vier");
    expect(chipLabels(dialog)).toEqual(["Eins", "Zwei", "Drei", "Vier"]);
  });

  it("takes the started tag when leaving the field", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "Angefangen");
    fireEvent.blur(tagField(dialog));

    expect(chipLabels(dialog)).toEqual(["Angefangen"]);
    expect(tagField(dialog).value).toBe("");
  });

  it("takes the started tag when the form is sent without leaving the field", async () => {
    const api = stubList({ [CREATE_ROUTE]: json(material(8, "Mutter"), 201) });

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    typeTag(dialog, "Angefangen");
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await screen.findByText("Material angelegt.");
    expect(api.bodies(CREATE_ROUTE)).toEqual([
      { name: "Mutter", unit: DEFAULT_UNIT, description: "", tags: ["Angefangen"] },
    ]);
  });

  it("drops a duplicate regardless of case, keeps the first spelling and says so", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "Eins,");
    typeTag(dialog, "EINS,");

    expect(chipLabels(dialog)).toEqual(["Eins"]);
    expect(within(dialog).getByText("„EINS“ ist bereits vorhanden.")).toBeTruthy();
  });

  it("removes a single tag", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "Eins,Zwei,Drei,");
    fireEvent.click(within(dialog).getByRole("button", { name: "Schlagwort entfernen: Zwei" }));

    expect(chipLabels(dialog)).toEqual(["Eins", "Drei"]);
  });

  it("keeps a too long tag in the field with a message and blocks saving", async () => {
    const api = stubList();
    const tooLong = "x".repeat(MAX_TAG_LENGTH + 1);
    const message = `Ein Schlagwort darf höchstens ${MAX_TAG_LENGTH} Zeichen lang sein.`;

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    typeTag(dialog, tooLong);
    fireEvent.keyDown(tagField(dialog), { key: "Enter" });

    expect(chipLabels(dialog)).toEqual([]);
    expect(tagField(dialog).value).toBe(tooLong);
    expect(within(dialog).getByText(message)).toBeTruthy();
    expect(tagField(dialog).getAttribute("aria-invalid")).toBe("true");

    save(dialog);

    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
    expect(tagField(dialog).value).toBe(tooLong);
  });

  it("keeps a tag over the maximum in the field with a message", async () => {
    const api = stubList();
    const message = `Ein Material darf höchstens ${MAX_TAGS} Schlagworte haben.`;
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `t${index}`);

    renderAdmin();
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    typeTag(dialog, `${full.join(",")},`);
    expect(chipLabels(dialog)).toHaveLength(MAX_TAGS);
    expect(
      within(dialog).getByText(`${MAX_TAGS} von ${MAX_TAGS}. Bestätigen mit Enter oder Komma.`),
    ).toBeTruthy();

    typeTag(dialog, "zu viel,");

    expect(chipLabels(dialog)).toHaveLength(MAX_TAGS);
    expect(tagField(dialog).value).toBe("zu viel");
    expect(within(dialog).getByText(message)).toBeTruthy();

    save(dialog);

    await within(dialog).findByRole("alert");
    expect(api.bodies(CREATE_ROUTE)).toHaveLength(0);
  });

  it("offers the tags of the loaded materials and takes a chosen one", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "klein");
    const option = await screen.findByRole("option", { name: "Kleinteile" });
    expect(screen.queryByRole("option", { name: "Betriebsstoff" })).toBeNull();

    fireEvent.click(option);

    expect(chipLabels(dialog)).toEqual(["Kleinteile"]);
    expect(tagField(dialog).value).toBe("");
  });

  it("does not offer a tag that is already chosen, also in another spelling", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "KLEINTEILE,");
    typeTag(dialog, "klein");

    await waitFor(() => expect(tagField(dialog).value).toBe("klein"));
    expect(screen.queryByRole("option", { name: "Kleinteile" })).toBeNull();
  });

  it("chooses a suggestion marked with the arrow keys by Enter", async () => {
    stubList();

    renderAdmin();
    const dialog = await openCreateDialog();
    typeTag(dialog, "klein");
    await screen.findByRole("option", { name: "Kleinteile" });
    fireEvent.keyDown(tagField(dialog), { key: "ArrowDown" });
    fireEvent.keyDown(tagField(dialog), { key: "Enter" });

    expect(chipLabels(dialog)).toEqual(["Kleinteile"]);
  });
});

describe("MaterialsAdmin search", () => {
  async function search(value: string) {
    const field = await screen.findByRole("searchbox", { name: "Material suchen" });
    fireEvent.change(field, { target: { value } });
  }

  it("uses a search keyboard", async () => {
    stubList();

    renderAdmin();
    const field = await screen.findByRole("searchbox", { name: "Material suchen" });

    expect((field as HTMLInputElement).type).toBe("search");
    expect((field as HTMLInputElement).inputMode).toBe("search");
  });

  it.each([
    ["the name", "schrau", "Schraube"],
    ["the description", "PRESSE", "Hydrauliköl"],
    ["a tag", "kleint", "Schraube"],
    ["several words in different fields", "holz kleinteile", "Schraube"],
  ])("finds by %s and shows the number of hits", async (_label, query, name) => {
    stubList();

    renderAdmin();
    await search(query);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Suche aktiv: 1 von 2 Materialien");
  });

  it("shows no number of hits without a search", async () => {
    stubList();

    renderAdmin();
    await search("   ");

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows its own hint without hits, different from the empty state", async () => {
    stubList();

    renderAdmin();
    await search(" gibtsnicht ");

    expect(screen.getByText("Keine Treffer für „gibtsnicht“.")).toBeTruthy();
    expect(screen.queryByText("Kein Material vorhanden.")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Suche aktiv: 0 von 2 Materialien");
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("clears with a visible button", async () => {
    stubList();

    renderAdmin();
    await screen.findByRole("searchbox");
    expect(screen.queryByRole("button", { name: "Suche löschen" })).toBeNull();

    await search("schrau");
    fireEvent.click(screen.getByRole("button", { name: "Suche löschen" }));

    expect(screen.getByRole("searchbox")).toHaveProperty("value", "");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("stays recognisable as filtered after creating a material that does not match", async () => {
    stubList({ [CREATE_ROUTE]: json(material(8, "Mutter"), 201) });

    renderAdmin();
    await search("schrau");
    const dialog = await openCreateDialog();
    enter(dialog, "Name", "Mutter");
    save(dialog);

    expect(await screen.findByText("Material angelegt.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mutter" })).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "schrau");
    expect(screen.getByRole("status").textContent).toBe("Suche aktiv: 1 von 3 Materialien");
  });

  it("keeps the search through a reload after a 404", async () => {
    const api = stubList({ [PATCH_ROUTE]: json({ message: "Nicht gefunden" }, 404) });

    renderAdmin();
    await search("Schrau");
    const dialog = await openEditDialog();
    enter(dialog, "Name", "Bolzen");
    api.routes[LIST_ROUTE] = json([OIL]);
    save(dialog);

    expect(await screen.findByText("Keine Treffer für „Schrau“.")).toBeTruthy();
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "Schrau");
  });

  it("uses the singular for a single material", async () => {
    stubApi({ [LIST_ROUTE]: json([SCREW]) });

    renderAdmin();
    await search("schrau");

    expect(screen.getByRole("status").textContent).toBe("Suche aktiv: 1 von 1 Material");
  });
});
