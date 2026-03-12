# NullBin — Architecture Notes

High-level notes for contributors. See `SPEC.md` for the full product specification.

## Directory structure (planned)

```
nullbin/
├── src/
│   ├── lib/
│   │   ├── crypto.ts          # AES-256-GCM encrypt/decrypt, PBKDF2 passphrase derivation
│   │   ├── nostr.ts           # Event construction, signing, relay pool, NIP-09 deletion
│   │   ├── relay-picker.ts    # Relay health checks, user selection persistence
│   │   └── link.ts            # URL fragment encode/decode for all share link params
│   ├── routes/
│   │   ├── +page.svelte       # Editor (create paste)
│   │   └── view/
│   │       └── +page.svelte   # Viewer (fetch + decrypt + render)
│   └── components/
│       ├── Editor.svelte
│       ├── Viewer.svelte
│       ├── RelayPicker.svelte
│       └── ShareLink.svelte
├── static/
├── SPEC.md
├── ARCHITECTURE.md
└── README.md
```

## Crypto flow

```
CREATE
──────
crypto.getRandomValues(256-bit key)
crypto.getRandomValues(96-bit IV)
SubtleCrypto.encrypt("AES-GCM", key, plaintext)
→ base64url(IV || ciphertext || auth_tag) → event.content
→ base64url(raw key) → URL #k=

READ
────
URL #k= → base64url decode → CryptoKey
fetch event by ID from relay
base64url decode content → split IV | ciphertext | auth_tag
SubtleCrypto.decrypt("AES-GCM", key, IV, ciphertext)
→ plaintext rendered in browser
```

## Invariants

- The AES key **never** appears in: event content, event tags, HTTP requests, console logs, or local storage.
- Every paste uses a fresh IV. Never reuse IV with the same key.
- Ephemeral keypairs are generated with `nostr-tools` `generateSecretKey()` and discarded after signing.
- `expiration` tag is always set. No paste is immortal by default.

## Relay publishing strategy

Publish to N≥3 relays in parallel. Wait for at least 2 confirmations before showing the share link. If fewer than 2 confirm within 5 seconds, warn the user and offer to retry.

## NIP-44 mode

When `#m=nip44` is in the URL, skip AES entirely. The event content is a NIP-44 encrypted payload. The viewer calls `window.nostr.nip44.decrypt()` (NIP-07 extension) to decrypt. No key management needed on our side.

## Known limitations

- Burn-after-read is best-effort. Relays are not required to honor NIP-09.
- NIP-40 expiry is advisory. Malicious or misconfigured relays may retain events indefinitely.
- WebCrypto requires HTTPS. Local development requires `localhost` or a TLS proxy.
