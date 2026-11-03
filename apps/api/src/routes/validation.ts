import {
  DEFAULT_UNIT,
  MAX_CONSUMPTIONS_PER_ORDER,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MIN_PASSWORD_LENGTH,
  ROLES,
  type ChangeOwnPasswordRequest,
  type CreateOrderFromConsumptionsRequest,
  type CreateMaterialRequest,
  type CreateMovementRequest,
  type CreateStorageLocationRequest,
  type CreateUserRequest,
  type LoginRequest,
  type Role,
  type UpdateMaterialRequest,
  type UpdateMovementRequest,
  type UpdateOidcSettingsRequest,
  type UpdateStorageLocationRequest,
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

function assertStorableCharacters(text: string, label: string): void {
  // MongoDB would store a lone surrogate as U+FFFD, so that two different names could collide.
  if (/\p{Cs}/u.test(text) || text.includes("\0")) {
    throw badRequest(`${label} enthält ungültige Zeichen.`);
  }
}

function parseRequiredText(value: unknown, label: string): string {
  const text = parseText(value, label);
  if (!text) throw badRequest(`${label} darf nicht leer sein.`);
  assertStorableCharacters(text, label);
  return text;
}

function parseEmail(value: unknown): string | null {
  if (value === null) return null;
  const label = "Die E-Mail-Adresse";
  const text = parseText(value, label);
  assertStorableCharacters(text, label);
  return text || null;
}

function parseRole(value: unknown): Role {
  if (!ROLES.includes(value as Role)) {
    throw badRequest(`Die Rolle muss eine von ${ROLES.join(", ")} sein.`);
  }
  return value as Role;
}

function parseNewPassword(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`${label} muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  return value;
}

export function parsePassword(value: unknown): string {
  return parseNewPassword(parseBody(value).password, "Das Passwort");
}

export function parseChangeOwnPassword(value: unknown): ChangeOwnPasswordRequest {
  const { currentPassword, newPassword } = parseBody(value);
  if (typeof currentPassword !== "string") {
    throw badRequest("Das aktuelle Passwort muss ein Text sein.");
  }
  return { currentPassword, newPassword: parseNewPassword(newPassword, "Das neue Passwort") };
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

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns the stored spelling: a GUID may be written in upper case, ids are kept in lower case.
export function parseGuid(value: unknown): string | null {
  return typeof value === "string" && GUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function parseReference(value: unknown, label: string): string {
  const id = parseGuid(value);
  if (id === null) throw badRequest(`${label} muss eine GUID sein.`);
  return id;
}

function parseQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw badRequest("Die Menge muss eine Zahl größer 0 sein.");
  }
  return value;
}

function assertHasChanges(patch: object): void {
  if (Object.keys(patch).length === 0) throw badRequest("Es wurde keine Änderung angegeben.");
}

function parseDescription(value: unknown): string {
  const label = "Die Beschreibung";
  const text = parseText(value, label);
  assertStorableCharacters(text, label);
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    throw badRequest(`${label} darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen lang sein.`);
  }
  return text;
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw badRequest("Die Schlagworte müssen eine Liste sein.");
  // By the case-insensitive key, the first spelling stays. toLowerCase() does not depend on the
  // locale of the server, unlike toLocaleLowerCase() without a fixed locale.
  const tagsByKey = new Map<string, string>();
  for (const item of value as unknown[]) {
    const tag = parseRequiredText(item, "Ein Schlagwort");
    if (tag.length > MAX_TAG_LENGTH) {
      throw badRequest(`Ein Schlagwort darf höchstens ${MAX_TAG_LENGTH} Zeichen lang sein.`);
    }
    const key = tag.toLowerCase();
    if (!tagsByKey.has(key)) tagsByKey.set(key, tag);
  }
  if (tagsByKey.size > MAX_TAGS) {
    throw badRequest(`Ein Material darf höchstens ${MAX_TAGS} Schlagworte haben.`);
  }
  return [...tagsByKey.values()];
}

export function parseCreateMaterial(value: unknown): Required<CreateMaterialRequest> {
  const body = parseBody(value);
  return {
    name: parseRequiredText(body.name, "Der Name"),
    unit:
      body.unit === undefined ? DEFAULT_UNIT : parseRequiredText(body.unit, "Die Mengeneinheit"),
    description: body.description === undefined ? "" : parseDescription(body.description),
    tags: body.tags === undefined ? [] : parseTags(body.tags),
  };
}

export function parseUpdateMaterial(value: unknown): UpdateMaterialRequest {
  const body = parseBody(value);
  const patch: UpdateMaterialRequest = {};
  if (body.name !== undefined) patch.name = parseRequiredText(body.name, "Der Name");
  if (body.unit !== undefined) patch.unit = parseRequiredText(body.unit, "Die Mengeneinheit");
  if (body.description !== undefined) patch.description = parseDescription(body.description);
  if (body.tags !== undefined) patch.tags = parseTags(body.tags);
  assertHasChanges(patch);
  return patch;
}

export function parseCreateStorageLocation(value: unknown): CreateStorageLocationRequest {
  return { name: parseRequiredText(parseBody(value).name, "Der Name") };
}

export function parseUpdateStorageLocation(value: unknown): UpdateStorageLocationRequest {
  const body = parseBody(value);
  const patch: UpdateStorageLocationRequest = {};
  if (body.name !== undefined) patch.name = parseRequiredText(body.name, "Der Name");
  assertHasChanges(patch);
  return patch;
}

export function parseCreateMovement(value: unknown): CreateMovementRequest {
  const body = parseBody(value);
  return {
    storageLocationId: parseReference(body.storageLocationId, "Der Lagerort"),
    materialId: parseReference(body.materialId, "Das Material"),
    quantity: parseQuantity(body.quantity),
  };
}

export function parseUpdateMovement(value: unknown): UpdateMovementRequest {
  const body = parseBody(value);
  const patch: UpdateMovementRequest = {};
  if (body.storageLocationId !== undefined) {
    patch.storageLocationId = parseReference(body.storageLocationId, "Der Lagerort");
  }
  if (body.materialId !== undefined) {
    patch.materialId = parseReference(body.materialId, "Das Material");
  }
  if (body.quantity !== undefined) patch.quantity = parseQuantity(body.quantity);
  assertHasChanges(patch);
  return patch;
}

export function parseCreateOrderFromConsumptions(
  value: unknown,
): CreateOrderFromConsumptionsRequest {
  const body = parseBody(value);
  if (!Array.isArray(body.consumptions)) {
    throw badRequest("Die Verbräuche müssen eine Liste sein.");
  }
  const items = body.consumptions as unknown[];
  if (items.length === 0) throw badRequest("Es muss mindestens ein Verbrauch angegeben sein.");
  if (items.length > MAX_CONSUMPTIONS_PER_ORDER) {
    throw badRequest(
      `Eine Bestellung darf höchstens ${MAX_CONSUMPTIONS_PER_ORDER} Verbräuche übernehmen.`,
    );
  }
  const ids = new Set<string>();
  const consumptions = items.map((item) => {
    const { id: rawId, updatedAt } = parseBody(item);
    const id = parseReference(rawId, "Jeder Verbrauch");
    if (typeof updatedAt !== "string") {
      throw badRequest("Zu jedem Verbrauch muss updatedAt als Text angegeben sein.");
    }
    if (ids.has(id)) throw badRequest("Jeder Verbrauch darf nur einmal angegeben sein.");
    ids.add(id);
    return { id, updatedAt };
  });
  return { consumptions, quantity: parseQuantity(body.quantity) };
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
