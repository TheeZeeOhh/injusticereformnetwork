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
- **Brave** as default browser, **hardened by managed policy** —
  telemetry/sync/extensions off, HTTPS-only, encrypted DNS, no history. See
  **`BROWSER.md`**.
- **LUKS** full-disk encryption at install time (Calamares).
- **VPN**: WireGuard (free, bring-your-own config) with a leak-proof kill-switch;
  OpenVPN import too. See **`VPN.md`**.
- **Audio EQ**: system-wide EasyEffects on PipeWire with a starter preset. See
  **`AUDIO.md`**.
- **Duress panic wipe** (disarmed by default) + optional **amnesiac** live boot.
  See **`SECURITY-FEATURES.md`**.
- **Hardened defaults**: no telemetry, ssh/avahi/ModemManager masked, no core
  dumps, swap off (keys stay in RAM), minimal base, unprivileged user.

> **Re-lock as a kiosk (optional).** To turn this back into a sealed, single-app
> appliance (no shell/launcher/Exit), empty the `<keyboard>` in
> `etc/skel/.config/labwc/rc.xml`, trim `menu.xml`, drop the dock launcher +
> `fuzzel`/`foot`/`thunar` from the package list, and remove Brave. That trades
> livability for the "technically incapable" guarantee.

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
cp src-tauri/target/release/bundle/deb/*.deb os/config/packages.chroot/sanctuary.deb
```

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

**Scaffold only — never built or booted yet.** The config is written but has not
been run through `live-build` on a real host, so treat every file here as a
first draft to iterate on, not a verified image. First real milestone: a booting
live ISO that reaches the Sanctuary kiosk. See the checklist at the bottom of
`build.sh`.
