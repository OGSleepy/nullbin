import { useState, useEffect, useCallback } from "react";
import { DEFAULT_RELAYS, checkRelayHealth, getLiveness, type RelayInfo } from "../lib/relays";

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

  // Subscribe to Applesauce RelayLiveness observables so dots update
  // automatically whenever relays connect/disconnect during the session
  useEffect(() => {
    const liveness = getLiveness();

    const subs = [
      liveness.online$.subscribe((urls: string[]) => {
        setRelayInfos((prev) =>
          prev.map((r) =>
            urls.includes(r.url) ? { ...r, status: "online" as const } : r,
          ),
        );
      }),
      liveness.offline$.subscribe((urls: string[]) => {
        setRelayInfos((prev) =>
          prev.map((r) =>
            urls.includes(r.url) ? { ...r, status: "offline" as const } : r,
          ),
        );
      }),
      liveness.dead$.subscribe((urls: string[]) => {
        setRelayInfos((prev) =>
          prev.map((r) =>
            urls.includes(r.url) ? { ...r, status: "dead" as const } : r,
          ),
        );
      }),
    ];

    return () => subs.forEach((s) => s.unsubscribe());
  }, []);

  // Initial manual ping for latency numbers
  const checkAll = useCallback(async (urls: string[]) => {
    setChecking(true);
    const results = await Promise.all(urls.map(checkRelayHealth));
    setRelayInfos((prev) =>
      prev.map((existing) => {
        const fresh = results.find((r) => r.url === existing.url);
        // Preserve liveness status if it's already been set by the observable;
        // only overwrite if still unknown
        if (!fresh) return existing;
        return existing.status === "unknown" ? fresh : { ...fresh, status: existing.status };
      }),
    );
    setChecking(false);
  }, []);

  useEffect(() => {
    checkAll(relayInfos.map((r) => r.url));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(url: string) {
    if (selected.includes(url)) {
      if (selected.length === 1) return;
      onChange(selected.filter((r) => r !== url));
    } else {
      onChange([...selected, url]);
    }
  }

  function addCustom() {
    const url = custom.trim();
    if (!url || !url.startsWith("wss://")) return;
    if (relayInfos.some((r) => r.url === url)) return;
    const newInfo: RelayInfo = { url, status: "unknown" };
    setRelayInfos((prev) => [...prev, newInfo]);
    onChange([...selected, url]);
    setCustom("");
    checkRelayHealth(url).then((info) =>
      setRelayInfos((prev) => prev.map((r) => (r.url === url ? info : r))),
    );
  }

  function dotClass(status: RelayInfo["status"]) {
    return {
      online: "bg-green-500",
      slow:   "bg-yellow-500",
      offline:"bg-red-500",
      dead:   "bg-red-700",
      unknown:"bg-gray-600 animate-pulse",
    }[status];
  }

  function latencyLabel(info: RelayInfo) {
    if (info.status === "unknown") return "checking…";
    if (info.status === "offline") return "offline";
    if (info.status === "dead")    return "dead";
    if (info.latency) return `${info.latency}ms`;
    return info.status;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-mono uppercase tracking-wider">
          Relays
        </span>
        <button
          onClick={() => checkAll(relayInfos.map((r) => r.url))}
          disabled={checking}
          className="text-xs text-gray-500 hover:text-purple-400 transition-colors disabled:opacity-40"
        >
          {checking ? "checking…" : "recheck"}
        </button>
      </div>

      {relayInfos.map((info) => (
        <label
          key={info.url}
          className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.includes(info.url)}
            onChange={() => toggle(info.url)}
            className="accent-purple-500"
          />
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(info.status)}`} />
          <span className="font-mono text-xs text-gray-200 flex-1 truncate">
            {info.url.replace("wss://", "")}
          </span>
          <span className="font-mono text-xs text-gray-500 ml-auto flex-shrink-0">
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
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          onClick={addCustom}
          className="px-3 py-1.5 text-xs font-mono bg-gray-900 border border-gray-800 rounded-lg text-gray-500 hover:text-gray-200 hover:border-purple-500 transition-colors"
        >
          add
        </button>
      </div>
    </div>
  );
}
