# NullBin

**Zero-knowledge pastebin on Nostr. Encrypt in your browser. Publish to relays. Share a link. Nobody else can read it.**

```
https://nullbin.xyz/#e=abc123...&r=wss://relay.damus.io&k=base64key...
                                                          ↑
                              decryption key — never sent to any server
```

---

## What is this?

NullBin is a pastebin where the server — and every Nostr relay — sees only ciphertext.

- **Encrypt**: AES-256-GCM in your browser via the WebCrypto API
- **Store**: Encrypted blob published as a Nostr event across multiple relays
- **Share**: A link with the decryption key embedded in the URL `#fragment` (browsers never transmit this to servers)
- **Expire**: Events carry a NIP-40 expiry tag. Set a TTL or burn after first read.

Think PrivateBin or ZeroBin — but with no server to run, no database to subpoena, and content replicated across a decentralized relay network.

---

## Why Nostr instead of a traditional server?

| Property | Traditional ZK Pastebin | NullBin |
|---|---|---|
| Server sees content | No | No |
| Single point of deletion | **Yes** | No |
| Single point of failure | **Yes** | No |
| Operator can be pressured | **Yes** | Relays are independent |
| Self-hostable frontend | Sometimes | Yes (static HTML) |
| No server infra needed | No | **Yes** |

---

## How the encryption works

```
plaintext
    │
    ▼
[ AES-256-GCM ]  ◄──  random 256-bit key + 96-bit IV  (generated in browser)
    │
    ▼
ciphertext  ──►  Nostr event content  ──►  relays (see only ciphertext)

decryption key  ──►  URL #fragment  ──►  recipient's browser only
                       (never transmitted over HTTP)
```

For targeted sharing, NullBin also supports **NIP-44** (XChaCha20-Poly1305 + ECDH): encrypt directly to a recipient's Nostr pubkey. No key in the URL at all — they decrypt with their own private key.

---

## Nostr event schema

```json
{
  "kind": 31337,
  "content": "<base64(IV || ciphertext || auth_tag)>",
  "tags": [
    ["d", "<uuid>"],
    ["expiration", "<unix timestamp>"],
    ["t", "nullbin"],
    ["enc", "aes-256-gcm"],
    ["v", "1"]
  ],
  "pubkey": "<ephemeral keypair per paste>",
  "sig": "..."
}
```

A fresh ephemeral keypair is generated per paste by default. No paste is linkable to your identity unless you choose to sign with your own key (NIP-07).

---

## Features

- **Symmetric mode** — AES-256-GCM key in URL fragment; share with anyone
- **Recipient mode** — NIP-44 encryption to a Nostr pubkey; no shareable key exists
- **Burn after read** — NIP-09 deletion request sent after first successful decryption (best-effort)
- **TTL options** — 1h / 24h / 7d / 30d / no expiry, enforced via NIP-40
- **Optional passphrase** — PBKDF2-derived key wrapping for extra security
- **Relay picker** — health-checked relay selection; publishes to ≥3 relays by default
- **Syntax highlighting** — Shiki (WASM); lazy-loaded; display only, never affects encryption
- **No backend** — static site; deployable to Cloudflare Pages or IPFS
- **No tracking** — no analytics, no fonts from external CDNs, strict CSP

---

## Share link format

```
# Symmetric mode
https://nullbin.xyz/#e=<event-id>&r=<relay-url>&k=<aes-key-base64url>

# NIP-44 recipient mode
https://nullbin.xyz/#e=<event-id>&r=<relay-url>&m=nip44
```

| Parameter | Description |
|---|---|
| `e` | Nostr event ID (hex) |
| `r` | Relay hint (urlencoded); multiple `r=` params allowed |
| `k` | Base64url AES-256-GCM key (symmetric mode only) |
| `m` | Mode flag: `nip44` for recipient mode |

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | SvelteKit (static adapter) |
| Crypto | WebCrypto API (native browser) |
| Nostr | nostr-tools v2 |
| Styling | Tailwind CSS |
| Highlighting | Shiki (WASM, lazy) |
| Deploy | Cloudflare Pages / IPFS |

---

## Project status

**Pre-alpha. Spec complete. Implementation in progress.**

See [`SPEC.md`](./SPEC.md) for the full product specification including threat model, protocol design, and UX decisions.

See the [milestones](https://github.com/OGSleepy/nullbin/milestones) for the build plan.

---

## Contributing

Open issues and PRs are welcome. Before contributing, read [`SPEC.md`](./SPEC.md) and the open questions in section 12 — several protocol decisions are still being finalized.

If you run a Nostr relay and want to be included in the default relay list, open an issue with your relay URL and uptime stats.

---

## Security

This project has not been audited. Do not use it for anything where your life depends on the security. That said:

- Encryption is WebCrypto AES-256-GCM — no custom crypto
- No server ever receives plaintext or keys
- Threat model is documented in `SPEC.md` §8

To report a vulnerability, open a GitHub issue marked `[security]` or contact the maintainer directly.

---

## NIPs used

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Base protocol
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) — Browser key management
- [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) — Event deletion
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) — Parameterized replaceable events
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) — Expiration timestamp
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) — Versioned encryption

---

## License

MIT
