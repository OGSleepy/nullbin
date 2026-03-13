export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export const FALLBACK_RELAYS = DEFAULT_RELAYS;

export type RelayStatus = "unknown" | "online" | "offline";

/**
 * Ping a relay via a raw WebSocket connection.
 * Resolves "online" if it opens within 4 seconds, "offline" otherwise.
 * No applesauce dependency — works at any library version.
 */
export function pingRelay(url: string): Promise<RelayStatus> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (status: RelayStatus) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve(status);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return resolve("offline");
    }

    const timer = setTimeout(() => settle("offline"), 4000);
    ws.onopen  = () => { clearTimeout(timer); settle("online");  };
    ws.onerror = () => { clearTimeout(timer); settle("offline"); };
    ws.onclose = () => { clearTimeout(timer); settle("offline"); };
  });
}
