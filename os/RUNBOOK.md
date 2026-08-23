# IRN OS — full operator runbook

End-to-end: bare Debian host → bootable ISO → installed, encrypted kiosk.
Everything here runs on a **Debian trixie build host with root + network**.
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
cp src-tauri/target/release/bundle/deb/Sanctuary_*_amd64.deb os/config/packages.chroot/
```

> **Do not rename the `.deb`.** live-build only picks up local packages matching
> `config/packages.chroot/*_amd64.deb` or `*_all.deb`. A file renamed to
> `sanctuary.deb` is skipped **silently** — the build succeeds and you get an ISO
> whose desktop has no app on it. `build-in-container.sh` now hard-fails on a
> misnamed `.deb` rather than letting that through.


> If `tauri build`'s AppImage step fails on a hardened host (known linuxdeploy
> issue), the `.deb` still builds — that is all we need.

## 3. (Optional) Add a Nerd Font so bar glyphs render

```bash
mkdir -p os/config/includes.chroot/etc/skel/.local/share/fonts
# drop e.g. JetBrainsMonoNerdFont-Regular.ttf into that dir
```

## 3b. Stage the companion apps (Terminal, Zee Zee, Ollama)

Sanctuary Terminal and Zee Zee live in their own repos, and the Ollama model
store is 2.2 GB — none of that is vendored into this repo, so it gets copied in
before the build:

```bash
./os/stage-extras.sh                 # terminal + zee zee + ollama runtime + models
SKIP_OLLAMA=1 ./os/stage-extras.sh   # leave out the brain (ISO stays ~2 GB)
```

The Ollama **model store** must exist at `os/staging/ollama-models` first. Build
it without needing root over `/usr/share/ollama` (mode 700, owned by the service
user) by running a second ollama on another port against your own store:

```bash
mkdir -p os/staging/ollama-models
OLLAMA_MODELS=$PWD/os/staging/ollama-models OLLAMA_HOST=127.0.0.1:11435 ollama serve &
OLLAMA_HOST=127.0.0.1:11435 ollama pull llama3.2:latest
OLLAMA_HOST=127.0.0.1:11435 ollama pull nomic-embed-text:latest
cd /path/to/ai-twin && OLLAMA_HOST=127.0.0.1:11435 ollama create ai-twin-custom -f Modelfile.ai-twin
```

`ai-twin-custom` is just `llama3.2` plus the Modelfile, so a rebuild produces the
same model ID as the one on your workstation — check it matches.

GPU backends are omitted on purpose: CUDA (2 GB) and ROCm (2.6 GB) would nearly
double the image for hardware most machines booting a USB stick do not have. CPU
plus Vulkan (98 MB) covers AMD/Intel via mesa.

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
./os/build-in-container.sh   # runs lb build in a debian:trixie container
# if rootless podman errors on loop/mount: sudo ./os/build-in-container.sh
```

Needs Podman or Docker + internet. Stage the `.deb` (step 2) first either way.

Rebuilding after config changes: `sudo lb clean --purge` first.

## 4b. Boot-test the ISO in a VM before you burn it

Burning to USB and walking to a laptop is a slow way to discover the image does
not boot. `boot-test.sh` boots the ISO headless in qemu and screendumps the
framebuffer on a timer, so the evidence is a set of PNGs you can look at:

```bash
./os/boot-test.sh                       # legacy BIOS (syslinux) path
./os/boot-test.sh --uefi                # UEFI (grub-efi) path — needs OVMF
./os/boot-test.sh --shots "20 60 120 200" --out /tmp/bt
# → boot-test-out/shot-<n>s.png, serial.log, qemu.log
```

Needs `qemu-system-x86_64` + `socat`, and `magick`/`convert`/`pnmtopng` to turn
the dumps into PNGs. It uses KVM when `/dev/kvm` is readable and falls back to
software emulation (much slower — stretch `--shots`).

Reading the last screenshot:

| What you see | What it means |
| --- | --- |
| waybar top bar + Sanctuary window | the session works |
| `irn-os login: irn (automatic login)` / `Authentication failure` | the live user was never created — check that `user-setup` is still in `config/package-lists/live.list.chroot` |
| a text console overwriting the desktop | something else grabbed vt1; greetd should own it (`systemctl mask getty@tty1.service` in the harden hook) |
| black screen with a cursor | the session never started. Run `./boot-test.sh --debug` and read `serial.log` — this is where `greetd: no default_session specified` (greetd exits 1 and systemd gives up after 5 restarts) and compositor failures actually show up |

Test **both** firmware paths before shipping a stick: the two bootloaders are
independent and one can break while the other works.

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

This is a hardened **desktop**, not the old sealed kiosk — a shell and launcher
are supposed to be reachable. What must hold:

- [ ] Boots straight to the labwc desktop with **no login prompt** and no text
      console flashing over it
- [ ] Sanctuary opens maximized; waybar shows clock/battery/network
- [ ] Right-click menu and `fuzzel` launcher work; `foot` opens a terminal
- [ ] IRN Browser (hardened Firefox) opens and is the default browser
- [ ] `swaylock` locks the session (live session password is `live` — see below)
- [ ] `ss -tlnp` shows nothing listening on the network
- [ ] The **Install Debian** entry in the launcher starts Calamares (it needs
      `sudo` + `pkexec`; if it does nothing, `sudo` fell out of the package list)

> **The live session is not a security boundary.** live-config creates the `irn`
> user at boot with the well-known Debian Live password `live` and passwordless
> `sudo`. That is normal for live media and is what makes the installer runnable
> — but it means anyone at a booted live stick is root. The real boundaries are
> LUKS on the installed system and the Sanctuary vaults. Calamares creates the
> operator's own account, so nothing about the live user is carried onto disk.

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

### Black screen, no desktop, nothing on the console

Boot it with `./boot-test.sh --debug` and read `boot-test-out/serial.log`. Known
signatures:

| serial.log says | cause |
| --- | --- |
| `greetd: no default_session specified` | `[default_session]` missing from greetd's config — it is **required** even for a pure-autologin setup. greetd exits 1, systemd restarts it 5×, then stops trying. |
| `Authentication failure` after `irn (automatic login)` | the `irn` user does not exist: `user-setup` missing from `config/package-lists/live.list.chroot` |
| session starts then exits immediately | look at `/usr/local/bin/irn-kiosk`; labwc needs a DRM device and a seat (`seatd` + `libpam-systemd`) |

Because greetd is masked off tty1's getty, a failing session leaves **no console
text at all** on vt1 — the screen just stays black. Ctrl+Alt+F2 still gets a
login on a real machine.

### Other


- **Blank screen after autologin** — check `journalctl -b -u greetd`; usually
  seatd not enabled or `XDG_RUNTIME_DIR` unset (see `/usr/local/bin/irn-kiosk`).
- **Sanctuary window blank / WebKit** — try setting
  `WEBKIT_DISABLE_COMPOSITING_MODE=1` in `etc/skel/.config/labwc/environment`.
- **App not found popup** — the `.deb` wasn't staged (step 2), or its binary
  name differs from what `/usr/local/bin/sanctuary` probes.
- **Bar icons are boxes (□)** — no Nerd Font (step 3).
