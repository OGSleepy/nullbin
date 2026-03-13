import { RelayLiveness } from "applesauce-relay";
import { getPool } from "./nostr";

export interface RelayInfo {
  url: string;
  status: "unknown" | "online" | "slow" | "offline" | "dead";
  latency?: number;
}

// Default relay list — relay.nostr.band intentionally excluded (dead)
export const DEFAULT_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export const FALLBACK_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

// Singleton liveness tracker — connects to the pool so status updates
// automatically whenever the pool opens/closes relay connections
let _liveness: RelayLiveness | null = null;

export function getLiveness(): RelayLiveness {
  if (!_liveness) {
    _liveness = new RelayLiveness({
      maxFailuresBeforeDead: 4,
      backoffBaseDelay: 15_000,
      backoffMaxDelay: 3 * 60_000,
    });
    _liveness.connectToPool(getPool());
  }
  return _liveness;
}

// Manual WebSocket ping — used for initial latency measurement in the picker
export async function checkRelayHealth(url: string): Promise<RelayInfo> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setTimeout(() => {
      resolve({ url, status: "offline" });
    }, 5000);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        clearTimeout(timer);
        const latency = Date.now() - start;
        ws.close();
        resolve({
          url,
          status: latency < 500 ? "online" : "slow",
          latency,
        });
      };

      ws.onerror = () => {
        clearTimeout(timer);
        ws.close();
        resolve({ url, status: "offline" });
      };
    } catch {
      clearTimeout(timer);
      resolve({ url, status: "offline" });
    }
  });
}
