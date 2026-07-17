# Self-Hosted Jitsi Hardening Checklist (Telehealth)

**Status:** Operator/deployment guide. This is server-side configuration, **not**
app code. The Sanctuary app only guarantees it *connects exclusively to the
domain you configure* (see `src/pages/Telehealth.jsx`, `src/store/settingsStore.js`).
Everything that makes that connection actually private — encryption, no
telemetry, no IP leakage, access control — lives on the Jitsi server and is the
operator's responsibility.

**Companion to:** `README.md` (Telehealth / BAA row), `SECURITY-AUDIT.md`.

**Why this doc exists:** The app used to load the public `meet.jit.si` while
claiming "E2EE / Zero-Telemetry / BAA Enforced." That was fixed — the app now
refuses to run without a configured self-hosted domain. But a self-hosted server
that is *misconfigured* can leak just as badly. This checklist closes that gap so
the server matches the promise the app's UI implies.

**Threat model reminder:** clients are endangered by their data — and their
*presence* — being observable. For telehealth that means two distinct risks:
(1) call **content** exposure, and (2) **metadata** exposure (who called, from
what IP/location, when). WebRTC leaks IP by design unless you force relay-only.
Both must be closed.

---

## 0. Prerequisites

- [ ] A dedicated server/VM you control (not a shared PaaS that can inspect traffic).
- [ ] A domain you control with a valid TLS certificate (Let's Encrypt is fine).
- [ ] A signed **BAA** with any infra provider that can touch the traffic (hosting,
      TURN relay). If a provider can see the media and won't sign a BAA, it is not
      Part 2 / HIPAA usable — full stop.
- [ ] Install from the official Jitsi Debian repo or the docker-jitsi-meet stack,
      pinned to a known-good release, not a random image.

---

## 1. Transport & certificates

- [ ] HTTPS enforced; HTTP redirects to HTTPS. No plaintext signaling.
- [ ] TLS 1.2+ only; disable legacy ciphers.
- [ ] HSTS enabled.
- [ ] Certificate auto-renews (monitor expiry — an expired cert silently breaks calls).

---

## 2. End-to-end encryption (call content)

Jitsi is transport-encrypted (DTLS-SRTP) by default, but the **media server
(JVB) can still see decrypted media** unless you enable E2EE (insertable
streams). Transport encryption alone means "your server operator can watch the
call" — not acceptable for Part 2.

- [ ] Enable **E2EE** (insertable streams / end-to-end) so the JVB relays
      ciphertext it cannot read.
- [ ] Confirm the participant browser/webview supports insertable streams
      (Chromium-based — the app's WebKitGTK webview support must be verified on a
      **real desktop build**; do not assume).
- [ ] Document the E2EE key-exchange/passphrase flow for operators; a call is only
      E2EE if every participant enables it.

> ⚠ If E2EE cannot be confirmed working in the actual kiosk webview, say so in the
> UI. Do not let the interface imply E2EE that the runtime doesn't deliver — that
> repeats the exact mistake this doc exists to fix.

---

## 3. Metadata & IP-leak control (the WebRTC trap)

This is the risk most people miss. To connect peers, WebRTC gathers ICE
candidates that expose **each participant's real (and local) IP addresses** to
the other party and to any STUN server. For an endangered client, that is a
location disclosure.

- [ ] Deploy your **own TURN server** (coturn). Do not use public STUN/TURN.
- [ ] Force **relay-only** (`iceTransportPolicy: 'relay'`) so no host/srflx
      candidates are exchanged — participants see only the TURN relay's IP, never
      each other's.
- [ ] TURN over TLS (`turns:`) on 443 so it survives restrictive networks and
      isn't distinguishable as media traffic.
- [ ] TURN credentials are short-lived (time-limited HMAC), not a static shared secret.
- [ ] Confirm with a WebRTC leak test (e.g. inspect `chrome://webrtc-internals`)
      that only the relay candidate appears — **no host/public IP of the peer**.

---

## 4. Disable telemetry & third-party calls

Default Jitsi Meet phones home and loads third-party assets. All of it must go.

- [ ] Disable analytics: `analytics.disabled: true`; remove Google Analytics /
      Amplitude / Matomo IDs.
- [ ] Disable `callstats.io` integration.
- [ ] Remove third-party asset/CDN references (fonts, deep-linking to mobile
      stores, "watermark"/branding links).
- [ ] Disable deep-linking / mobile-app redirects (`disableDeepLinking: true`).
- [ ] No feedback/rating prompts that POST off-server.
- [ ] Self-host any remaining external resources.
- [ ] Verify with the browser network tab: during a call, **zero requests leave
      your domain** (except the TURN relay you control).

---

## 5. Access control (no open rooms)

By default, anyone who guesses a room name can join. Room names in this app are
operator-set and predictable — so authentication is mandatory.

- [ ] Enable **JWT authentication** (or `secure domain` / Prosop auth) so a room
      cannot be joined without a token your system issues.
- [ ] Disable anonymous room creation.
- [ ] Enable **lobby / knock** so the clinician admits participants explicitly.
- [ ] Set/verify a moderator flow; unknown joiners cannot auto-admit.
- [ ] Rotate room names per session (don't reuse `Sanctuary-Intake-492`).

---

## 6. Logging & retention (server side)

The app's local audit log records that a telehealth session happened; the
*server* must not become the leak the app avoided.

- [ ] Minimize JVB/Prosody logging; do not log participant IPs or room contents.
- [ ] No call recording unless explicitly consented and encrypted at rest — off by default.
- [ ] Short log retention; logs are metadata a subpoena can reach.
- [ ] Confirm the hosting provider does not retain traffic logs that re-expose IPs.

---

## 7. Verification (do this on real hardware, not assumptions)

- [ ] From the actual kiosk build: start a call, confirm it connects **only** to
      your domain + your TURN relay (network tab).
- [ ] `webrtc-internals`: confirm relay-only candidates, no peer host/public IP.
- [ ] Confirm E2EE indicator is active in the real webview.
- [ ] Confirm an unauthenticated join attempt is **rejected**.
- [ ] Confirm no analytics/telemetry requests fire.
- [ ] Record the result in `VERIFICATION.md` with date + build, like the other
      hardware-verified items.

---

## What the app does vs. what this server config must do

| Guarantee | Enforced by |
| --- | --- |
| Connects only to the configured domain; no public fallback | **App** (shipped) |
| Call content unreadable by the media server | Server — §2 E2EE |
| Peer IP/location not disclosed | Server — §3 relay-only TURN |
| No telemetry / third-party calls | Server — §4 |
| Only authorized participants join | Server — §5 auth + lobby |
| Session metadata not retained server-side | Server — §6 |

The app closes exactly one item on that list. **The other five are only true if
this checklist is followed.** Until they are verified on the real deployment,
telehealth should be treated as not-yet-Part-2-ready, and the UI should not imply
otherwise.
