import { useState } from "react";
import { generateKey, exportKey, encrypt, wrapKey, toBase64url } from "../lib/crypto";
import { publishPaste, type TTL, ttlLabel } from "../lib/nostr";
import { encodeLink } from "../lib/link";
import { DEFAULT_RELAYS } from "../lib/relays";
import { RelayPicker } from "./RelayPicker";

const TTL_OPTIONS: TTL[] = ["1h", "24h", "7d", "30d", "never"];

const LANGUAGES = [
  { value: "text",        label: "Plain text" },
  { value: "javascript",  label: "JavaScript" },
  { value: "typescript",  label: "TypeScript" },
  { value: "python",      label: "Python" },
  { value: "rust",        label: "Rust" },
  { value: "go",          label: "Go" },
  { value: "bash",        label: "Bash" },
  { value: "json",        label: "JSON" },
  { value: "yaml",        label: "YAML" },
  { value: "sql",         label: "SQL" },
  { value: "html",        label: "HTML" },
  { value: "css",         label: "CSS" },
  { value: "markdown",    label: "Markdown" },
  { value: "dockerfile",  label: "Dockerfile" },
];

export function Editor() {
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState<TTL>("24h");
  const [lang, setLang] = useState("text");
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

      const result = await publishPaste({ payload, relays, ttl, lang });

      const skB64 = toBase64url(result.secretKey);
      let linkKey: string | undefined;
      let linkWrapped: string | undefined;

      if (passphrase.trim()) {
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
        lang: lang !== "text" ? lang : undefined,
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
    setLang("text");
  }

  async function copyLink(text: string) {
    await navigator.clipboard.writeText(text);
  }

  if (status.type === "done") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-gray-500">
            Published to {status.publishedTo.length} relay{status.publishedTo.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div>
          <label className="block text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
            Share link
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={status.link}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 focus:outline-none"
            />
            <button
              onClick={() => copyLink(status.link)}
              className="px-4 py-2 bg-purple-600 rounded-lg text-xs font-mono font-medium text-white hover:bg-purple-500 transition-colors"
            >
              copy
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            The decryption key is in the{" "}
            <code className="text-purple-400">#fragment</code> — it's never
            sent to any server.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-500 text-sm mt-0.5">⚠</span>
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                Save this key separately if needed
              </p>
              <code className="text-xs font-mono text-gray-200 break-all">
                {status.key}
              </code>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          {status.publishedTo.map((r) => (
            <div key={r} className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span className="font-mono">{r}</span>
            </div>
          ))}
        </div>

        <button
          onClick={reset}
          className="text-xs text-gray-500 hover:text-gray-200 transition-colors font-mono"
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
          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors resize-none disabled:opacity-50"
          autoFocus
        />
      </div>

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Language */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">lang</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={isWorking}
            className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* TTL */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">expires</span>
          <select
            value={ttl}
            onChange={(e) => setTtl(e.target.value as TTL)}
            disabled={isWorking}
            className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
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
              burnOnRead ? "bg-purple-600" : "bg-gray-800 border border-gray-700"
            }`}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                burnOnRead ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-xs font-mono text-gray-500">burn on read</span>
        </label>

        {/* Passphrase */}
        <button
          onClick={() => setShowPassphrase((v) => !v)}
          className="text-xs font-mono text-gray-500 hover:text-purple-400 transition-colors"
        >
          {showPassphrase ? "− passphrase" : "+ passphrase"}
        </button>

        {/* Relay picker toggle */}
        <button
          onClick={() => setShowRelays((v) => !v)}
          className="text-xs font-mono text-gray-500 hover:text-purple-400 transition-colors ml-auto"
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
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">
            Recipients will need this passphrase in addition to the link.
          </p>
        </div>
      )}

      {/* Relay picker */}
      {showRelays && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
          <RelayPicker selected={relays} onChange={setRelays} />
        </div>
      )}

      {/* Burn warning */}
      {!burnOnRead && (
        <p className="text-xs text-gray-500">
          <span className="text-yellow-500">⚠</span> Burn-on-read is off.
          Anyone with the link can read this paste multiple times until it
          expires.
        </p>
      )}

      {/* Error */}
      {status.type === "error" && (
        <p className="text-xs text-red-400 font-mono">{status.message}</p>
      )}

      {/* Submit */}
      <button
        onClick={handlePublish}
        disabled={!content.trim() || isWorking}
        className="w-full py-3 bg-purple-600 rounded-xl text-sm font-mono font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
