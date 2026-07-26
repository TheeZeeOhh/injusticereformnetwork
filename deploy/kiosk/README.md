# Kiosk USB insertion trigger

Launches Sanctuary automatically when the **specific** SANCTUARY security USB is
inserted — even from a cold state (nothing running). This is the OS-level piece:
the app's own in-process trigger only fires while Sanctuary is already open, so a
udev rule is required to launch it on insert.

## Files

- `99-sanctuary-usb.rules` — udev rule, scoped to this exact stick by
  vendor:product **and serial** (`154b:1009`, serial `072153CE9C96CA33`) so a
  different PNY drive (which shares `154b:1009`) will not trigger it.
- `sanctuary-usb-launch.sh` — launcher udev runs on insert. udev runs as root
  with an empty environment and no display, so the script detaches from udev,
  re-execs as the desktop user, rebuilds the graphical session env, de-dups, and
  starts the app.

## Install (on the kiosk box, needs root)

```bash
sudo cp deploy/kiosk/99-sanctuary-usb.rules /etc/udev/rules.d/
sudo cp deploy/kiosk/sanctuary-usb-launch.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/sanctuary-usb-launch.sh
sudo udevadm control --reload-rules && sudo udevadm trigger
```

> Run each `sudo` line as a **single line** — a wrapped `chmod +x <newline> path`
> fails with "missing operand".

## Test

1. Close Sanctuary. Unplug the SANCTUARY stick.
2. Plug it back in → Sanctuary should launch within a second or two.
3. Debug logs (best-effort, per-uid so root/user never collide):
   - `/tmp/sanctuary-usb-launch.0.log`    — root phase (udev → re-exec)
   - `/tmp/sanctuary-usb-launch.1000.log` — user phase (env → launch)
   A healthy run reaches `launching Sanctuary`.

## This machine's environment (verified 2026-07-26)

- User `aziza` (uid 1000), session is **X11** (`DISPLAY=:0`) under labwc.
- The launcher also auto-detects a Wayland socket (`$XDG_RUNTIME_DIR/wayland-*`)
  and prefers it if present, so a pure-Wayland labwc session should also work
  (untested).

## Adapting for a real deployment

- `APP_BIN` in `sanctuary-usb-launch.sh` points at the **dev build**
  (`src-tauri/target/release/app`). If you install the `.deb`/`.rpm` on the box,
  edit `APP_BIN` to the installed binary (e.g. `/usr/bin/sanctuary`).
- `KIOSK_USER` / `KIOSK_UID` are hardcoded to `aziza` / `1000`. Change for a
  different box.
- To find another stick's serial: `udevadm info -q property -n /dev/sdX | grep ID_SERIAL_SHORT`.

## Notes / caveats

- These files are versioned here for documentation and repeatability. The actual
  install lives under `/etc/udev/` and `/usr/local/bin/` on the box — **not in
  git** — so it must be installed per machine.
- The in-app trigger (`usb-token-inserted`, in `src-tauri/src/lib.rs`) complements
  this: udev covers "cold insert → launch"; the app trigger covers "already open
  and locked → replug → prompt".
- Removing the rule: `sudo rm /etc/udev/rules.d/99-sanctuary-usb.rules && sudo udevadm control --reload-rules`.
