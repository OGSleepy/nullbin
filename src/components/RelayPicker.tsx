import { useState, useEffect } from "react";
import { DEFAULT_RELAYS, pingRelay, type RelayStatus } from "../lib/relays";

interface Props {
  selected: string[];
  onChange: (relays: string[]) => void;
}

export function RelayPicker({ selected, onChange }: Props) {
  const [custom, setCustom] = useState("");
  const [statuses, setStatuses] = useState<Record<string, RelayStatus>>({});

  const allRelays = [...new Set([...DEFAULT_RELAYS, ...selected])];

  // Ping all relays on mount
  useEffect(() => {
    for (const url of allRelays) {
      setStatuses((s) => ({ ...s, [url]: "unknown" }));
      pingRelay(url).then((status) =>
        setStatuses((s) => ({ ...s, [url]: status }))
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(url: string) {
    if (selected.includes(url)) {
      onChange(selected.filter((r) => r !== url));
    } else {
      onChange([...selected, url]);
    }
  }

  function addCustom() {
    const url = custom.trim();
    if (!url || !url.startsWith("wss://")) return;
    if (!selected.includes(url)) {
      onChange([...selected, url]);
      // Also ping the newly added relay
      setStatuses((s) => ({ ...s, [url]: "unknown" }));
      pingRelay(url).then((status) =>
        setStatuses((s) => ({ ...s, [url]: status }))
      );
    }
    setCustom("");
  }

  const dotColor: Record<RelayStatus, string> = {
    unknown: "bg-gray-600",
    online:  "bg-green-500",
    offline: "bg-red-500",
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
        Relays
      </p>

      <div className="space-y-2">
        {allRelays.map((url) => {
          const status = statuses[url] ?? "unknown";
          const isSelected = selected.includes(url);
          return (
            <label
              key={url}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(url)}
                className="sr-only"
              />
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected
                    ? "bg-purple-600 border-purple-600"
                    : "bg-transparent border-gray-700 group-hover:border-gray-500"
                }`}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              {/* liveness dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor[status]}`} />

              <span className="text-xs font-mono text-gray-300 truncate">{url}</span>
            </label>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="wss://your-relay.com"
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          onClick={addCustom}
          className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-purple-400 border border-gray-800 rounded-lg transition-colors"
        >
          add
        </button>
      </div>
    </div>
  );
}
