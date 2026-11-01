import type mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { UserModel } from "./user.js";

const local = {
  username: "anna",
  displayName: "Anna",
  role: "USER",
  source: "local",
  passwordHash: "hash",
};
const oidc = {
  username: "bob",
  displayName: "Bob",
  role: "USER",
  source: "oidc",
  oidcIssuer: "https://idp.example",
  oidcSubject: "sub-1",
};

// validate() needs no database; validateSync() is deprecated since Mongoose 9
async function invalidPaths(fields: object): Promise<string[]> {
  try {
    await new UserModel(fields).validate();
    return [];
  } catch (err) {
    return Object.keys((err as mongoose.Error.ValidationError).errors);
  }
}

describe("UserModel", () => {
  it("accepts a local and an OIDC user", async () => {
    expect(await invalidPaths(local)).toEqual([]);
    expect(await invalidPaths(oidc)).toEqual([]);
  });

  it.each(["username", "displayName", "role", "source"] as const)("requires %s", async (field) => {
    expect(await invalidPaths({ ...local, [field]: undefined })).toContain(field);
  });

  it("allows only the three roles", async () => {
    expect(await invalidPaths({ ...local, role: "manager" })).toEqual(["role"]);
  });

  it("requires a password hash for local users only", async () => {
    expect(await invalidPaths({ ...local, passwordHash: undefined })).toEqual(["passwordHash"]);
    expect(await invalidPaths({ ...oidc, passwordHash: "hash" })).toEqual(["passwordHash"]);
  });

  it("requires the OIDC identity for OIDC users only", async () => {
    expect(await invalidPaths({ ...oidc, oidcSubject: undefined })).toEqual(["oidcSubject"]);
    expect(await invalidPaths({ ...local, oidcIssuer: "https://idp.example" })).toEqual([
      "oidcIssuer",
    ]);
  });

  it("defaults the email to null", () => {
    expect(new UserModel(local).email).toBeNull();
  });

  it("declares unique indexes for the username and the OIDC identity", () => {
    const indexes = UserModel.schema.indexes();

    expect(indexes).toContainEqual([{ username: 1 }, expect.objectContaining({ unique: true })]);
    expect(indexes).toContainEqual([
      { oidcIssuer: 1, oidcSubject: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { source: "oidc" } }),
    ]);
  });
});
