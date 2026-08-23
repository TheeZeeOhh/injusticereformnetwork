# IRN Browser — hardened Firefox

The IRN OS browser is **Firefox ESR locked down by enterprise policy plus
autoconfig**, not a separate app. `firefox-esr` comes from Debian's own archive,
so the image needs no third-party apt repo and no vendor signing key — one of the
reasons it replaced the earlier Brave build.

Everything that does the hardening ships from
`config/includes.chroot/usr/local/share/irn-browser/` and is placed by
`config/hooks/live/0300-firefox.hook.chroot`:

| File | Installed to | Role |
|---|---|---|
| `policies.json` | `/usr/lib/firefox-esr/distribution/` **and** `/etc/firefox-esr/policies/` | Enterprise policy — applies to every profile, user cannot override |
| `mozilla.cfg` | `/usr/lib/firefox-esr/` | Autoconfig — the prefs the policy schema can't express |
| `local-settings.js` | `/usr/lib/firefox-esr/defaults/pref/` | The two-line loader that makes Firefox read `mozilla.cfg` |
| `userChrome.css` | seeded into the profile by `irn-browser` | Dark-UI polish (optional) |
| `newtab.html` | stays at `/usr/local/share/irn-browser/` | The offline home page (see below) |

Launch with `irn-browser`, not `firefox-esr` directly: the wrapper picks the
right binary name across distros (`firefox-esr` on Debian, `firefox` on Arch),
seeds `userChrome.css` into the profile, and implements ephemeral mode. It is
what `/usr/share/applications/irn-browser.desktop` runs, what `$BROWSER` is set
to (`/etc/profile.d/irn-browser.sh`), and what `mimeapps.list` hands http/https
URLs to.

## What the policy does

| Area | Policy key | Effect |
|---|---|---|
| Telemetry | `DisableTelemetry`, `DisableFirefoxStudies`, `DisableFeedbackCommands` | No usage/metrics phone-home, no Shield studies |
| Accounts | `DisableFirefoxAccounts` | No sign-in, no sync |
| Tracking | `EnableTrackingProtection` (locked) + `Cryptomining`, `Fingerprinting` | Strict blocking, user cannot turn it off |
| Cookies | `reject-tracker-and-partition-foreign` | Third-party trackers rejected, rest partitioned per site |
| Transport | `HttpsOnlyMode: force_enabled` | HTTP is blocked; HTTPS only |
| DNS | `DNSOverHTTPS` → Quad9, `Locked` | Encrypted DNS to a no-log resolver; the OS resolver never sees the names |
| Search leakage | `SearchSuggestEnabled: false`, `FirefoxSuggest` all off | Keystrokes in the URL bar are not sent anywhere |
| Prefetch | `NetworkPrediction: false` | No speculative connections |
| Passwords/forms | `PasswordManagerEnabled`, `OfferToSaveLogins`, `DisableFormHistory` off | No credentials or form text cached in the browser |
| Content junk | `DisablePocket`, `SponsoredTopSites`, `SponsoredPocket`, `Snippets`, `UserMessaging` off | No sponsored tiles, recommendations, or "What's New" |
| Search engine | `SearchEngines.Default: DuckDuckGo` | Private default, no Google |
| Downloads | `PromptForDownloadLocation: true` | Nothing lands on disk silently |
| Permissions | Camera, Microphone, Location, Notifications `BlockNewRequests`; autoplay blocked | Sites cannot even prompt |
| Start page | `Homepage` → `file:///usr/local/share/irn-browser/newtab.html` | Offline command center, no network on open |

And what `mozilla.cfg` adds on top (prefs with no policy equivalent):

- **Global Privacy Control** on, `privacy.fingerprintingProtection` on.
- **No beacons or ping tracking** (`beacon.enabled`, `browser.send_pings` off).
- **No captive-portal / connectivity checks** — Firefox does not call Mozilla on
  every network change.
- **WebRTC local-IP leak protection**: `ice.default_address_only`, `ice.no_host`
  — video calls still work, but a page cannot enumerate your LAN addresses behind
  the VPN.
- **No on-disk HTTP cache** (`browser.cache.disk.enable: false`) and
  `sessionstore.privacy_level: 2` — much less residue on disk.
- Dark UI by default (`browser.theme.*`, compact-dark), with page-level
  `prefers-color-scheme: dark`.

## Deliberate departures from the old Brave posture

The kiosk-era policy was stricter in ways that made a daily driver unusable.
These are choices, not oversights:

- **Add-ons are ENABLED**, and two are force-installed: **uBlock Origin** and
  **Dark Reader** (`ExtensionSettings`). The old policy blocked all extensions.
  Extensions are attack surface; an ad/tracker blocker is worth it, and this was
  an explicit daily-driver requirement. Note that `force_installed` fetches the
  `.xpi` from `addons.mozilla.org` on first run — so on an offline boot, or in
  `--ephemeral` mode with no network, those two simply will not be there.
- **Downloads are allowed** (with a location prompt). The old kiosk blocked them
  outright because it had no file manager and no intended exfil path; this image
  ships Thunar and is meant for real work.
- **History is kept.** The old policy set `SavingBrowserHistoryDisabled`. For a
  session that leaves nothing behind, use ephemeral mode instead — below.
- **Safe Browsing is left at Firefox's default.** It is a cloud lookup, but the
  hash-prefix design does not hand Mozilla or Google the full URL, and phishing
  protection matters for a browser used to fight cases.

## Ephemeral (amnesiac) mode

```bash
irn-browser --ephemeral        # aliases: --amnesiac, --burner
```

Creates a throwaway profile in **RAM** (`$XDG_RUNTIME_DIR`, falling back to
`/dev/shm`), seeds it with `resistFingerprinting`, letterboxing, permanent
private browsing, and clear-on-shutdown for everything, launches Firefox against
it, and deletes it on exit. Because the profile lives in tmpfs it is also gone
after any poweroff — including a duress panic wipe (see `SECURITY-FEATURES.md`).

Use it for anything you do not want on the disk at all. Use the normal profile
for daily work where history and logins are a convenience worth having.

## The home page

`newtab.html` is a **static, fully offline** page — no scripts, no fonts, no
images, no external requests — with curated IRN/legal-research links and a
browser-posture summary. Opening a new tab therefore touches nothing.

On the **Garuda daily driver**, `install-irn-browser.sh` installs a generator
(`irn-newtab`, from `irn-newtab.py`) that rebuilds the page on each launch with
the day's Reading Room passage and a live `sable-posture.sh` panel, and rewrites
the policy paths to `~/.local/share/irn-browser/newtab.html`. **IRN OS ships the
flat file instead**: the image has no `python3`, and neither the Reading Room
library nor the posture script is on it, so those panels would render empty. Edit
`config/includes.chroot/usr/local/share/irn-browser/newtab.html` and rebuild to
change the links.

## Changing the hardening

Edit the files under `config/includes.chroot/usr/local/share/irn-browser/`, then
rebuild the ISO (`sudo lb clean --purge && sudo ./build.sh`, or
`./build-in-container.sh`). On an already-installed system you can instead drop
the same `policies.json` into `/etc/firefox-esr/policies/` and restart the
browser.

Common relaxations:

- **Allow HTTP** (some legacy county court sites are still plain HTTP): remove
  `HttpsOnlyMode` or set it to `enabled` so it can be bypassed per-site.
- **Different DoH resolver**: change `DNSOverHTTPS.ProviderURL`. Setting
  `Enabled: false` falls back to system DNS, which the VPN or ISP can see.
- **Lock to specific sites**: add `"WebsiteFilter": {"Block": ["<all_urls>"],
  "Exceptions": ["*://*.vacourts.gov/*", "..."]}` to turn the open web into an
  allowlist — the closest thing to the old kiosk posture.
- **Drop the browser entirely**: remove `firefox-esr` from
  `config/package-lists/irn.list.chroot` and delete
  `config/hooks/live/0300-firefox.hook.chroot`.

## Verify on the device

```bash
# in the IRN Browser, after boot:
about:policies      # "Active" tab lists every policy that took effect
about:config        # spot-check locked prefs, e.g. privacy.globalprivacycontrol.enabled
about:support       # "Profile Directory" — confirms which profile is live
```

`about:policies` showing the keys above under **Active** is the proof the
hardening took, and `about:policies` → **Errors** is where a typo in
`policies.json` shows up. A locked pref from `mozilla.cfg` appears in
`about:config` with the padlock/"locked" status.

> **Verification status.** The policy/autoconfig wiring is verified by reading
> the hook and the shipped files; it has **not** yet been confirmed in a booted
> image — that is a step in `RUNBOOK.md` §4b/§6. Do not describe it as proven
> until `about:policies` has been read on a real boot.
