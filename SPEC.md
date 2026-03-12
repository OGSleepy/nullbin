# NullBin — Product Specification

**Version:** 0.1  
**Date:** March 2026  
**Status:** Draft

> *Encrypt in your browser. Publish to relays. Share a link. The server — and every relay — sees only ciphertext.*

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Protocol Design](#3-protocol-design)
4. [Share Link Format](#4-share-link-format)
5. [User Flows](#5-user-flows)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Relay Strategy](#7-relay-strategy)
8. [Security Model](#8-security-model)
9. [UX Notes](#9-ux-notes)
10. [NIPs Referenced](#10-nostr-improvement-proposals-referenced)
11. [Development Milestones](#11-development-milestones)
12. [Open Questions](#12-open-questions)

---

## 1. Overview

NullBin is a zero-knowledge, decentralized pastebin built on the Nostr protocol. Users paste sensitive content — credentials, keys, one-time codes, private messages — which is encrypted entirely in the browser before being published as a Nostr event. The decryption key never touches any server or relay; it lives only in the URL fragment (`#`) of the share link, which browsers do not transmit over HTTP.

Unlike traditional ZK pastebins (PrivateBin, ZeroBin), NullBin stores its ciphertext across a decentralized relay network. There is no central server to seize, no database to subpoena, and no single point of deletion.

### 1.1 Design Pillars

- **Zero-knowledge** — relays receive only AES-256-GCM ciphertext. No relay operator can read content.
- **Serverless frontend** — NullBin is a static HTML/JS site deployable to any CDN or IPFS.
- **Censorship-resistant storage** — ciphertext is replicated across multiple user-selected Nostr relays.
- **Ephemeral by default** — events carry an expiry tag; relay garbage-collection is the TTL mechanism.
- **Optional recipient targeting** — content can be encrypted to a recipient's Nostr pubkey via NIP-44 instead of a shared link.

---

## 2. Goals & Non-Goals

### 2.1 In Scope

- Client-side AES-256-GCM encryption / decryption of paste content.
- Publishing encrypted Nostr events to one or more relays.
- Shareable links with the decryption key embedded in the URL fragment.
- Configurable TTL (burn on read, 1h, 24h, 7d, 30d, no expiry).
- NIP-44 direct-to-pubkey encryption for authenticated recipients.
- Relay selection UI with health-check indicators.
- Read-once / burn-after-read mode (best-effort via NIP-09 delete request).
- Syntax highlighting for common languages (read-only display).
- Optional passphrase layer on top of AES key for extra security.

### 2.2 Out of Scope (v1)

- Account system, login, or profiles.
- Paste editing (Nostr events are immutable; editing is a v2 concern).
- Full Nostr social features (follows, timelines, DMs).
- Native mobile apps.
- Paid relay management or subscription billing.

---

## 3. Protocol Design

### 3.1 Nostr Event Schema

NullBin uses a custom event kind in the parameterized replaceable range. A dedicated kind avoids polluting note feeds and allows relay-side filtering.

```json
{
  "kind": 31337,
  "content": "<base64(AES-256-GCM ciphertext + IV + auth tag)>",
  "tags": [
    ["d", "<uuid>"],
    ["expiration", "<unix timestamp>"],
    ["t", "nullbin"],
    ["enc", "aes-256-gcm"],
    ["v", "1"]
  ],
  "pubkey": "<ephemeral or user pubkey>",
  "sig": "..."
}
```

> **Note:** `kind 31337` is currently unregistered. See [Open Questions §12](#12-open-questions).

### 3.2 Encryption Scheme (Symmetric / Link Mode)

When creating a paste without a specific recipient:

| Step | Detail |
|---|---|
| Key generation | `crypto.getRandomValues()` → 256-bit AES key |
| IV generation | `crypto.getRandomValues()` → 96-bit IV (recommended for GCM) |
| Encryption | `SubtleCrypto.encrypt('AES-GCM', key, plaintext)` |
| Serialization | `base64url(IV \|\| ciphertext \|\| auth_tag)` → stored in `event.content` |
| Key transport | `base64url(raw key bytes)` → appended to share URL as `#k=<key>` |

The URL fragment (`#k=...`) is stripped by browsers before any HTTP request is made and is never logged by servers or relays. Decryption on the reader side reverses this process using the same WebCrypto API.

### 3.3 NIP-44 Recipient Mode

When the author knows the recipient's Nostr public key, NullBin uses NIP-44 (XChaCha20-Poly1305 + ECDH) instead of the symmetric scheme. The encrypted payload replaces `event.content`; no key fragment is needed in the URL. The recipient decrypts with their own private key (held in their Nostr client / NIP-07 extension).

> This mode is preferred for targeted sharing: the recipient authenticates themselves and no shareable key ever exists.

### 3.4 Ephemeral Keypair

By default, NullBin generates a fresh secp256k1 keypair per paste. This prevents correlation of pastes to a persistent identity. Users may optionally sign with their own Nostr keypair (via NIP-07 browser extension) if provenance matters.

### 3.5 Burn-After-Read (Best-Effort)

NullBin can issue a NIP-09 deletion event immediately after the first successful decryption. Compliant relays will honor the deletion request. This is explicitly labeled **best-effort** in the UI because:

- Not all relays honor NIP-09.
- The event may have already been replicated to relays NullBin does not know about.

---

## 4. Share Link Format

```
# Symmetric mode
https://nullbin.pages.dev/#e=<event-id>&r=<relay-url>&k=<aes-key-base64url>

# NIP-44 recipient mode (no key in URL)
https://nullbin.pages.dev/#e=<event-id>&r=<relay-url>&m=nip44
```

| Parameter | Description |
|---|---|
| `e` | Nostr event ID (hex) |
| `r` | Relay hint URL (urlencoded); multiple `r=` params allowed |
| `k` | Base64url AES-256-GCM key (symmetric mode only) |
| `m` | Mode flag: `nip44` for recipient mode |

---

## 5. User Flows

### 5.1 Creating a Paste

1. User navigates to nullbin.pages.dev.
2. User pastes or types content into the editor.
3. User configures: TTL, burn-on-read toggle, optional passphrase, syntax highlight language.
4. User selects target relays from the relay picker (defaults to 3 reliable public relays).
5. User clicks **Encrypt & Publish**.
6. Browser generates AES key + IV, encrypts content, publishes signed Nostr event to selected relays.
7. NullBin displays the share link and (separately) the raw key for user's records.
8. Link is copied to clipboard automatically.

### 5.2 Reading a Paste

1. Recipient opens the share link.
2. NullBin extracts the event ID and relay hint from the URL fragment.
3. NullBin queries the hint relay (and optionally well-known relays) for the event.
4. If event is found: browser extracts the AES key from the URL fragment and decrypts in-memory.
5. Decrypted plaintext is rendered. It never leaves the browser.
6. If burn-on-read was enabled: NullBin immediately publishes a NIP-09 deletion event.
7. If event is not found (expired or burned): a clear "Paste not found or expired" message is shown.

---

## 6. Frontend Architecture

NullBin ships as a single-page application with zero server-side rendering and no backend. All logic runs in the browser.

### 6.1 Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| UI framework | SvelteKit (static adapter) | Zero-overhead, small bundle, easy static export |
| Crypto | WebCrypto API (native) | No deps; hardware-accelerated AES-GCM |
| Nostr library | nostr-tools v2 | Lightweight; NIP-07, NIP-44, WebSocket relay pool |
| Styling | Tailwind CSS | Utility-first; no runtime overhead |
| Code highlighting | Shiki (WASM) | Tree-sitter accuracy; lazy-loaded |
| Deployment | Cloudflare Pages or IPFS | Zero infra; global edge CDN |

### 6.2 Key Modules

| Module | Responsibility |
|---|---|
| `crypto.ts` | Key generation, AES-256-GCM encrypt/decrypt, passphrase derivation (PBKDF2) |
| `nostr.ts` | Event construction, signing, relay pool management, NIP-09 deletion |
| `relay-picker.ts` | Relay health checks (WebSocket ping), user selection persistence |
| `link.ts` | URL fragment encoding/decoding for all share link parameters |
| `Editor.svelte` | Paste input with syntax mode selector, TTL picker, passphrase toggle |
| `Viewer.svelte` | Fetch event → decrypt → render with Shiki highlighting |

---

## 7. Relay Strategy

Reliability is the main UX risk: if all target relays are down when a recipient opens the link, the paste is unreadable. NullBin mitigates this by:

- Publishing to a minimum of 3 relays by default.
- Encoding one relay hint in the share URL; recipients can also try a hardcoded fallback list.
- Showing relay health (🟢 / 🟡 / 🔴) in the relay picker based on WebSocket connect latency.
- Allowing users to add custom relay URLs.
- Noting in the UI that paid relays offer better retention guarantees.

### 7.1 Default Relay List (v1)

```
wss://relay.damus.io
wss://nos.lol
wss://relay.nostr.band
wss://nostr.wine
```

---

## 8. Security Model

### 8.1 Threat Model

| Threat | Mitigated? | Notes |
|---|---|---|
| Relay operator reads content | ✅ Yes | Content is AES-256-GCM ciphertext; relay has no key |
| Network eavesdropper | ✅ Yes | WebSocket over TLS; key in URL fragment (not transmitted) |
| Relay logs share URL | ⚠️ Partial | Key is in fragment; server never receives it in standard browsers |
| Relay retains after expiry | ⚠️ Partial | NIP-40 is advisory; malicious relays may retain |
| Recipient shares link onward | ❌ No | Out of scope; burn-on-read partially mitigates |
| Browser extension reads plaintext | ❌ No | User must trust their own browser environment |
| Passphrase brute-force | ⚠️ Partial | PBKDF2 with 600k iterations; strong passphrases recommended |

### 8.2 Security Notices (shown in UI)

- NullBin cannot prevent a recipient from copying or forwarding your content.
- Burn-after-read is best-effort. Compliant relays honor it; others may not.
- Your browser environment (extensions, OS) is outside NullBin's security boundary.
- Relay hints in the URL are public. Do not include sensitive metadata in relay hostnames.

---

## 9. UX Notes

The interface should feel fast, minimal, and trustworthy. Users sharing sensitive information are already in a heightened security mindset; the UI should reinforce — not undermine — that confidence.

- Dark mode by default.
- No analytics, no tracking pixels, no third-party scripts. Verifiable via CSP header.
- Clear visual distinction between creating and reading modes.
- Prominent warning when burn-on-read is disabled.
- Copy-to-clipboard on the share link with a single click; link shown in full for inspection.
- Relay status shown as colored dots; clicking reveals latency and event count.
- Clear "Paste expired or burned" screen — no ambiguity about what happened.
- The raw AES key is shown once at creation time with a "save this separately" warning.

---

## 10. Nostr Improvement Proposals Referenced

| NIP | Purpose |
|---|---|
| [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | Basic protocol: event structure, signing, relay communication |
| [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) | `window.nostr` browser extension interface for key management |
| [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) | Event deletion request (burn-on-read) |
| [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) | Parameterized replaceable events (`kind` 30000–39999, `d` tag) |
| [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) | Expiration timestamp tag |
| [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) | Versioned encryption (XChaCha20-Poly1305 + ECDH secp256k1) |

---

## 11. Development Milestones

### M1 — Core crypto (Week 1)
- [ ] WebCrypto AES-256-GCM encrypt/decrypt working in isolation
- [ ] URL fragment encoding/decoding for key + event ID
- [ ] Unit tests for crypto round-trip

### M2 — Nostr integration (Week 1–2)
- [ ] Ephemeral keypair generation
- [ ] Event construction and signing via nostr-tools
- [ ] Publish to 3 relays; confirm receipt
- [ ] Fetch event by ID from relay

### M3 — MVP UI (Week 2)
- [ ] Editor page: paste input, encrypt, publish, copy link
- [ ] Viewer page: fetch event, decrypt, display
- [ ] Relay picker with health indicators
- [ ] TTL selector + burn-on-read toggle

### M4 — Polish & security review (Week 3)
- [ ] NIP-44 recipient mode
- [ ] Optional passphrase (PBKDF2)
- [ ] Syntax highlighting via Shiki
- [ ] CSP headers, dependency audit
- [ ] Deploy to Cloudflare Pages

### M5 — Public beta (Week 4)
- [ ] IPFS deployment mirror
- [ ] Feedback collection (GitHub Issues only — no analytics)
- [ ] Bug fixes and relay list tuning

---

## 12. Open Questions

**Kind number** — `31337` is unregistered. Should we formally propose it in the NIPs repo, or use a kind in the ephemeral range (20000–29999) given pastes are short-lived?

**Relay persistence** — Some public relays enforce storage limits or require proof-of-work. Should NullBin support NIP-13 PoW to improve relay acceptance?

**IPFS mirroring** — Should the encrypted blob also be pinned to IPFS for extra redundancy, with the CID included in the share URL?

**Key derivation UX** — Exposing the raw AES key in the URL is correct but unfamiliar. Is there a cleaner UX abstraction that doesn't sacrifice auditability?

**Relay hint count** — Including multiple relay hints in the URL makes links longer. Should we cap at 2 and use a shortening convention?
