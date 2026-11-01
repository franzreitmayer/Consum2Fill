import { API_PATHS, type OidcSettings } from "@c2r/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { OidcSettingsForm } from "./OidcSettingsForm";
import { json, stubApi } from "./testing/stubApi";

const SETTINGS: OidcSettings = {
  enabled: true,
  displayName: "Keycloak",
  issuerUrl: "https://idp.example/realms/c2r",
  clientId: "c2r",
  clientSecretSet: true,
  redirectUri: "https://app.example/api/auth/oidc/callback",
};
const GET_ROUTE = `GET ${API_PATHS.adminOidcSettings}`;
const PUT_ROUTE = `PUT ${API_PATHS.adminOidcSettings}`;

function renderForm(onSaved = vi.fn()) {
  render(<OidcSettingsForm api={createApiClient(vi.fn())} onSaved={onSaved} />);
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OidcSettingsForm", () => {
  it("shows the stored values and the secret hint", async () => {
    stubApi({ [GET_ROUTE]: json(SETTINGS) });

    renderForm();

    const issuer = (await screen.findByRole("textbox", {
      name: /^Issuer-URL/,
    })) as HTMLInputElement;
    expect(issuer.value).toBe(SETTINGS.issuerUrl);
    expect(issuer.type).toBe("url");
    expect((screen.getByRole("switch", { name: "Aktiviert" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText(/^Client-Secret/) as HTMLInputElement).type).toBe("password");
    expect(
      screen.getByText(
        "Ein Secret ist gespeichert. Leer lassen, um es zu behalten. Bei einer neuen Issuer-URL muss es neu eingegeben werden.",
      ),
    ).toBeTruthy();
  });

  it("shows the redirect URI read-only and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    stubApi({ [GET_ROUTE]: json(SETTINGS) });

    renderForm();

    const field = (await screen.findByRole("textbox", {
      name: "Redirect-URI",
    })) as HTMLTextAreaElement;
    expect(field.value).toBe(SETTINGS.redirectUri);
    expect(field.readOnly).toBe(true);
    expect(screen.getByText(/in Keycloak als gültige Redirect-URI eintragen/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Redirect-URI kopieren" }));

    expect(await screen.findByText("Kopiert.")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(SETTINGS.redirectUri);
  });

  it("explains when copying is not possible", async () => {
    vi.stubGlobal("navigator", {});
    stubApi({ [GET_ROUTE]: json(SETTINGS) });

    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Redirect-URI kopieren" }));

    expect(await screen.findByText(/Kopieren nicht möglich/)).toBeTruthy();
  });

  it("omits an empty secret", async () => {
    const api = stubApi({ [GET_ROUTE]: json(SETTINGS), [PUT_ROUTE]: json(SETTINGS) });
    const onSaved = vi.fn();

    renderForm(onSaved);
    await screen.findByRole("switch", { name: "Aktiviert" });
    clickSave();

    expect(await screen.findByText("Einstellungen gespeichert.")).toBeTruthy();
    expect(api.bodies(PUT_ROUTE)).toEqual([
      {
        enabled: true,
        displayName: "Keycloak",
        issuerUrl: SETTINGS.issuerUrl,
        clientId: "c2r",
      },
    ]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("sends a filled-in secret and clears the field afterwards", async () => {
    const api = stubApi({ [GET_ROUTE]: json(SETTINGS), [PUT_ROUTE]: json(SETTINGS) });

    renderForm();
    await screen.findByRole("switch", { name: "Aktiviert" });
    const secret = screen.getByLabelText(/^Client-Secret/) as HTMLInputElement;
    fireEvent.change(secret, { target: { value: "s3cret" } });
    clickSave();

    await screen.findByText("Einstellungen gespeichert.");
    expect(api.bodies(PUT_ROUTE)).toEqual([expect.objectContaining({ clientSecret: "s3cret" })]);
    expect(secret.value).toBe("");
  });

  it("shows a server error", async () => {
    const onSaved = vi.fn();
    stubApi({
      [GET_ROUTE]: json(SETTINGS),
      [PUT_ROUTE]: json({ message: "Secret fehlt" }, 400),
    });

    renderForm(onSaved);
    await screen.findByRole("switch", { name: "Aktiviert" });
    clickSave();

    expect(await screen.findByText("Secret fehlt")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows a load error with a retry", async () => {
    stubApi({ [GET_ROUTE]: json({ message: "Kaputt" }, 500) });

    renderForm();

    expect(await screen.findByText("Kaputt")).toBeTruthy();

    stubApi({ [GET_ROUTE]: json(SETTINGS) });
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByRole("switch", { name: "Aktiviert" })).toBeTruthy();
  });
});
