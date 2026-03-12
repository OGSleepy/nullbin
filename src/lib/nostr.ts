/**
 * NullBin Nostr module
 *
 * Uses:
 *   - nostr-tools for key generation, event signing
 *   - applesauce-relay RelayPool for relay connections
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import { RelayPool, onlyEvents } from "applesauce-relay";
import { firstValueFrom, timeout, filter } from "rxjs";
import type { EncryptedPayload } from "./crypto";
import { toBase64url, fromBase64url } from "./crypto";

export const NULLBIN_KIND = 31337;

// Shared relay pool instance
let _pool: RelayPool | null = null;

export function getPool(): RelayPool {
  if (!_pool) _pool = new RelayPool();
  return _pool;
}

// ─── TTL helpers ──────────────────────────────────────────────────────────────

export type TTL = "1h" | "24h" | "7d" | "30d" | "never";

const TTL_SECONDS: Record<TTL, number | null> = {
  "1h": 3600,
  "24h": 86400,
  "7d": 604800,
  "30d": 2592000,
  never: null,
};

export function ttlLabel(ttl: TTL): string {
  return { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days", never: "No expiry" }[ttl];
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface PublishOptions {
  payload: EncryptedPayload;
  relays: string[];
  ttl: TTL;
  /** optional: use caller-supplied secret key; otherwise ephemeral */
  secretKey?: Uint8Array;
}

export interface PublishResult {
  eventId: string;
  publishedTo: string[];
  failedOn: string[];
  /** The secret key used to sign — needed for burn-on-read (NIP-09) */
  secretKey: Uint8Array;
}

export async function publishPaste(opts: PublishOptions): Promise<PublishResult> {
  const sk = opts.secretKey ?? generateSecretKey();
  const pk = getPublicKey(sk);
  const expirationSeconds = TTL_SECONDS[opts.ttl];

  const tags: string[][] = [
    ["d", crypto.randomUUID()],
    ["t", "nullbin"],
    ["enc", "aes-256-gcm"],
    ["v", "1"],
  ];

  if (expirationSeconds !== null) {
    const expiry = Math.floor(Date.now() / 1000) + expirationSeconds;
    tags.push(["expiration", String(expiry)]);
  }

  const template = {
    kind: NULLBIN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: opts.payload.encoded,
    pubkey: pk,
  };

  const event = finalizeEvent(template, sk);
  const pool = getPool();

  const publishedTo: string[] = [];
  const failedOn: string[] = [];

  await Promise.all(
    opts.relays.map(async (url) => {
      try {
        const relay = pool.relay(url);
        await relay.publish(event);
        publishedTo.push(url);
      } catch {
        failedOn.push(url);
      }
    }),
  );

  if (publishedTo.length === 0) {
    throw new Error("Failed to publish to any relay");
  }

  return { eventId: event.id, publishedTo, failedOn, secretKey: sk };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchPaste(
  eventId: string,
  relays: string[],
): Promise<{ content: string } | null> {
  const allRelays = [...new Set([...relays])];
  if (allRelays.length === 0) return null;

  const pool = getPool();

  try {
    const event = await firstValueFrom(
      pool
        .subscription(allRelays, {
          kinds: [NULLBIN_KIND],
          ids: [eventId],
          limit: 1,
        })
        .pipe(
          onlyEvents(),
          filter((e) => e.id === eventId),
          timeout(8000),
        ),
    );
    return { content: event.content };
  } catch {
    return null;
  }
}

// ─── Delete (NIP-09, best-effort) ─────────────────────────────────────────────

export async function deletePaste(
  eventId: string,
  relays: string[],
  secretKeyB64: string,
): Promise<void> {
  const sk = fromBase64url(secretKeyB64);
  const pk = getPublicKey(sk);

  const deleteEvent = finalizeEvent(
    {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", eventId]],
      content: "burn",
      pubkey: pk,
    },
    sk,
  );

  const pool = getPool();
  // Fire-and-forget — burn-on-read is best-effort
  await Promise.allSettled(
    relays.map(async (url) => {
      try {
        const relay = pool.relay(url);
        await relay.publish(deleteEvent);
      } catch {
        // Ignore
      }
    }),
  );
}

// Re-export so callers don't need a second import
export { toBase64url, fromBase64url };
