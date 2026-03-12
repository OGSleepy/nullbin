# NullBin

**Zero-knowledge pastebin on Nostr. Encrypt in your browser. Publish to relays. Share a link. Nobody else can read it.**

```
https://nullbin.pages.dev/#e=abc123...&r=wss://relay.damus.io&k=base64key...
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

For extra security, NullBin supports **passphrase mode**: the AES key is wrapped with PBKDF2 and stored in the URL. The recipient must enter the passphrase to decrypt — no raw key is ever in the link.

---

## Nostr event schema

```json
{
  "kind": 31337,
  "content": "<base64url(IV || ciphertext || auth_tag)>",
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

A fresh ephemeral keypair is generated per paste by default. No paste is linkable to your identity.

---

## Features

- **Symmetric mode** — AES-256-GCM key in URL fragment; share with anyone
- **Burn after read** — NIP-09 deletion request sent after first successful decryption (best-effort)
- **TTL options** — 1h / 24h / 7d / 30d / no expiry, enforced via NIP-40
- **Optional passphrase** — PBKDF2-derived key wrapping for extra security
- **Relay picker** — select which relays to publish to
- **No backend** — static site deployed to Cloudflare Pages
- **No tracking** — no analytics, no telemetry

---

## Share link format

```
# Symmetric mode
https://nullbin.pages.dev/#e=<event-id>&r=<relay-url>&k=<aes-key-base64url>

# With burn-on-read
https://nullbin.pages.dev/#e=<event-id>&r=<relay-url>&k=<key>&b=1&s=<secret-key>

# Passphrase mode
https://nullbin.pages.dev/#e=<event-id>&r=<relay-url>&w=<wrapped-key>
```

| Parameter | Description |
|---|---|
| `e` | Nostr event ID (hex) |
| `r` | Relay hint (urlencoded) |
| `k` | Base64url AES-256-GCM key |
| `w` | PBKDF2-wrapped key (passphrase mode) |
| `b` | Burn flag (`1` = delete after read) |
| `s` | Ephemeral secret key for burn deletion |

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React + Vite |
| Crypto | WebCrypto API (native browser) |
| Nostr | nostr-tools v2 + applesauce-relay |
| Styling | Tailwind CSS (CDN) |
| Deploy | Cloudflare Pages |

---

## Project status

**v1.0.0 — Live at [nullbin.pages.dev](https://nullbin.pages.dev)**

See [`SPEC.md`](./SPEC.md) for the full product specification including threat model, protocol design, and UX decisions.

---

## Contributing

Open issues and PRs welcome. Before contributing, read [`SPEC.md`](./SPEC.md).

If you run a Nostr relay and want to be included in the default relay list, open an issue with your relay URL and uptime stats.

---

## Security

This project has not been audited. Do not use it for anything where your life depends on the security. That said:

- Encryption is WebCrypto AES-256-GCM — no custom crypto
- No server ever receives plaintext or keys
- Threat model is documented in `SPEC.md`

To report a vulnerability, open a GitHub issue marked `[security]`.

---

## NIPs used

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Base protocol
- [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) — Event deletion
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) — Parameterized replaceable events
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) — Expiration timestamp

---

## License

MIT
