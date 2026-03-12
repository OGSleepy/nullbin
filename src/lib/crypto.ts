/**
 * NullBin crypto module
 * All encryption/decryption happens here using native WebCrypto (AES-256-GCM).
 * The AES key never leaves the browser except via the URL fragment.
 */

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// ─── Key generation ───────────────────────────────────────────────────────────

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64url(new Uint8Array(raw));
}

export async function importKey(b64: string): Promise<CryptoKey> {
  const raw = fromBase64url(b64);
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: ALGO }, false, [
    "decrypt",
  ]);
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  /** base64url(IV || ciphertext || auth_tag) — stored in Nostr event content */
  encoded: string;
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plaintext),
  );

  // Pack: IV (12 bytes) || ciphertext+auth_tag (variable)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return { encoded: toBase64url(combined) };
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

export async function decrypt(
  encoded: string,
  key: CryptoKey,
): Promise<string> {
  const combined = fromBase64url(encoded);

  if (combined.byteLength <= IV_LENGTH) {
    throw new Error("Payload too short — likely corrupted");
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

// ─── Passphrase wrapping (optional) ───────────────────────────────────────────

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2.
 * Used to wrap/unwrap the main AES key when a passphrase is set.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapKey(
  key: CryptoKey,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const raw = await crypto.subtle.exportKey("raw", key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const wrapped = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    wrappingKey,
    raw,
  );
  // Pack: salt (16) || iv (12) || wrapped key
  const combined = new Uint8Array(
    salt.byteLength + iv.byteLength + wrapped.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(wrapped), salt.byteLength + iv.byteLength);
  return toBase64url(combined);
}

export async function unwrapKey(
  encoded: string,
  passphrase: string,
): Promise<CryptoKey> {
  const combined = fromBase64url(encoded);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const wrapped = combined.slice(28);
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const raw = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    wrappingKey,
    wrapped,
  );
  return crypto.subtle.importKey("raw", raw, { name: ALGO }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

export function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const b64 = pad ? padded + "=".repeat(4 - pad) : padded;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
