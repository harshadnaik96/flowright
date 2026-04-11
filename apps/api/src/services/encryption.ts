import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "flowright-salt-v1"; // static salt — key stretching only

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY env var is required");
  return scryptSync(secret, SALT, 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");

  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

// ─── Auth helpers — encrypt sensitive fields before saving to DB ──────────────

import type { EnvironmentAuth } from "@flowright/shared";

const SENSITIVE_FIELDS: (keyof EnvironmentAuth)[] = [
  "phoneNumber",
  "otp",
  "mpin",
  "email",
  "password",
  "storageState",
  "loginScript",
];

export function encryptAuth(auth: EnvironmentAuth): EnvironmentAuth {
  const result = { ...auth };
  for (const field of SENSITIVE_FIELDS) {
    const value = result[field];
    if (value && typeof value === "string") {
      (result as Record<string, unknown>)[field] = encrypt(value);
    }
  }
  return result;
}

export function decryptAuth(auth: EnvironmentAuth): EnvironmentAuth {
  const result = { ...auth };
  for (const field of SENSITIVE_FIELDS) {
    const value = result[field];
    if (value && typeof value === "string") {
      try {
        (result as Record<string, unknown>)[field] = decrypt(value);
      } catch {
        // field may not be encrypted (legacy or empty) — leave as-is
      }
    }
  }
  return result;
}
