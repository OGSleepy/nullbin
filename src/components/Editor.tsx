import { useState } from "react";
import { generateKey, exportKey, encrypt, wrapKey, toBase64url } from "../lib/crypto";
import { publishPaste, type TTL, ttlLabel } from "../lib/nostr";
import { encodeLink } from "../lib/link";
import { DEFAULT_RELAYS } from "../lib/relays";
import { RelayPicker } from "./RelayPicker";

const TTL_OPTIONS: TTL[] = ["1h", "24h", "7d", "30d", "never"];

export function Editor() {
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState<TTL>("24h");
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [relays, setRelays] = useState<string[]>(DEFAULT_RELAYS);
  const [showRelays, setShowRelays] = useState(false);

  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "encrypting" }
    | { type: "publishing" }
    | { type: "done"; link: string; key: string; publishedTo: string[] }
    | { type: "error"; message: string }
  >({ type: "idle" });

  async function handlePublish() {
    if (!content.trim()) return;

    try {
      setStatus({ type: "encrypting" });

      const key = await generateKey();
      const payload = await encrypt(content, key);

      setStatus({ type: "publishing" });

      const result = await publishPaste({ payload, relays, ttl });

      // Build link params
      const skB64 = toBase64url(result.secretKey);
      let linkKey: string | undefined;
      let linkWrapped: string | undefined;

      if (passphrase.trim()) {
        // Passphrase mode: wrap the AES key; don't put raw key in URL
        linkWrapped = await wrapKey(key, passphrase.trim());
      } else {
        linkKey = await exportKey(key);
      }

      const link = encodeLink({
        eventId: result.eventId,
        relays: result.publishedTo.slice(0, 2),
        key: linkKey,
        wrapped: linkWrapped,
        burn: burnOnRead,
        sk: burnOnRead ? skB64 : undefined,
      });

      setStatus({
        type: "done",
        link,
        key: linkKey ?? "(protected by passphrase)",
        publishedTo: result.publishedTo,
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function reset() {
    setContent("");
    setStatus({ type: "idle" });
    setBurnOnRead(false);
    setPassphrase("");
  }

  async function copyLink(text: string) {
    await navigator.clipboard.writeText(text);
  }

  if (status.type === "done") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-null-green" />
          <span className="text-sm text-null-dim">
            Published to {status.publishedTo.length} relay{status.publishedTo.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div>
          <label className="block text-xs text-null-dim font-mono uppercase tracking-wider mb-2">
            Share link
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={status.link}
              className="flex-1 bg-null-muted border border-null-border rounded-lg px-3 py-2 text-xs font-mono text-null-text focus:outline-none"
            />
            <button
              onClick={() => copyLink(status.link)}
              className="px-4 py-2 bg-null-accent rounded-lg text-xs font-mono font-medium text-white hover:bg-null-accent-glow transition-colors"
            >
              copy
            </button>
          </div>
          <p className="mt-1 text-xs text-null-dim">
            The decryption key is in the{" "}
            <code className="text-null-accent">#fragment</code> — it's never
            sent to any server.
          </p>
        </div>

        <div className="bg-null-muted/50 border border-null-border rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-500 text-sm mt-0.5">⚠</span>
            <div>
              <p className="text-xs text-null-dim font-medium mb-1">
                Save this key separately if needed
              </p>
              <code className="text-xs font-mono text-null-text break-all">
                {status.key}
              </code>
            </div>
          </div>
        </div>

        <div className="text-xs text-null-dim space-y-1">
          {status.publishedTo.map((r) => (
            <div key={r} className="flex items-center gap-2">
              <span className="text-null-green">✓</span>
              <span className="font-mono">{r}</span>
            </div>
          ))}
        </div>

        <button
          onClick={reset}
          className="text-xs text-null-dim hover:text-null-text transition-colors font-mono"
        >
          ← new paste
        </button>
      </div>
    );
  }

  const isWorking =
    status.type === "encrypting" || status.type === "publishing";

  return (
    <div className="space-y-5">
      {/* Content */}
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your content here…"
          disabled={isWorking}
          rows={12}
          className="w-full bg-null-surface border border-null-border rounded-xl px-4 py-3 text-sm font-mono text-null-text placeholder-null-dim focus:outline-none focus:border-null-accent transition-colors resize-none disabled:opacity-50"
          autoFocus
        />
      </div>

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* TTL */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-null-dim font-mono">expires</span>
          <select
            value={ttl}
            onChange={(e) => setTtl(e.target.value as TTL)}
            disabled={isWorking}
            className="bg-null-muted border border-null-border rounded-lg px-2 py-1 text-xs font-mono text-null-text focus:outline-none focus:border-null-accent transition-colors disabled:opacity-50"
          >
            {TTL_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {ttlLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {/* Burn on read */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setBurnOnRead((b) => !b)}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              burnOnRead ? "bg-null-accent" : "bg-null-muted border border-null-border"
            }`}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                burnOnRead ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-xs font-mono text-null-dim">burn on read</span>
        </label>

        {/* Passphrase */}
        <button
          onClick={() => setShowPassphrase((v) => !v)}
          className="text-xs font-mono text-null-dim hover:text-null-accent transition-colors"
        >
          {showPassphrase ? "− passphrase" : "+ passphrase"}
        </button>

        {/* Relay picker toggle */}
        <button
          onClick={() => setShowRelays((v) => !v)}
          className="text-xs font-mono text-null-dim hover:text-null-accent transition-colors ml-auto"
        >
          {relays.length} relay{relays.length !== 1 ? "s" : ""} ↕
        </button>
      </div>

      {/* Passphrase input */}
      {showPassphrase && (
        <div>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Optional passphrase (adds a second layer of encryption)"
            className="w-full bg-null-muted border border-null-border rounded-lg px-3 py-2 text-sm font-mono text-null-text placeholder-null-dim focus:outline-none focus:border-null-accent transition-colors"
          />
          <p className="mt-1 text-xs text-null-dim">
            Recipients will need this passphrase in addition to the link.
          </p>
        </div>
      )}

      {/* Relay picker */}
      {showRelays && (
        <div className="bg-null-surface border border-null-border rounded-xl p-4">
          <RelayPicker selected={relays} onChange={setRelays} />
        </div>
      )}

      {/* Burn warning */}
      {!burnOnRead && (
        <p className="text-xs text-null-dim">
          <span className="text-null-yellow">⚠</span> Burn-on-read is off.
          Anyone with the link can read this paste multiple times until it
          expires.
        </p>
      )}

      {/* Error */}
      {status.type === "error" && (
        <p className="text-xs text-null-red font-mono">{status.message}</p>
      )}

      {/* Submit */}
      <button
        onClick={handlePublish}
        disabled={!content.trim() || isWorking}
        className="w-full py-3 bg-null-accent rounded-xl text-sm font-mono font-medium text-white hover:bg-null-accent-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status.type === "encrypting"
          ? "encrypting…"
          : status.type === "publishing"
            ? "publishing to relays…"
            : "encrypt & publish"}
      </button>
    </div>
  );
}
