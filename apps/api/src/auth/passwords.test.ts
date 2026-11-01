import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.js";

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse");

    await expect(verifyPassword("correct horse", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong horse", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("does not store the password in clear", async () => {
    expect(await hashPassword("correct horse")).not.toContain("correct horse");
  });

  it("verifies with the parameters stored in the hash", async () => {
    const salt = Buffer.from("0123456789abcdef");
    const key = scryptSync("old password", salt, 64, { N: 1024, r: 8, p: 1 });
    const hash = `scrypt$1024$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;

    await expect(verifyPassword("old password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("rejects a missing or malformed hash", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
  });
});
