# IRN OS — a hardened, privacy-first Debian desktop

A local-first, encrypted **daily-driver desktop** for the Injustice Reform
Network, built with Debian **live-build** (the tooling behind Tails and Kali).
It's a usable labwc desktop — launcher, terminal, apps, Sanctuary front and
center — with the privacy junk stripped out and encryption/VPN/duress tools
built in. Think "a quiet, no-telemetry Debian that boots into your work," not a
locked box.

> **What this is NOT.** A *hardened desktop*, not a sealed appliance. It has a
> shell, a file manager, and a browser — so it does **not** provide any
> "technically incapable of producing PHI" guarantee: someone at the unlocked
> desktop can reach the filesystem. The subpoena-resistance story lives in the
> **Sanctuary app** (client-side encryption, Vault A/B, keys in RAM); the OS just
> makes that app pleasant and private to run. Want the sealed-kiosk posture
> instead? See "Re-lock as a kiosk" below.

## What you get

- A bootable **live USB/ISO** (amd64) that autologins (via greetd) into a
  **labwc desktop**: Sanctuary maximized on start, waybar top bar + dock, fuzzel
  launcher, workspaces, terminal, file manager.
- **IRN Browser** — Debian's `firefox-esr` hardened by enterprise policy +
  autoconfig: telemetry/sync off, strict tracking + fingerprinting protection,
  HTTPS-only, encrypted DNS (DoH → Quad9), uBlock Origin and Dark Reader
  force-installed, an offline command-center home page, and an `--ephemeral`
  RAM-profile mode that leaves nothing on disk. See **`BROWSER.md`**.
- **LUKS** full-disk encryption at install time (Calamares).
- **VPN**: WireGuard (free, bring-your-own config) with a leak-proof kill-switch;
  OpenVPN import too. See **`VPN.md`**.
- **Audio EQ**: system-wide EasyEffects on PipeWire with a starter preset. See
  **`AUDIO.md`**.
- **Sanctuary Terminal** — the PyQt5 branded terminal from its own repo, staged
  into `/opt` by `stage-extras.sh`.
- **Zee Zee (AI twin) with a local brain** — the widget plus an **Ollama** runtime
  and the `ai-twin-custom` model baked into the image, bound to `127.0.0.1`. No
  prompt leaves the device. This is what takes the ISO from ~1.9 GB to ~4.5 GB.
  **Read the risk note in `SECURITY-FEATURES.md` first: Zee Zee executes shell
  commands and its sandbox does not work.**
- **IRN Store** — a curated app catalog (`irn-store`): LibreOffice, GIMP, KeePassXC,
  OnionShare, mat2, Kdenlive and friends, installed from **Debian's own archive**.
  No Flathub, no third-party apt sources, no telemetry. See "The IRN Store" below.
- **Duress panic wipe** (disarmed by default) + optional **amnesiac** live boot.
  See **`SECURITY-FEATURES.md`**.
- **Hardened defaults**: no telemetry, ssh/avahi/ModemManager masked, no core
  dumps, swap off (keys stay in RAM), minimal base, unprivileged user.

> **Re-lock as a kiosk (optional).** To turn this back into a sealed, single-app
> appliance (no shell/launcher/Exit), empty the `<keyboard>` in
> `etc/skel/.config/labwc/rc.xml`, trim `menu.xml`, drop the dock launcher +
> `fuzzel`/`foot`/`thunar` from the package list, and remove `firefox-esr`
> (plus `config/hooks/live/0300-firefox.hook.chroot`). That trades livability for
> the "technically incapable" guarantee.

## The IRN Store

`irn-store` is a small PyQt5 app (no new dependency — Sanctuary Terminal and Zee
Zee already pull PyQt5 in) showing a hand-picked catalog rather than the whole
60,000-package archive. Everything it installs comes from Debian.

**How it stays safe.** The UI runs as the desktop user and never holds root.
Installing goes through `pkexec` to `/usr/local/libexec/irn-store-install`, which:

1. rejects anything that is not a valid Debian package name (so no shell
   metacharacters, no path traversal), and
2. rejects any package **not listed in `catalog.json`**.

The catalog is therefore the security boundary: even a compromised UI, or someone
who passes the polkit prompt, can only install software from the curated list.
The build hook (`0700-irn-store.hook.chroot`) parses the catalog and checks every
package name against the archive, so a typo fails the build log, not the user.

**To change what it offers**, edit
`config/includes.chroot/usr/local/share/irn-store/catalog.json` and rebuild.
Entries marked `"builtin": true` (Sanctuary, the Terminal, Zee Zee, the browser)
are shown for completeness and never offer an apt install — they are not in the
Debian archive, so that button could only ever fail.

## Build requirements (NOT satisfiable in the Claude sandbox)

You need a **Debian trixie host** (or a Debian container) with **root** and
**network access to `deb.debian.org`**. This cannot be built inside the Claude
Code sandbox — its network allowlist and lack of root prevent `debootstrap`.

```bash
sudo apt update
sudo apt install -y live-build
```

## Provide the Sanctuary app

The ISO installs Sanctuary from a `.deb` you build from this repo's Tauri app:

```bash
# from the repo root, on the build host
npm ci && npm run tauri build         # produces src-tauri/target/release/bundle/deb/*.deb
cp src-tauri/target/release/bundle/deb/Sanctuary_*_amd64.deb os/config/packages.chroot/
```

> **Do not rename the `.deb`.** live-build only picks up local packages matching
> `config/packages.chroot/*_amd64.deb` or `*_all.deb`. A file renamed to
> `sanctuary.deb` is skipped **silently** — the build succeeds and you get an ISO
> whose desktop has no app on it. `build-in-container.sh` now hard-fails on a
> misnamed `.deb` rather than letting that through.


`live-build` installs anything dropped in `config/packages.chroot/` into the
live filesystem, so the kiosk launcher can start it offline.

## Build the ISO

```bash
cd os
sudo ./build.sh          # runs `lb config` (via auto/config) then `lb build`
# → live-image-amd64.hybrid.iso
```

Write it to a USB stick with `dd` (or Ventoy) and boot.

## Fonts

The waybar bars use **Nerd Font** glyphs (audio/battery/network icons). Debian's
`fonts-jetbrains-mono` is *not* the Nerd-patched build, so those glyphs may show
as tofu (□). To fix, drop a Nerd Font (e.g. JetBrainsMono Nerd Font) into
`config/includes.chroot/etc/skel/.local/share/fonts/` before building.

## Layout

- `auto/config` — pins the `lb config` invocation (reproducible; do not run bare `lb config`).
- `config/package-lists/irn.list.chroot` — packages baked into the image.
- `config/packages.chroot/` — drop the Sanctuary `.deb` here (git-ignored).
- `config/includes.chroot/` — files overlaid onto the live filesystem verbatim.
- `config/hooks/live/` — scripts run inside the chroot at build time (hardening).
- `build.sh` — preflight checks + `lb build` wrapper.

## Status

**Builds and boots in a VM; not yet verified on real hardware.** (2026-08-23)

Confirmed:

- `live-build` produces `live-image-amd64.hybrid.iso` (~4.2 GB) with the
  Sanctuary `.deb`, the IRN Store, Zee Zee, Sanctuary Terminal and the Ollama
  runtime + models baked in.
- The ISO boots to the labwc desktop on **both** firmware paths — legacy BIOS
  (syslinux) and UEFI (grub-efi) — with no login prompt and no text console
  flashing past. greetd autologin works; the "could not authenticate" failure is
  fixed. Evidence: `./boot-test.sh` and `./boot-test.sh --uefi`, screenshots in
  `boot-test-out/`.
- waybar comes up (clock, battery, network) and Sanctuary opens and renders its
  operator-onboarding screen. Session stayed up for the full 5-minute run.

Not yet verified — do not claim these:

- Any boot on **real hardware**. Everything above is qemu/KVM only.
- The rest of the first-boot checklist in `RUNBOOK.md` §6: IRN Browser, fuzzel,
  foot, right-click menu, `swaylock`, `ss -tlnp` showing nothing listening, and
  the Calamares **Install Debian** path.
- The encrypted install (`RUNBOOK.md` §7) and the portable-USB flow.
