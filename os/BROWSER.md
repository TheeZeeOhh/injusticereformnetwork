# IRN Browser — hardened Brave

The IRN OS browser is **Brave locked down by managed policy**, not a separate
app. The policy ships at `/etc/brave/policies/managed/irn-hardening.json` (from
`config/includes.chroot/…`), applies to every profile, and cannot be overridden
by the user. Unknown keys are ignored by Brave, so the file is safe to trim.

## What it does

| Area | Policy | Effect |
|---|---|---|
| Telemetry | `MetricsReportingEnabled`, `UrlKeyedAnonymizedDataCollectionEnabled` off | No usage/metrics phone-home |
| Safe Browsing | `SafeBrowsingProtectionLevel: 0` | **No cloud URL lookups** (see tradeoff below) |
| Search leakage | `SearchSuggestEnabled` off; `TranslateEnabled` off; `SpellCheckServiceEnabled` off | Keystrokes/text never sent to a service |
| Prefetch | `NetworkPredictionOptions: 2` | No speculative connections |
| Autofill/passwords | `AutofillAddress/CreditCard`, `PasswordManagerEnabled` off | No credentials/PII cached in the browser |
| Transport | `HttpsOnlyMode: force_enabled` | HTTP is blocked; HTTPS only |
| DNS | `DnsOverHttpsMode: secure` → Quad9 | Encrypted DNS, no-log resolver |
| Persistence | `SavingBrowserHistoryDisabled`; `DownloadRestrictions: 3` | No history; **all downloads blocked** |
| Accounts | `SyncDisabled`, `BrowserSignin: 0`, guest/background off | No sign-in, no sync, no background run |
| Extensions | `ExtensionInstallBlocklist: ["*"]`, `BlockExternalExtensions` | No extensions installable (attack surface) |
| Search engine | DuckDuckGo default | Private default, no Google |
| Startup | blank home/new-tab, `RestoreOnStartup: 5` | No promo/onboarding pages |
| Brave surfaces | Rewards, Wallet, VPN, AI Chat, **Tor** disabled | Crypto/ad/VPN/AI off; no Tor egress |

## Tradeoffs & how to relax

Edit the JSON, then rebuild the ISO (`lb clean --purge && ./build.sh`), or drop
the same file into `/etc/brave/policies/managed/` on a running install and
restart Brave.

- **Safe Browsing is off** (`0`) for the no-cloud posture — that removes Google's
  phishing/malware warnings. If you want protection over privacy, set `1`
  (standard) or `2` (enhanced); both send URL hashes to Google.
- **All downloads blocked** (`DownloadRestrictions: 3`) suits the sealed kiosk
  (no file manager, no exfil path). Set `0` to allow downloads.
- **No extensions.** To allow a specific one, drop the `["*"]` blocklist or add
  its ID to an `ExtensionInstallAllowlist`.
- **Tor disabled.** Tor windows are network egress; flip `TorDisabled` to `false`
  if you want them.
- **Lock to specific sites**: add `"URLAllowlist": ["example.org", "…"]` (and
  optionally `"URLBlocklist": ["*"]`) to turn the open web into an allowlist-only
  browser — useful if the appliance should only reach known resources.

## Verify on the device

```bash
# after boot, in Brave:
brave://policy      # shows every applied policy + its source (should read "Platform")
brave://version     # confirm the profile path
```

`brave://policy` listing your keys with source **Platform / Machine** is the
proof the hardening took. Until then this is unverified (the ISO has not been
built or booted).
