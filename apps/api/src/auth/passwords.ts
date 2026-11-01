import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// OWASP's parameters for low memory use; stored in each hash, so that they can be raised later
const SCRYPT_OPTIONS = { N: 2 ** 14, r: 8, p: 5 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  const { N, r, p } = SCRYPT_OPTIONS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

// Stands in for missing accounts, so that their logins take as long as real ones
let dummyHash: Promise<string> | undefined;

// Always derives a key, also without a stored hash, so that timing does not reveal the account.
export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(SALT_LENGTH).toString("base64url"));
  const [scheme, N, r, p, salt, key] = (storedHash ?? (await dummyHash)).split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected) && storedHash !== null;
}
