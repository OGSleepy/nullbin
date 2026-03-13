import { useState, useEffect } from "react";
import { importKey, decrypt } from "../lib/crypto";
import { fetchPaste, deletePaste } from "../lib/nostr";
import { decodeLink } from "../lib/link";
import { FALLBACK_RELAYS } from "../lib/relays";

// ── Shiki syntax highlighting ─────────────────────────────────────────────────

async function highlight(code: string, lang: string): Promise<string | null> {
  try {
    const { createHighlighter, createJavaScriptRegexEngine } = await import("shiki");
    const highlighter = await createHighlighter({
      langs: [lang],
      themes: ["github-dark"],
      engine: createJavaScriptRegexEngine(),
    });
    return highlighter.codeToHtml(code, { lang, theme: "github-dark" });
  } catch {
    return null;
  }
}

// ── File bundle ───────────────────────────────────────────────────────────────

interface FileBundle {
  name: string;
  mime: string;
  size: number;
  data: string; // base64
}

function tryParseFileBundle(text: string): FileBundle | null {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed._type === "file" &&
      typeof parsed.name === "string" &&
      typeof parsed.data === "string"
    ) {
      return {
        name: parsed.name,
        mime: parsed.mime ?? "application/octet-stream",
        size: parsed.size ?? 0,
        data: parsed.data,
      };
    }
  } catch { /* not a file bundle */ }
  return null;
}

function downloadFile(bundle: FileBundle) {
  const binary = atob(bundle.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: bundle.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bundle.name;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Viewer() {
  const [state, setState] = useState<
    | { type: "loading" }
    | { type: "decrypting" }
    | { type: "done"; content: string; lang: string; html: string | null; file: FileBundle | null }
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

      // Check if this is a file bundle
      const file = tryParseFileBundle(plaintext);

      let lang = "text";
      let html: string | null = null;

      if (!file) {
        lang = link?.lang ?? "text";
        html = lang !== "text" ? await highlight(plaintext, lang) : null;
      }

      setState({ type: "done", content: plaintext, lang, html, file });

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

      const file = tryParseFileBundle(plaintext);

      let lang = "text";
      let html: string | null = null;

      if (!file) {
        lang = link.lang ?? "text";
        html = lang !== "text" ? await highlight(plaintext, lang) : null;
      }

      setState({ type: "done", content: plaintext, lang, html, file });

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

  // ── Loading states ──────────────────────────────────────────────────────────

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

  // ── Done ────────────────────────────────────────────────────────────────────

  const { content, lang, html, file } = state;

  // File download UI
  if (file) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 font-mono">decrypted</span>
          <span className="text-xs font-mono text-purple-400 bg-purple-950 border border-purple-900 px-2 py-0.5 rounded">
            file
          </span>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 flex flex-col items-center gap-4">
          <span className="text-4xl">📎</span>
          <div className="text-center">
            <p className="text-sm font-mono text-gray-200 break-all">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              {formatSize(file.size)} · {file.mime}
            </p>
          </div>
          <button
            onClick={() => downloadFile(file)}
            className="px-6 py-2 bg-purple-600 rounded-lg text-sm font-mono text-white hover:bg-purple-500 transition-colors"
          >
            ↓ download
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500">
            <span className="text-purple-400">🔒</span> This file was
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

  // Text / code UI
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
