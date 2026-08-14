# IRN OS — a hardened Debian spin that boots into Sanctuary

A local-first, client-side-encrypted appliance OS for the Injustice Reform
Network. Built with Debian **live-build** (the same tooling behind Tails and
Kali). The design goal is continuous with Sanctuary's **Technical Incapacity
Defense**: a device that is encrypted at rest, keeps keys in RAM, ships no
telemetry, and boots directly into the Sanctuary app with nothing else exposed.

## What you get

- A bootable **live USB/ISO** (amd64) that autologins (via greetd) into a
  **sealed labwc kiosk**: Sanctuary launched maximized, a status-only waybar
  (clock/audio/network/battery/tray), and **no way out** — no keybinds, no
  launcher, no terminal, no file manager, no Exit, no right-click menu.
- **Brave** installed and set as the default browser (kept by request),
  **hardened by managed policy** — telemetry/sync/extensions off, HTTPS-only,
  encrypted DNS, no history, downloads blocked. See **`BROWSER.md`**.
- **LUKS** full-disk encryption available at install time (via the bundled
  Calamares installer profile).
- **VPN**: WireGuard (free, bring-your-own config) with a leak-proof kill-switch,
  driven by the `irn-vpn` helper; OpenVPN import too. See **`VPN.md`**.
- **Audio EQ**: system-wide EasyEffects equalizer on PipeWire, with a starter
  preset. See **`AUDIO.md`**.
- **Amnesiac mode**: runs from RAM, swap disabled, memory zeroed on free —
  nothing decrypted touches disk (add `toram` to free the USB entirely).
- **Duress panic wipe**: an armable trigger that irreversibly destroys the LUKS
  keys and powers off. Disarmed by default. See **`SECURITY-FEATURES.md`**.
- **Hardened defaults**: telemetry off, ssh/avahi/ModemManager masked, no core
  dumps, minimal base, unprivileged user.

> **Seal boundary — read this.** The kiosk is sealed against the *shell*: the
> labwc config ships an empty `<keyboard>`, no launcher, and no menu, so there is
> no key/mouse path to a terminal or the filesystem. It is **not** sealed against
> *data egress*, because Brave remains installed and default — its address bar
> (`file://`), downloads, and network access are the one open surface. For a
> fully subpoena-hardened device, delete `config/hooks/live/0300-brave.hook.chroot`
> and the `mimeapps.list` / `etc/profile.d/irn-browser.sh` browser defaults, then
> rebuild.
>
> **Vestigial files** (inert; Bash could not delete them under the read-only repo
> mount): the desktop profile's `fuzzel/` config, waybar `dock.jsonc`/`dock.css`,
> and `etc/xdg/labwc/` stubs still exist in the tree but are never loaded (fuzzel
> is uninstalled; the dock is not autostarted). Safe to `git rm` them.

## Build requirements (NOT satisfiable in the Claude sandbox)

You need a **Debian bookworm host** (or a Debian container) with **root** and
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
