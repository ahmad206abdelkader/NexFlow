import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;
const HASH_PREFIX = "scrypt";

export const generateGoogleFormsWebhookSecret = () =>
  randomBytes(32).toString("base64url");

export const hashGoogleFormsWebhookSecret = async (secret: string) => {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(secret, salt, KEY_LENGTH)) as Buffer;

  return [
    HASH_PREFIX,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join(":");
};

export const verifyGoogleFormsWebhookSecret = async (
  secret: string,
  storedHash: string,
) => {
  const [prefix, encodedSalt, encodedKey] = storedHash.split(":");

  if (prefix !== HASH_PREFIX || !encodedSalt || !encodedKey) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(encodedKey, "base64url");
    const actualKey = (await scrypt(
      secret,
      Buffer.from(encodedSalt, "base64url"),
      expectedKey.length,
    )) as Buffer;

    return (
      actualKey.length === expectedKey.length &&
      timingSafeEqual(actualKey, expectedKey)
    );
  } catch {
    return false;
  }
};

export const hashGoogleFormsWebhookValue = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const stableJsonStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(entry)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
};
