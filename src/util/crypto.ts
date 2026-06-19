import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

const AES_GCM_ALGORITHM = "AES-GCM";
const ENCRYPTED_VERSION = "v202606";
const ENCRYPTION_KEY_ID_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY_ID";
const ENCRYPTION_KEY_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY";

const ENCRYPTION_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const SHA256_HEX_LENGTH = 64;

const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export type EncryptedString = {
  v: "v202606";
  alg: "AES-GCM";
  kid: string;
  iv: string;
  data: string;
};

let cachedEncryptionKey:
  | { kid: string; encodedKey: string; cryptoKey: CryptoKey }
  | undefined;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const generateToken = (): string => {
  const tokenBytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(tokenBytes);
  return tokenBytes.toBase64({ alphabet: "base64url", omitPadding: true });
};

export const hashString = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );

  return new Uint8Array(digest).toHex();
};

export const assertBearerToken = (token: string): void => {
  if (token.length !== TOKEN_LENGTH || !BEARER_TOKEN_PATTERN.test(token)) {
    throw new TypeError("Bearer token must be 43-character base64url");
  }
};

export const verifyBearerTokenHash = async (
  token: string,
  storedHashHex: string,
): Promise<boolean> => {
  try {
    assertBearerToken(token);
  } catch {
    return false;
  }

  if (
    storedHashHex.length !== SHA256_HEX_LENGTH ||
    !SHA256_HEX_PATTERN.test(storedHashHex)
  ) {
    return false;
  }

  const actualHashHex = await hashString(token);
  return compareSha256HashHex(actualHashHex, storedHashHex);
};

export const encryptString = async (
  label: string,
  value: string,
): Promise<EncryptedString> => {
  const iv = new Uint8Array(GCM_IV_BYTES);
  crypto.getRandomValues(iv);

  const aad = textEncoder.encode(label);
  const { kid, cryptoKey } = await getEncryptionKey();

  const encrypted = await crypto.subtle.encrypt(
    { name: AES_GCM_ALGORITHM, iv, additionalData: aad },
    cryptoKey,
    textEncoder.encode(value),
  );

  return {
    v: ENCRYPTED_VERSION,
    alg: AES_GCM_ALGORITHM,
    kid,
    iv: iv.toBase64(),
    data: new Uint8Array(encrypted).toBase64(),
  };
};

export const decryptString = async (
  label: string,
  value: EncryptedString,
): Promise<string> => {
  if (value.v !== ENCRYPTED_VERSION) {
    throw new Error(`Unsupported encrypted string version: ${value.v}`);
  }

  if (value.alg !== AES_GCM_ALGORITHM) {
    throw new Error(`Unsupported encryption algorithm: ${value.alg}`);
  }

  const { kid, cryptoKey } = await getEncryptionKey();
  if (value.kid !== kid) {
    throw new Error(`Unsupported encryption key id: ${value.kid}`);
  }

  const iv = decodeBase64(value.iv, "iv");
  if (iv.byteLength !== GCM_IV_BYTES) {
    throw new Error("Invalid AES-GCM IV length");
  }

  const data = decodeBase64(value.data, "data");
  if (data.byteLength < 16) {
    throw new Error("Invalid encrypted data");
  }

  const aad = textEncoder.encode(label);
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_GCM_ALGORITHM, iv, additionalData: aad },
    cryptoKey,
    data,
  );

  return textDecoder.decode(decrypted);
};

export const timingSafeIncludes = (
  candidates: readonly string[],
  value: string,
): boolean => {
  const valueBytes = textEncoder.encode(value);
  let found = false;
  for (const candidate of candidates) {
    const candidateBytes = textEncoder.encode(candidate);
    const maxLen = Math.max(candidateBytes.byteLength, valueBytes.byteLength);

    if (maxLen === 0) {
      found = true;
      continue;
    }

    const paddedCandidate = new Uint8Array(maxLen);
    const paddedValue = new Uint8Array(maxLen);
    paddedCandidate.set(candidateBytes);
    paddedValue.set(valueBytes);

    if (
      timingSafeEqual(paddedCandidate, paddedValue) &&
      candidateBytes.byteLength === valueBytes.byteLength
    ) {
      found = true;
    }
  }
  return found;
};

const getEncryptionKey = async (): Promise<{
  kid: string;
  cryptoKey: CryptoKey;
}> => {
  const kid = Deno.env.get(ENCRYPTION_KEY_ID_ENV);
  const encodedKey = Deno.env.get(ENCRYPTION_KEY_ENV);

  if (!kid) {
    throw new Error(`${ENCRYPTION_KEY_ID_ENV} must be set`);
  }

  if (!encodedKey) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be set`);
  }

  if (
    cachedEncryptionKey?.kid === kid &&
    cachedEncryptionKey.encodedKey === encodedKey
  ) {
    return {
      kid: cachedEncryptionKey.kid,
      cryptoKey: cachedEncryptionKey.cryptoKey,
    };
  }

  const keyBytes = decodeBase64(encodedKey, ENCRYPTION_KEY_ENV);
  if (keyBytes.byteLength !== ENCRYPTION_KEY_BYTES) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must decode to 32 bytes`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    AES_GCM_ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );

  cachedEncryptionKey = { kid, encodedKey, cryptoKey };
  return { kid, cryptoKey };
};

const compareSha256HashHex = (
  expectedHex: string,
  actualHex: string,
): boolean => {
  if (
    expectedHex.length !== SHA256_HEX_LENGTH ||
    actualHex.length !== SHA256_HEX_LENGTH ||
    !SHA256_HEX_PATTERN.test(expectedHex) ||
    !SHA256_HEX_PATTERN.test(actualHex)
  ) {
    return false;
  }

  return timingSafeEqual(
    Uint8Array.fromHex(expectedHex),
    Uint8Array.fromHex(actualHex),
  );
};

const decodeBase64 = (
  value: string,
  label: string,
): Uint8Array<ArrayBuffer> => {
  try {
    return Uint8Array.fromBase64(value, { lastChunkHandling: "strict" });
  } catch {
    throw new Error(`Invalid base64: ${label}`);
  }
};
