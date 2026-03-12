/**
 * NullBin Nostr module
 */

import { generateSecretKey, finalizeEvent } from "nostr-tools";
import { RelayPool, onlyEvents } from "applesauce-relay";
import { firstValueFrom, timeout, filter } from "rxjs";
import type { EncryptedPayload } from "./crypto";
import { toBase64url, fromBase64url } from "./crypto";

export const NULLBIN_KIND = 31337;

let _pool: RelayPool | null = null;

export function getPool(): RelayPool {
  if (!_pool) _pool = new RelayPool();
  return _pool;
}

// ─── TTL ─────────────────────────────────────────────────────────────────────

export type TTL = "1h" | "24h" | "7d" | "30d" | "never";

const TTL_SECONDS: Record<TTL, number | null> = {
  "1h": 3600,
  "24h": 86400,
  "7d": 604800,
  "30d": 2592000,
  never: null,
};

export function ttlLabel(ttl: TTL): string {
  return {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
    never: "No expiry",
  }[ttl];
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface PublishOptions {
  payload: EncryptedPayload;
  relays: string[];
  ttl: TTL;
  secretKey?: Uint8Array;
}

export interface PublishResult {
  eventId: string;
  publishedTo: string[];
  failedOn: string[];
  secretKey: Uint8Array;
}

export async function publishPaste(opts: PublishOptions): Promise<PublishResult> {
  const sk = opts.secretKey ?? generateSecretKey();
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

  const event = finalizeEvent(
    {
      kind: NULLBIN_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: opts.payload.encoded,
    },
    sk,
  );

  const pool = getPool();

  // pool.publish returns PublishResponse[] with { from, ok, message }
  const responses = await pool.publish(opts.relays, event);

  const publishedTo = responses.filter((r) => r.ok).map((r) => r.from);
  const failedOn = responses.filter((r) => !r.ok).map((r) => r.from);

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
  const allRelays = [...new Set(relays)];
  if (allRelays.length === 0) return null;

  const pool = getPool();

  try {
    // pool.request() is for one-off fetches; returns only events (no EOSE)
    const event = await firstValueFrom(
      pool
        .request(
          allRelays,
          { kinds: [NULLBIN_KIND], ids: [eventId], limit: 1 },
          { retries: 2, timeout: 8000 },
        )
        .pipe(
          filter((e: { id: string; content: string }) => e.id === eventId),
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

  const deleteEvent = finalizeEvent(
    {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", eventId]],
      content: "burn",
    },
    sk,
  );

  const pool = getPool();
  // Fire-and-forget
  pool.publish(relays, deleteEvent).catch(() => {});
}

export { toBase64url, fromBase64url };
