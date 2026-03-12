import { Editor } from "./components/Editor";
import { Viewer } from "./components/Viewer";

function isViewMode(): boolean {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return params.has("e");
}

export function App() {
  const viewMode = isViewMode();

  return (
    <div className="min-h-screen bg-null-bg text-null-text flex flex-col">
      {/* Header */}
      <header className="border-b border-null-border px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-lg bg-null-accent flex items-center justify-center text-white text-xs font-mono font-bold group-hover:bg-null-accent-glow transition-colors">
            ∅
          </div>
          <span className="font-mono font-medium text-null-text">NullBin</span>
        </a>
        <span className="text-xs text-null-dim font-mono hidden sm:block">
          zero-knowledge · nostr-native
        </span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <div className="max-w-3xl w-full mx-auto px-6 py-10 flex-1">
          {!viewMode && (
            <div className="mb-8">
              <h1 className="text-2xl font-mono font-semibold text-null-text mb-1">
                New paste
              </h1>
              <p className="text-sm text-null-dim">
                Encrypted in your browser. The relay sees only ciphertext.
              </p>
            </div>
          )}

          {viewMode ? <Viewer /> : <Editor />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-null-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-null-dim font-mono">
          <span>
            AES-256-GCM · NIP-44 · NIP-09 · NIP-40
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/OGSersleepy/nullbin"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-null-accent transition-colors"
            >
              github
            </a>
            <a
              href="https://github.com/OGSersleepy/nullbin/blob/main/SPEC.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-null-accent transition-colors"
            >
              spec
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
