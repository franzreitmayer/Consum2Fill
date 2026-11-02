import { API_PATHS, ROLES, type User, adminUserPasswordPath, adminUserPath } from "@c2r/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { UsersAdmin } from "./UsersAdmin";
import { json, noContent, stubApi } from "./testing/stubApi";

const ADMIN: User = {
  id: "admin-id",
  username: "admin",
  displayName: "Ada Admin",
  email: "ada@example.org",
  role: "ADMIN",
  source: "local",
  mustChangePassword: false,
};
const LOCAL_USER: User = {
  id: "local-id",
  username: "lea",
  displayName: "Lea Lokal",
  email: null,
  role: "USER",
  source: "local",
  mustChangePassword: false,
};
const IAM_USER: User = {
  id: "iam-id",
  username: "ida",
  displayName: "Ida Iam",
  email: "ida@example.org",
  role: "USER",
  source: "oidc",
  mustChangePassword: false,
};
const USERS_ROUTE = `GET ${API_PATHS.adminUsers}`;

function renderUsers(onCurrentUserChange = vi.fn(), onUnauthorized = vi.fn()) {
  render(
    <UsersAdmin
      api={createApiClient(onUnauthorized)}
      currentUser={ADMIN}
      onCurrentUserChange={onCurrentUserChange}
    />,
  );
}

function change(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

function fillCreateForm(dialog: HTMLElement, password = "geheim123") {
  change(within(dialog).getByRole("textbox", { name: "Benutzername" }), "neu");
  change(within(dialog).getByRole("textbox", { name: "Name" }), "Neu Nutzer");
  change(within(dialog).getByRole("textbox", { name: "E-Mail" }), "neu@example.org");
  change(within(dialog).getByRole("combobox", { name: "Rolle" }), "MANAGER");
  change(within(dialog).getByLabelText(/^Passwort/), password);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UsersAdmin list", () => {
  it("shows a card with all user details", async () => {
    stubApi({ [USERS_ROUTE]: json([ADMIN, IAM_USER]) });

    renderUsers();

    expect(screen.getByRole("progressbar")).toBeTruthy();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    const adminCard = within(items[0] as HTMLElement);
    expect(adminCard.getByText(/^admin/)).toBeTruthy();
    expect(adminCard.getByText("Ada Admin")).toBeTruthy();
    expect(adminCard.getByText("ada@example.org")).toBeTruthy();
    expect(adminCard.getByText("Rolle: ADMIN")).toBeTruthy();
    expect(adminCard.getByText("Herkunft: lokal")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("Herkunft: IAM")).toBeTruthy();
  });

  it("shows a load error with a retry", async () => {
    stubApi({ [USERS_ROUTE]: json({ message: "Kaputt" }, 500) });

    renderUsers();

    expect(await screen.findByText("Kaputt")).toBeTruthy();

    stubApi({ [USERS_ROUTE]: json([ADMIN]) });
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText("Ada Admin")).toBeTruthy();
  });

  it("has no delete button for the own account", async () => {
    stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]) });

    renderUsers();
    await screen.findByText("Ada Admin");

    expect(screen.queryByRole("button", { name: "Löschen: admin" })).toBeNull();
    expect(screen.getByRole("button", { name: "Löschen: lea" })).toBeTruthy();
  });

  it("has no password button for IAM users", async () => {
    stubApi({ [USERS_ROUTE]: json([ADMIN, IAM_USER]) });

    renderUsers();
    await screen.findByText("Ida Iam");

    expect(screen.queryByRole("button", { name: "Passwort setzen: ida" })).toBeNull();
    expect(screen.getByRole("button", { name: "Passwort setzen: admin" })).toBeTruthy();
  });
});

describe("UsersAdmin create", () => {
  it("creates a user and adds the card", async () => {
    const created: User = { ...LOCAL_USER, id: "new-id", username: "neu", displayName: "Neu" };
    const route = `POST ${API_PATHS.adminUsers}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN]), [route]: json(created, 201) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Benutzer anlegen" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer anlegen" });
    fillCreateForm(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Benutzer angelegt.")).toBeTruthy();
    expect(screen.getByText("Neu")).toBeTruthy();
    expect(api.bodies(route)).toEqual([
      {
        username: "neu",
        displayName: "Neu Nutzer",
        email: "neu@example.org",
        role: "MANAGER",
        password: "geheim123",
      },
    ]);
  });

  it("offers all roles", async () => {
    stubApi({ [USERS_ROUTE]: json([ADMIN]) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Benutzer anlegen" }));

    const options = within(screen.getByRole("combobox", { name: "Rolle" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([...ROLES]);
  });

  it.each([
    [409, "Benutzername vergeben"],
    [400, "Ungültige Eingabe"],
  ])("keeps the dialog open and shows the server message for %i", async (status, message) => {
    stubApi({
      [USERS_ROUTE]: json([ADMIN]),
      [`POST ${API_PATHS.adminUsers}`]: json({ message }, status),
    });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Benutzer anlegen" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer anlegen" });
    fillCreateForm(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Benutzer anlegen" })).toBeTruthy();
  });

  it("rejects a short password without asking the server", async () => {
    const route = `POST ${API_PATHS.adminUsers}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN]), [route]: json(LOCAL_USER, 201) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Benutzer anlegen" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer anlegen" });
    fillCreateForm(dialog, "kurz");
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Das Passwort braucht mindestens 8 Zeichen.")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("uses a full screen dialog on small widths", async () => {
    stubApi({ [USERS_ROUTE]: json([ADMIN]) });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Benutzer anlegen" }));

    expect(screen.getByRole("dialog").className).toContain("MuiDialog-paperFullScreen");
  });
});

describe("UsersAdmin edit", () => {
  it("sends only changed fields of a local user", async () => {
    const route = `PATCH ${adminUserPath(LOCAL_USER.id)}`;
    const updated = { ...LOCAL_USER, displayName: "Lea Neu" };
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]), [route]: json(updated) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: lea" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer bearbeiten" });
    change(within(dialog).getByRole("textbox", { name: "Name" }), "Lea Neu");
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Lea Neu")).toBeTruthy();
    expect(api.bodies(route)).toEqual([{ displayName: "Lea Neu" }]);
  });

  it("closes without a request when nothing changed", async () => {
    const route = `PATCH ${adminUserPath(LOCAL_USER.id)}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: lea" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("allows only the role to be changed for IAM users", async () => {
    const route = `PATCH ${adminUserPath(IAM_USER.id)}`;
    const updated: User = { ...IAM_USER, role: "MANAGER" };
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, IAM_USER]), [route]: json(updated) });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: ida" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer bearbeiten" });
    for (const name of ["Benutzername", "Name", "E-Mail"]) {
      const field = within(dialog).getByRole("textbox", { name }) as HTMLInputElement;
      expect(field.disabled).toBe(true);
    }
    change(within(dialog).getByRole("combobox", { name: "Rolle" }), "MANAGER");
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Rolle: MANAGER")).toBeTruthy();
    expect(api.bodies(route)).toEqual([{ role: "MANAGER" }]);
  });

  it("reports changes to the own account", async () => {
    const route = `PATCH ${adminUserPath(ADMIN.id)}`;
    const updated = { ...ADMIN, displayName: "Ada Neu" };
    stubApi({ [USERS_ROUTE]: json([ADMIN]), [route]: json(updated) });
    const onCurrentUserChange = vi.fn();

    renderUsers(onCurrentUserChange);
    fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten: admin" }));
    change(screen.getByRole("textbox", { name: "Name" }), "Ada Neu");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onCurrentUserChange).toHaveBeenCalledWith(updated));
  });
});

describe("UsersAdmin delete", () => {
  it("asks for confirmation before deleting", async () => {
    const route = `DELETE ${adminUserPath(LOCAL_USER.id)}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]), [route]: noContent });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: lea" }));

    expect(api.bodies(route)).toHaveLength(0);

    const dialog = screen.getByRole("dialog", { name: "Benutzer löschen" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    expect(await screen.findByText("Benutzer gelöscht.")).toBeTruthy();
    expect(screen.queryByText("Lea Lokal")).toBeNull();
    expect(api.bodies(route)).toHaveLength(1);
  });

  it("keeps the user when deleting is cancelled", async () => {
    const route = `DELETE ${adminUserPath(LOCAL_USER.id)}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]), [route]: noContent });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: lea" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Lea Lokal")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("shows a conflict from the server", async () => {
    stubApi({
      [USERS_ROUTE]: json([ADMIN, LOCAL_USER]),
      [`DELETE ${adminUserPath(LOCAL_USER.id)}`]: json({ message: "Nicht erlaubt" }, 409),
    });

    renderUsers();
    fireEvent.click(await screen.findByRole("button", { name: "Löschen: lea" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));

    expect(await screen.findByText("Nicht erlaubt")).toBeTruthy();
    expect(screen.getByText("Lea Lokal")).toBeTruthy();
  });
});

describe("UsersAdmin password", () => {
  function openPasswordDialog(username: string) {
    fireEvent.click(screen.getByRole("button", { name: `Passwort setzen: ${username}` }));
    return screen.getByRole("dialog", { name: `Passwort setzen: ${username}` });
  }

  it("rejects a short password without asking the server", async () => {
    const route = `PUT ${adminUserPasswordPath(LOCAL_USER.id)}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]), [route]: noContent });

    renderUsers();
    await screen.findByText("Lea Lokal");
    const dialog = openPasswordDialog("lea");
    change(within(dialog).getByLabelText(/^Neues Passwort/), "kurz");
    fireEvent.click(within(dialog).getByRole("button", { name: "Passwort setzen" }));

    expect(await screen.findByText("Das Passwort braucht mindestens 8 Zeichen.")).toBeTruthy();
    expect(api.bodies(route)).toHaveLength(0);
  });

  it("sets the password and confirms it", async () => {
    const route = `PUT ${adminUserPasswordPath(LOCAL_USER.id)}`;
    const api = stubApi({ [USERS_ROUTE]: json([ADMIN, LOCAL_USER]), [route]: noContent });

    renderUsers();
    await screen.findByText("Lea Lokal");
    const dialog = openPasswordDialog("lea");
    change(within(dialog).getByLabelText(/^Neues Passwort/), "geheim123");
    fireEvent.click(within(dialog).getByRole("button", { name: "Passwort setzen" }));

    expect(await screen.findByText("Passwort gesetzt.")).toBeTruthy();
    expect(api.bodies(route)).toEqual([{ password: "geheim123" }]);
  });

  it("detects the ended session after changing the own password", async () => {
    const route = `PUT ${adminUserPasswordPath(ADMIN.id)}`;
    stubApi({
      [USERS_ROUTE]: json([ADMIN]),
      [route]: noContent,
      [`GET ${API_PATHS.me}`]: json({ message: "Nicht angemeldet" }, 401),
    });
    const onUnauthorized = vi.fn();

    renderUsers(vi.fn(), onUnauthorized);
    await screen.findByText("Ada Admin");
    const dialog = openPasswordDialog("admin");
    change(within(dialog).getByLabelText(/^Neues Passwort/), "geheim123");
    fireEvent.click(within(dialog).getByRole("button", { name: "Passwort setzen" }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
