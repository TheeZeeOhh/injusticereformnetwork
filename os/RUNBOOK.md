# IRN OS — full operator runbook

End-to-end: bare Debian host → bootable ISO → installed, encrypted kiosk.
Everything here runs on a **Debian bookworm build host with root + network**.
None of it can run in the Claude sandbox (no root, no Debian-mirror access).

## 0. Build host prep (once)

```bash
sudo apt update
sudo apt install -y live-build git nodejs npm rustc cargo \
     libwebkit2gtk-4.1-dev build-essential curl libssl-dev \
     libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

## 1. Get the repo

```bash
git clone https://github.com/TheeZeeOhh/injusticereformnetwork.git
cd injusticereformnetwork
```

## 2. Build the Sanctuary app → .deb, stage it

```bash
npm ci
npm run tauri build          # → src-tauri/target/release/bundle/deb/*.deb
cp src-tauri/target/release/bundle/deb/*.deb os/config/packages.chroot/sanctuary.deb
```

> If `tauri build`'s AppImage step fails on a hardened host (known linuxdeploy
> issue), the `.deb` still builds — that is all we need.

## 3. (Optional) Add a Nerd Font so bar glyphs render

```bash
mkdir -p os/config/includes.chroot/etc/skel/.local/share/fonts
# drop e.g. JetBrainsMonoNerdFont-Regular.ttf into that dir
```

## 4. Build the ISO

On a Debian host with `live-build`:

```bash
cd os
sudo ./build.sh              # lb config (auto/config) + lb build
# → live-image-amd64.hybrid.iso
```

**Not on Debian?** (e.g. an Arch/Garuda box.) Build inside a Debian container
instead — same result, no separate machine:

```bash
./os/build-in-container.sh   # runs lb build in a debian:bookworm container
# if rootless podman errors on loop/mount: sudo ./os/build-in-container.sh
```

Needs Podman or Docker + internet. Stage the `.deb` (step 2) first either way.

Rebuilding after config changes: `sudo lb clean --purge` first.

## 5. Write to USB and boot

```bash
lsblk                                   # find the stick, e.g. /dev/sdX (NOT a partition)
sudo dd if=live-image-amd64.hybrid.iso of=/dev/sdX bs=4M status=progress oflag=sync
```

The image is `iso-hybrid` with **both** bootloaders (`syslinux` for legacy BIOS,
`grub-efi` for UEFI), so the dd'd stick boots on old and modern machines alike.
**Turn Secure Boot OFF** in firmware — the ISO is unsigned. Pick the USB from the
boot menu (F12/F9/Esc, varies) or set it first in boot order.

Verify the stick is bootable before trusting it:
```bash
file live-image-amd64.hybrid.iso     # should say "DOS/MBR boot sector" (isohybrid)
# after dd, the stick should show an EFI System Partition:
lsblk -f /dev/sdX                     # expect a small vfat 'ESP'/EFI part + the live part
```

## 6. First-boot verification (the real "works" bar)

- [ ] Boots to the Sanctuary kiosk with **no login prompt**
- [ ] Sanctuary is maximized; the status bar shows clock/battery/network
- [ ] **No** key combo or right-click reaches a terminal, launcher, or Exit
- [ ] `swaylock` triggers after idle; unlock needs the password
- [ ] Brave opens as the default browser (if kept)

## 7. Install to disk with encryption

Launch **Calamares** (from the live session) → choose **erase disk + encrypt
(LUKS)** → set the disk passphrase → finish → reboot.

- [ ] Installed system prompts for the LUKS passphrase at boot
- [ ] Reboots back into the encrypted kiosk
- [ ] `ss -tlnp` shows nothing listening on the network (verify from the
      installer shell before sealing, since the kiosk has no terminal)

## Portable encrypted USB ("Sanctuary on a stick")

A full-disk-**encrypted**, bootable Sanctuary you carry and run on any machine —
distinct from the live-amnesiac boot (§5) and from a plain live-persistence
overlay (deliberately **not** offered: it would write PHI to a removable device
unencrypted). This is a normal LUKS install whose *target disk is a second USB*.

You need **two sticks**: the live/installer stick from §5, and the target stick
that becomes the device (≥16 GB, USB 3.x strongly recommended — WebKit + the
model files are slow on USB 2.0).

1. Boot the **live installer stick** (§5). Add `toram` at the boot menu so the
   installer runs from RAM and the live stick can be removed — this also makes it
   unambiguous which stick Calamares is about to erase.
2. Insert the **target stick**. In `lsblk` confirm which `/dev/sdX` it is.
3. Launch **Calamares** → **Manual/erase partitioning** → select the **target
   stick** (NOT the machine's internal disk) → enable **LUKS encryption** and set
   the disk passphrase.
4. Finish, power off, remove both sticks.
5. Boot the target stick on any machine (Secure Boot off; it is unsigned). It
   prompts for the LUKS passphrase, then comes up in the sealed kiosk.

**Safety checks specific to this mode:**

- **Erase-target confirmation.** Installing to the wrong `/dev/sdX` destroys the
  machine's internal disk. Boot with `toram` and, if paranoid, physically remove
  or unplug other drives before running Calamares.
- **No swap on the host.** The kiosk's `irn-noswap.service` disables swap at
  boot, so booting the stick on someone else's machine will not page decrypted
  PHI to that machine's disk. (Kernel `init_on_free=1` also zeroes freed RAM.)
- **Duress wipe destroys the STICK.** On this mode the panic wipe erases *that
  stick's* LUKS keys and powers off — the real irreversible wipe. Because
  Sanctuary/Vault B is unrecoverable by design and the wipe is irreversible,
  keep an **encrypted backup** (Settings → Vault Backup / Sanctuary-to-Go) on a
  *separate* stick, or a duress event / lost passphrase is total data loss.
- **Amnesiac vs installed.** This stick is **persistent** (that's the point), so
  it is NOT amnesiac — data lives in its LUKS container between boots. If you
  want amnesiac instead, use the live boot (§5) with `toram`, which persists
  nothing.
- **Wear + spare.** USB flash wears out and sticks fail. Keep a spare imaged the
  same way and a current encrypted backup; treat the stick as replaceable.

## Troubleshooting

- **Blank screen after autologin** — check `journalctl -b -u greetd`; usually
  seatd not enabled or `XDG_RUNTIME_DIR` unset (see `/usr/local/bin/irn-kiosk`).
- **Sanctuary window blank / WebKit** — try setting
  `WEBKIT_DISABLE_COMPOSITING_MODE=1` in `etc/skel/.config/labwc/environment`.
- **App not found popup** — the `.deb` wasn't staged (step 2), or its binary
  name differs from what `/usr/local/bin/sanctuary` probes.
- **Bar icons are boxes (□)** — no Nerd Font (step 3).
