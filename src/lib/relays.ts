export interface RelayInfo {
  url: string;
  status: "unknown" | "online" | "slow" | "offline";
  latency?: number;
}

// Default relay list — relay.nostr.band intentionally excluded (dead)
export const DEFAULT_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.wine",
];

export const FALLBACK_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.wine",
];

export async function checkRelayHealth(url: string): Promise<RelayInfo> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timeout = setTimeout(() => {
      resolve({ url, status: "offline" });
    }, 5000);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        ws.close();
        resolve({
          url,
          status: latency < 500 ? "online" : "slow",
          latency,
        });
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ url, status: "offline" });
      };
    } catch {
      clearTimeout(timeout);
      resolve({ url, status: "offline" });
    }
  });
}
