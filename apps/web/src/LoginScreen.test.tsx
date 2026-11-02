import { API_PATHS, type User } from "@c2r/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";
import { json, stubApi } from "./testing/stubApi";

const USER: User = {
  id: "u1",
  username: "erika",
  displayName: "Erika Muster",
  email: null,
  role: "USER",
  source: "local",
  mustChangePassword: false,
};

function submitCredentials() {
  fireEvent.change(screen.getByRole("textbox", { name: "Benutzername" }), {
    target: { value: " erika " },
  });
  fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: "geheim123" } });
  fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginScreen", () => {
  it("offers only the local login without OIDC", () => {
    render(<LoginScreen providers={{ oidc: null }} notice={null} onLoggedIn={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Anmelden mit/ })).toBeNull();
  });

  it("sets the attributes for mobile keyboards and password managers", () => {
    render(<LoginScreen providers={{ oidc: null }} notice={null} onLoggedIn={vi.fn()} />);

    const username = screen.getByRole("textbox", { name: "Benutzername" });
    expect(username.getAttribute("autocomplete")).toBe("username");
    expect(username.getAttribute("autocapitalize")).toBe("off");
    expect(screen.getByLabelText(/^Passwort/).getAttribute("autocomplete")).toBe(
      "current-password",
    );
  });

  it("navigates to the OIDC login when configured", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    render(
      <LoginScreen
        providers={{ oidc: { displayName: "Keycloak" } }}
        notice={null}
        onLoggedIn={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Anmelden mit Keycloak" }));

    expect(assign).toHaveBeenCalledWith(API_PATHS.oidcLogin);
  });

  it("sends the credentials and reports the user", async () => {
    const api = stubApi({ [`POST ${API_PATHS.login}`]: json(USER) });
    const onLoggedIn = vi.fn();
    render(<LoginScreen providers={{ oidc: null }} notice={null} onLoggedIn={onLoggedIn} />);

    submitCredentials();

    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(USER));
    expect(api.bodies(`POST ${API_PATHS.login}`)).toEqual([
      { username: "erika", password: "geheim123" },
    ]);
  });

  it.each([
    [401, "Benutzername oder Passwort falsch"],
    [429, "Zu viele Versuche"],
  ])("shows the server message for %i", async (status, message) => {
    stubApi({ [`POST ${API_PATHS.login}`]: json({ message }, status) });
    const onLoggedIn = vi.fn();
    render(<LoginScreen providers={{ oidc: null }} notice={null} onLoggedIn={onLoggedIn} />);

    submitCredentials();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(onLoggedIn).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Anmelden" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("replaces a notice with the result of the next attempt", async () => {
    stubApi({ [`POST ${API_PATHS.login}`]: json({ message: "Falsch" }, 401) });
    render(<LoginScreen providers={{ oidc: null }} notice="Hinweis" onLoggedIn={vi.fn()} />);

    expect(screen.getByText("Hinweis")).toBeTruthy();
    submitCredentials();

    expect(await screen.findByText("Falsch")).toBeTruthy();
    expect(screen.queryByText("Hinweis")).toBeNull();
  });
});
