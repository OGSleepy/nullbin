/**
 * NullBin link module
 *
 * Share link format:
 *   https://nullbin.pages.dev/#e=<event-id>&r=<relay>&k=<aes-key>&l=<lang>
 *
 * The #fragment is never sent over HTTP — it's only parsed client-side.
 */

export interface PasteLink {
  eventId: string;
  relays: string[];
  key?: string;      // base64url AES key — symmetric mode
  mode?: "nip44";   // recipient mode
  wrapped?: string;  // passphrase-wrapped key
  sk?: string;       // base64url ephemeral secret key — only present if burn=true
  burn?: boolean;    // burn-on-read flag
  lang?: string;     // syntax highlight language hint e.g. "typescript"
}

export function encodeLink(link: PasteLink): string {
  const params = new URLSearchParams();
  params.set("e", link.eventId);
  for (const r of link.relays) {
    params.append("r", r);
  }
  if (link.key)     params.set("k", link.key);
  if (link.mode)    params.set("m", link.mode);
  if (link.wrapped) params.set("w", link.wrapped);
  if (link.burn && link.sk) {
    params.set("b", "1");
    params.set("s", link.sk);
  }
  if (link.lang && link.lang !== "text") params.set("l", link.lang);

  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#${params.toString()}`;
}

export function decodeLink(fragment?: string): PasteLink | null {
  const raw = fragment ?? window.location.hash.slice(1);
  if (!raw) return null;

  try {
    const params = new URLSearchParams(raw);
    const eventId = params.get("e");
    if (!eventId) return null;

    const relays   = params.getAll("r");
    const key      = params.get("k") ?? undefined;
    const modeRaw  = params.get("m");
    const mode     = modeRaw === "nip44" ? "nip44" : undefined;
    const wrapped  = params.get("w") ?? undefined;
    const burn     = params.get("b") === "1";
    const sk       = params.get("s") ?? undefined;
    const lang     = params.get("l") ?? undefined;

    return { eventId, relays, key, mode, wrapped, burn, sk, lang };
  } catch {
    return null;
  }
}
