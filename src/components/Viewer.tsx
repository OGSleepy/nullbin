import { useState, useEffect } from "react";
import { importKey, decrypt } from "../lib/crypto";
import { fetchPaste, deletePaste } from "../lib/nostr";
import { decodeLink } from "../lib/link";
import { FALLBACK_RELAYS } from "../lib/relays";

export function Viewer() {
  const [state, setState] = useState<
    | { type: "loading" }
    | { type: "decrypting" }
    | { type: "done"; content: string }
    | { type: "passphrase" }
    | { type: "error"; message: string }
    | { type: "not_found" }
  >({ type: "loading" });

  const [passphrase, setPassphrase] = useState("");
  const [encryptedContent, setEncryptedContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setState({ type: "loading" });

    const link = decodeLink();
    if (!link) {
      setState({ type: "error", message: "Invalid or missing link parameters" });
      return;
    }

    const relaysToTry = [
      ...link.relays,
      ...FALLBACK_RELAYS,
    ];

    const result = await fetchPaste(link.eventId, relaysToTry);

    if (!result) {
      setState({ type: "not_found" });
      return;
    }

    setEncryptedContent(result.content);

    if (link.wrapped) {
      // Passphrase mode — need passphrase before we can decrypt
      setState({ type: "passphrase" });
      return;
    }

    if (!link.key) {
      setState({ type: "error", message: "No decryption key in link" });
      return;
    }

    await decryptContent(result.content, link.key);
  }

  async function decryptContent(content: string, keyB64: string) {
    setState({ type: "decrypting" });
    try {
      const key = await importKey(keyB64);
      const plaintext = await decrypt(content, key);
      setState({ type: "done", content: plaintext });

      // Burn-on-read: fire NIP-09 deletion after successful decrypt
      const link = decodeLink();
      if (link?.burn && link.sk && link.eventId && link.relays.length > 0) {
        deletePaste(link.eventId, link.relays, link.sk).catch(() => {
          // Best-effort — ignore failures silently
        });
      }
    } catch {
      setState({ type: "error", message: "Decryption failed — the key or content may be corrupted" });
    }
  }

  async function handlePassphraseSubmit() {
    if (!encryptedContent) return;
    const link = decodeLink();
    if (!link?.wrapped) return;

    setState({ type: "decrypting" });
    try {
      const { unwrapKey } = await import("../lib/crypto");
      const key = await unwrapKey(link.wrapped, passphrase);
      const plaintext = await decrypt(encryptedContent, key);
      setState({ type: "done", content: plaintext });

      // Burn-on-read after passphrase decrypt
      if (link.burn && link.sk && link.eventId && link.relays.length > 0) {
        deletePaste(link.eventId, link.relays, link.sk).catch(() => {});
      }
    } catch {
      setState({ type: "error", message: "Wrong passphrase or corrupted data" });
    }
  }

  async function copyContent(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state.type === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-6 h-6 border-2 border-null-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-null-dim font-mono">fetching from relays…</p>
      </div>
    );
  }

  if (state.type === "decrypting") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-6 h-6 border-2 border-null-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-null-dim font-mono">decrypting…</p>
      </div>
    );
  }

  if (state.type === "not_found") {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">∅</p>
        <p className="text-lg font-mono text-null-text mb-2">Paste not found</p>
        <p className="text-sm text-null-dim">
          This paste has expired, been burned, or never existed.
        </p>
        <a
          href="/"
          className="mt-6 inline-block text-xs font-mono text-null-accent hover:text-null-accent-glow transition-colors"
        >
          ← create a new paste
        </a>
      </div>
    );
  }

  if (state.type === "passphrase") {
    return (
      <div className="space-y-4 max-w-sm mx-auto py-12">
        <p className="text-sm text-null-dim text-center">
          This paste is passphrase-protected.
        </p>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePassphraseSubmit()}
          placeholder="Enter passphrase"
          autoFocus
          className="w-full bg-null-muted border border-null-border rounded-lg px-3 py-2 text-sm font-mono text-null-text placeholder-null-dim focus:outline-none focus:border-null-accent transition-colors"
        />
        <button
          onClick={handlePassphraseSubmit}
          className="w-full py-2 bg-null-accent rounded-lg text-sm font-mono text-white hover:bg-null-accent-glow transition-colors"
        >
          decrypt
        </button>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">⚠</p>
        <p className="text-lg font-mono text-null-text mb-2">Error</p>
        <p className="text-sm text-null-red font-mono">{state.message}</p>
        <a
          href="/"
          className="mt-6 inline-block text-xs font-mono text-null-accent hover:text-null-accent-glow transition-colors"
        >
          ← create a new paste
        </a>
      </div>
    );
  }

  // done
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-null-green" />
          <span className="text-xs text-null-dim font-mono">decrypted</span>
        </div>
        <button
          onClick={() => copyContent((state as { type: "done"; content: string }).content)}
          className="text-xs font-mono text-null-dim hover:text-null-accent transition-colors"
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>

      <pre className="w-full bg-null-surface border border-null-border rounded-xl px-4 py-4 text-sm font-mono text-null-text whitespace-pre-wrap break-words overflow-auto max-h-[60vh]">
        {(state as { type: "done"; content: string }).content}
      </pre>

      <div className="bg-null-muted/30 border border-null-border rounded-lg p-3">
        <p className="text-xs text-null-dim">
          <span className="text-null-accent">🔒</span> This content was
          decrypted entirely in your browser. The relay only ever stored
          ciphertext.
        </p>
      </div>

      <a
        href="/"
        className="inline-block text-xs font-mono text-null-dim hover:text-null-accent transition-colors"
      >
        ← create a new paste
      </a>
    </div>
  );
}
