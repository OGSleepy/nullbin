import { useState, useEffect } from "react";
import { importKey, decrypt } from "../lib/crypto";
import { fetchPaste, deletePaste } from "../lib/nostr";
import { decodeLink } from "../lib/link";
import { FALLBACK_RELAYS } from "../lib/relays";

async function highlight(code: string, lang: string): Promise<string | null> {
  try {
    const { codeToHtml, createJavaScriptRegexEngine } = await import("shiki");
    return await codeToHtml(code, {
      lang,
      theme: "github-dark",
      engine: createJavaScriptRegexEngine(),
    });
  } catch {
    return null;
  }
}

export function Viewer() {
  const [state, setState] = useState<
    | { type: "loading" }
    | { type: "decrypting" }
    | { type: "done"; content: string; lang: string; html: string | null }
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

    const relaysToTry = [...new Set([...link.relays, ...FALLBACK_RELAYS])];
    const result = await fetchPaste(link.eventId, relaysToTry);

    if (!result) {
      setState({ type: "not_found" });
      return;
    }

    setEncryptedContent(result.content);

    if (link.wrapped) {
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

      const link = decodeLink();
      const lang = link?.lang ?? "text";

      // Lazy-load Shiki only if a language was specified
      const html = lang !== "text" ? await highlight(plaintext, lang) : null;

      setState({ type: "done", content: plaintext, lang, html });

      // Burn-on-read
      if (link?.burn && link.sk && link.eventId && link.relays.length > 0) {
        deletePaste(link.eventId, link.relays, link.sk).catch(() => {});
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

      const lang = link.lang ?? "text";
      const html = lang !== "text" ? await highlight(plaintext, lang) : null;

      setState({ type: "done", content: plaintext, lang, html });

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
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-mono">fetching from relays…</p>
      </div>
    );
  }

  if (state.type === "decrypting") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-mono">decrypting…</p>
      </div>
    );
  }

  if (state.type === "not_found") {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">∅</p>
        <p className="text-lg font-mono text-gray-200 mb-2">Paste not found</p>
        <p className="text-sm text-gray-500">
          This paste has expired, been burned, or never existed.
        </p>
        <a href="/" className="mt-6 inline-block text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors">
          ← create a new paste
        </a>
      </div>
    );
  }

  if (state.type === "passphrase") {
    return (
      <div className="space-y-4 max-w-sm mx-auto py-12">
        <p className="text-sm text-gray-500 text-center">
          This paste is passphrase-protected.
        </p>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePassphraseSubmit()}
          placeholder="Enter passphrase"
          autoFocus
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          onClick={handlePassphraseSubmit}
          className="w-full py-2 bg-purple-600 rounded-lg text-sm font-mono text-white hover:bg-purple-500 transition-colors"
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
        <p className="text-lg font-mono text-gray-200 mb-2">Error</p>
        <p className="text-sm text-red-400 font-mono">{state.message}</p>
        <a href="/" className="mt-6 inline-block text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors">
          ← create a new paste
        </a>
      </div>
    );
  }

  // done
  const { content, lang, html } = state;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 font-mono">decrypted</span>
          {lang !== "text" && (
            <span className="text-xs font-mono text-purple-400 bg-purple-950 border border-purple-900 px-2 py-0.5 rounded">
              {lang}
            </span>
          )}
        </div>
        <button
          onClick={() => copyContent(content)}
          className="text-xs font-mono text-gray-500 hover:text-purple-400 transition-colors"
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>

      {html ? (
        // Shiki-highlighted — dangerouslySetInnerHTML is safe here because
        // the HTML is generated client-side from already-decrypted plaintext
        // by Shiki, not from any server-supplied content.
        <div
          className="w-full rounded-xl overflow-auto max-h-[60vh] text-sm [&_pre]:p-4 [&_pre]:m-0 [&_pre]:rounded-xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-sm font-mono text-gray-200 whitespace-pre-wrap break-words overflow-auto max-h-[60vh]">
          {content}
        </pre>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-500">
          <span className="text-purple-400">🔒</span> This content was
          decrypted entirely in your browser. The relay only ever stored
          ciphertext.
        </p>
      </div>

      <a href="/" className="inline-block text-xs font-mono text-gray-500 hover:text-purple-400 transition-colors">
        ← create a new paste
      </a>
    </div>
  );
}
