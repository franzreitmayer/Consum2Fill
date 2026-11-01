import {
  MIN_PASSWORD_LENGTH,
  ROLES,
  type CreateUserRequest,
  type LoginRequest,
  type Role,
  type UpdateOidcSettingsRequest,
  type UpdateUserRequest,
} from "@c2r/shared";
import { HttpError } from "../http/errors.js";

// All request bodies pass through here: only checked primitives reach the stores, so a body can
// never smuggle an object into a Mongo query.

type Body = Record<string, unknown>;

function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

function parseBody(value: unknown): Body {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("Der Anfragetext muss ein JSON-Objekt sein.");
  }
  return value as Body;
}

function parseText(value: unknown, label: string): string {
  if (typeof value !== "string") throw badRequest(`${label} muss ein Text sein.`);
  return value.trim();
}

function parseRequiredText(value: unknown, label: string): string {
  const text = parseText(value, label);
  if (!text) throw badRequest(`${label} darf nicht leer sein.`);
  return text;
}

function parseEmail(value: unknown): string | null {
  if (value === null) return null;
  return parseText(value, "Die E-Mail-Adresse") || null;
}

function parseRole(value: unknown): Role {
  if (!ROLES.includes(value as Role)) {
    throw badRequest(`Die Rolle muss eine von ${ROLES.join(", ")} sein.`);
  }
  return value as Role;
}

export function parsePassword(value: unknown): string {
  const { password } = parseBody(value);
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  return password;
}

export function parseLogin(value: unknown): LoginRequest {
  const { username, password } = parseBody(value);
  if (typeof username !== "string" || typeof password !== "string") {
    throw badRequest("Benutzername und Passwort müssen Texte sein.");
  }
  return { username, password };
}

export function parseCreateUser(value: unknown): CreateUserRequest {
  const body = parseBody(value);
  return {
    username: parseRequiredText(body.username, "Der Benutzername"),
    displayName: parseRequiredText(body.displayName, "Der Anzeigename"),
    email: body.email === undefined ? null : parseEmail(body.email),
    role: parseRole(body.role),
    password: parsePassword(body),
  };
}

export function parseUpdateUser(value: unknown): UpdateUserRequest {
  const body = parseBody(value);
  const patch: UpdateUserRequest = {};
  if (body.username !== undefined) {
    patch.username = parseRequiredText(body.username, "Der Benutzername");
  }
  if (body.displayName !== undefined) {
    patch.displayName = parseRequiredText(body.displayName, "Der Anzeigename");
  }
  if (body.email !== undefined) patch.email = parseEmail(body.email);
  if (body.role !== undefined) patch.role = parseRole(body.role);
  if (Object.keys(patch).length === 0) throw badRequest("Es wurde keine Änderung angegeben.");
  return patch;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function parseOidcSettings(value: unknown): UpdateOidcSettingsRequest {
  const body = parseBody(value);
  if (typeof body.enabled !== "boolean") throw badRequest("enabled muss true oder false sein.");
  if (body.clientSecret !== undefined && typeof body.clientSecret !== "string") {
    throw badRequest("Das Client-Secret muss ein Text sein.");
  }
  const settings: UpdateOidcSettingsRequest = {
    enabled: body.enabled,
    displayName: parseText(body.displayName, "Der Anzeigename"),
    issuerUrl: parseText(body.issuerUrl, "Die Issuer-URL"),
    clientId: parseText(body.clientId, "Die Client-ID"),
  };
  if (body.clientSecret) settings.clientSecret = body.clientSecret;
  if (settings.enabled) {
    if (!settings.displayName || !settings.clientId) {
      throw badRequest("Zum Aktivieren sind Anzeigename und Client-ID nötig.");
    }
    if (!isHttpUrl(settings.issuerUrl)) {
      throw badRequest("Die Issuer-URL muss eine http- oder https-Adresse sein.");
    }
  }
  return settings;
}
