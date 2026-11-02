import { API_PATHS, MIN_PASSWORD_LENGTH, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { type RouteHandler, json, noContent, stubApi } from "./testing/stubApi";

const CHANGE_ROUTE = `PUT ${API_PATHS.ownPassword}`;
const HELLO_ROUTE = `GET ${API_PATHS.hello}`;
const SCREEN_HEADING = { name: "Passwort ändern" };
const CURRENT_PASSWORD = "startpasswort";
const VALID_PASSWORD = "n".repeat(MIN_PASSWORD_LENGTH);

const PENDING_USER: User = {
  id: "u1",
  username: "admin",
  displayName: "Ada Admin",
  email: null,
  role: "ADMIN",
  source: "local",
  mustChangePassword: true,
};
const CHANGED_USER: User = { ...PENDING_USER, mustChangePassword: false };

function routesFor(user: User, extra: Record<string, RouteHandler> = {}) {
  return {
    [`GET ${API_PATHS.me}`]: json(user),
    [`GET ${API_PATHS.authProviders}`]: json({ oidc: null }),
    [HELLO_ROUTE]: json({ message: "Hello test" }),
    [`POST ${API_PATHS.logout}`]: noContent,
    ...extra,
  };
}

async function renderScreen(extra: Record<string, RouteHandler> = {}) {
  const api = stubApi(routesFor(PENDING_USER, extra));
  render(<App />);
  await screen.findByRole("heading", SCREEN_HEADING);
  return api;
}

function fillForm(newPassword: string, repeatedPassword = newPassword) {
  fireEvent.change(screen.getByLabelText(/^Aktuelles Passwort/), {
    target: { value: CURRENT_PASSWORD },
  });
  fireEvent.change(screen.getByLabelText(/^Neues Passwort\s*\*$/), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText(/^Neues Passwort wiederholen/), {
    target: { value: repeatedPassword },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChangePasswordScreen in the app", () => {
  it("replaces the app when the loaded session requires a change", async () => {
    const api = await renderScreen();

    expect(screen.queryByText("Hello test")).toBeNull();
    expect(screen.queryByRole("button", { name: "Administration" })).toBeNull();
    expect(screen.getByText(/noch ein Startpasswort/)).toBeTruthy();
    expect(api.bodies(HELLO_ROUTE)).toHaveLength(0);
  });

  it("replaces the app after a login that requires a change", async () => {
    const api = stubApi(
      routesFor(PENDING_USER, {
        [`GET ${API_PATHS.me}`]: json({ message: "Nicht angemeldet" }, 401),
        [`POST ${API_PATHS.login}`]: json(PENDING_USER),
      }),
    );
    render(<App />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Benutzername" }), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: CURRENT_PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("heading", SCREEN_HEADING)).toBeTruthy();
    expect(screen.queryByText("Hello test")).toBeNull();
    expect(api.bodies(HELLO_ROUTE)).toHaveLength(0);
  });

  it("does not appear when no change is required", async () => {
    stubApi(routesFor(CHANGED_USER));
    render(<App />);

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("heading", SCREEN_HEADING)).toBeNull();
  });

  it("sets the attributes for password managers", async () => {
    await renderScreen();

    expect(screen.getByLabelText(/^Aktuelles Passwort/).getAttribute("autocomplete")).toBe(
      "current-password",
    );
    expect(screen.getByLabelText(/^Neues Passwort\s*\*$/).getAttribute("autocomplete")).toBe(
      "new-password",
    );
    expect(screen.getByLabelText(/^Neues Passwort wiederholen/).getAttribute("autocomplete")).toBe(
      "new-password",
    );
  });

  it("sends the passwords unchanged and opens the app with the returned user", async () => {
    const api = await renderScreen({ [CHANGE_ROUTE]: json(CHANGED_USER) });

    fillForm(` ${VALID_PASSWORD} `);
    submit();

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(screen.queryByRole("heading", SCREEN_HEADING)).toBeNull();
    expect(screen.getByRole("button", { name: "Administration" })).toBeTruthy();
    expect(api.bodies(CHANGE_ROUTE)).toEqual([
      { currentPassword: CURRENT_PASSWORD, newPassword: ` ${VALID_PASSWORD} ` },
    ]);
  });

  it("accepts a new password of exactly the minimum length", async () => {
    const api = await renderScreen({ [CHANGE_ROUTE]: json(CHANGED_USER) });

    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText("Hello test")).toBeTruthy();
    expect(api.bodies(CHANGE_ROUTE)).toHaveLength(1);
  });

  it.each([
    [400, "Das aktuelle Passwort ist falsch."],
    [409, "IAM-Benutzer haben kein lokales Passwort."],
    [429, "Zu viele fehlgeschlagene Versuche. Bitte später erneut versuchen."],
  ])("shows the message of a %i and stays on the screen", async (status, message) => {
    await renderScreen({ [CHANGE_ROUTE]: json({ message }, status) });

    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("heading", SCREEN_HEADING)).toBeTruthy();
    expect(screen.queryByText("Hello test")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Passwort ändern" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows an error when the network fails", async () => {
    await renderScreen();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    fillForm(VALID_PASSWORD);
    submit();

    expect(
      await screen.findByText("Server nicht erreichbar. Bitte die Verbindung prüfen."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", SCREEN_HEADING)).toBeTruthy();
  });

  it("sends nothing when the new password is too short", async () => {
    const api = await renderScreen({ [CHANGE_ROUTE]: json(CHANGED_USER) });

    fillForm(VALID_PASSWORD.slice(1));
    submit();

    expect(
      screen.getByText(`Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`),
    ).toBeTruthy();
    expect(api.bodies(CHANGE_ROUTE)).toHaveLength(0);
  });

  it("sends nothing when the repetition differs", async () => {
    const api = await renderScreen({ [CHANGE_ROUTE]: json(CHANGED_USER) });

    fillForm(VALID_PASSWORD, `${VALID_PASSWORD}x`);
    submit();

    expect(
      screen.getByText("Die Wiederholung stimmt nicht mit dem neuen Passwort überein."),
    ).toBeTruthy();
    expect(api.bodies(CHANGE_ROUTE)).toHaveLength(0);
  });

  it("locks the form while the change is being sent", async () => {
    await renderScreen();
    let respond: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ),
    );

    fillForm(VALID_PASSWORD);
    submit();

    expect(
      (screen.getByRole("button", { name: "Wird geändert …" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Abmelden" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText(/^Aktuelles Passwort/) as HTMLInputElement).disabled).toBe(true);

    respond(Response.json({ message: "Das aktuelle Passwort ist falsch." }, { status: 400 }));

    expect(await screen.findByText("Das aktuelle Passwort ist falsch.")).toBeTruthy();
  });

  it("returns to the login screen with a notice on a 401", async () => {
    await renderScreen({ [CHANGE_ROUTE]: json({ message: "Nicht angemeldet." }, 401) });

    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    expect(screen.getByText("Die Sitzung ist abgelaufen. Bitte erneut anmelden.")).toBeTruthy();
  });

  it("logs out to the login screen", async () => {
    const api = await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeTruthy();
    expect(api.bodies(`POST ${API_PATHS.logout}`)).toHaveLength(1);
  });

  it("stays on the screen and shows the error when logout fails", async () => {
    await renderScreen();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(
      await screen.findByText("Server nicht erreichbar. Bitte die Verbindung prüfen."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", SCREEN_HEADING)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Abmelden" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
