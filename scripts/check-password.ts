
import { createHmac, scrypt, timingSafeEqual } from "crypto";

const SCRYPT_PREFIX = "scrypt$";

function legacyHashPassword(password: string, salt: string): string {
  return createHmac("sha256", salt).update(password).digest("hex");
}

function comparePasswordHashes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const stored = {
  passwordHash: "ead07de5de96fbe4f8d67764ac5786952c6b59315c6beec5751ff6572bda89ec",
  salt: "d052f0f1fc2240489b1763810b84a268"
};

const password = "963850";

if (!stored.passwordHash.startsWith(SCRYPT_PREFIX)) {
  const candidate = Buffer.from(legacyHashPassword(password, stored.salt), "hex");
  const expected = Buffer.from(stored.passwordHash, "hex");
  console.log("Legacy verification:", comparePasswordHashes(expected, candidate));
} else {
  console.log("Scrypt verification needed");
}
