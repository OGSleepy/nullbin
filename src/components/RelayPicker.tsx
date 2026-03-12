import { useState, useEffect, useCallback } from "react";
import { DEFAULT_RELAYS, checkRelayHealth, type RelayInfo } from "../lib/relays";

interface Props {
  selected: string[];
  onChange: (relays: string[]) => void;
}

export function RelayPicker({ selected, onChange }: Props) {
  const [relayInfos, setRelayInfos] = useState<RelayInfo[]>(
    DEFAULT_RELAYS.map((url) => ({ url, status: "unknown" as const })),
  );
  const [custom, setCustom] = useState("");
  const [checking, setChecking] = useState(false);

  const checkAll = useCallback(async (urls: string[]) => {
    setChecking(true);
    const results = await Promise.all(urls.map(checkRelayHealth));
    setRelayInfos(results);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkAll(relayInfos.map((r) => r.url));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(url: string) {
    if (selected.includes(url)) {
      if (selected.length === 1) return; // always keep at least 1
      onChange(selected.filter((r) => r !== url));
    } else {
      onChange([...selected, url]);
    }
  }

  function addCustom() {
    const url = custom.trim();
    if (!url) return;
    if (!url.startsWith("wss://")) return;
    if (relayInfos.some((r) => r.url === url)) return;
    const newInfo: RelayInfo = { url, status: "unknown" };
    setRelayInfos((prev) => [...prev, newInfo]);
    onChange([...selected, url]);
    setCustom("");
    checkRelayHealth(url).then((info) =>
      setRelayInfos((prev) => prev.map((r) => (r.url === url ? info : r))),
    );
  }

  function dot(status: RelayInfo["status"]) {
    return {
      online: "bg-null-green",
      slow: "bg-null-yellow",
      offline: "bg-null-red",
      unknown: "bg-null-dim animate-pulse",
    }[status];
  }

  function latencyLabel(info: RelayInfo) {
    if (info.status === "unknown") return "checking…";
    if (info.status === "offline") return "offline";
    if (info.latency) return `${info.latency}ms`;
    return info.status;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-null-dim font-mono uppercase tracking-wider">
          Relays
        </span>
        <button
          onClick={() => checkAll(relayInfos.map((r) => r.url))}
          disabled={checking}
          className="text-xs text-null-dim hover:text-null-accent transition-colors disabled:opacity-40"
        >
          {checking ? "checking…" : "recheck"}
        </button>
      </div>

      {relayInfos.map((info) => (
        <label
          key={info.url}
          className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-null-muted/50 transition-colors group"
        >
          <input
            type="checkbox"
            checked={selected.includes(info.url)}
            onChange={() => toggle(info.url)}
            className="accent-null-accent"
          />
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot(info.status)}`} />
          <span className="font-mono text-xs text-null-text flex-1 truncate">
            {info.url.replace("wss://", "")}
          </span>
          <span className="font-mono text-xs text-null-dim ml-auto flex-shrink-0">
            {latencyLabel(info)}
          </span>
        </label>
      ))}

      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="wss://your-relay.com"
          className="flex-1 bg-null-muted border border-null-border rounded-lg px-3 py-1.5 text-xs font-mono text-null-text placeholder-null-dim focus:outline-none focus:border-null-accent transition-colors"
        />
        <button
          onClick={addCustom}
          className="px-3 py-1.5 text-xs font-mono bg-null-muted border border-null-border rounded-lg text-null-dim hover:text-null-text hover:border-null-accent transition-colors"
        >
          add
        </button>
      </div>
    </div>
  );
}
