#!/usr/bin/env bash
# sanctuary-usb-launch.sh
#
# Launched by udev (see 99-sanctuary-usb.rules) when the SANCTUARY security USB
# is inserted. udev runs as root with an EMPTY environment and no display, so
# this script must (a) drop to the desktop user, (b) reconstruct the graphical
# session env, and (c) start Sanctuary only if it is not already running.
#
# This is intentionally defensive: udev-launched GUI apps are fragile, so every
# step logs to /tmp/sanctuary-usb-launch.log for debugging.

set -u
# Per-UID log: udev runs this as root, then it re-execs as the desktop user. A
# single shared /tmp file gets created root-owned on the first (root) run and is
# then UNWRITABLE by the user phase, silently killing the launch. Separate files
# per uid avoid that. Logging is best-effort and must never abort the launch.
LOG="/tmp/sanctuary-usb-launch.$(id -u).log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG" 2>/dev/null || true; }
log "udev trigger fired (uid=$(id -u))"

# --- The desktop user and the app binary. Edit these for the box. ------------
KIOSK_USER="aziza"
KIOSK_UID="1000"
# Deployed install path. This box is Garuda (Arch): no dpkg/rpm, so the built
# binary is installed manually to /usr/local/bin/sanctuary (see README, "Install
# on Arch/Garuda"). The .deb/.rpm targets are for Debian/Fedora hosts only.
APP_BIN="/usr/local/bin/sanctuary"
# For running the dev build directly (no install), use instead:
# APP_BIN="/home/aziza/injusticereformnetwork/src-tauri/target/release/app"

# --- If we are root (udev), re-exec as the kiosk user with a login shell so the
#     user session/dbus is reachable. --------------------------------------------
# Absolute path to THIS script once installed (do not rely on $0 across runuser).
SELF="/usr/local/bin/sanctuary-usb-launch.sh"

if [ "$(id -u)" = "0" ]; then
  log "re-exec as $KIOSK_USER (detaching from udev)"
  # udev SIGKILLs its RUN process tree after a short timeout, which would also
  # kill the app. Detach completely: launch the user-side of this script under
  # the user's systemd manager if available (best), else setsid so it survives.
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --uid="$KIOSK_UID" --setenv=SANCTUARY_USB_USERPHASE=1 \
      --collect --quiet "$SELF" >> "$LOG" 2>&1 \
      || setsid runuser -u "$KIOSK_USER" -- "$SELF" >> "$LOG" 2>&1 &
  else
    setsid runuser -u "$KIOSK_USER" -- "$SELF" >> "$LOG" 2>&1 &
  fi
  exit 0
fi

# --- Running as the kiosk user now. Rebuild the graphical env. ----------------
export XDG_RUNTIME_DIR="/run/user/${KIOSK_UID}"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"

# Auto-detect Wayland (labwc) vs X11. Prefer Wayland if a socket exists.
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  for sock in "${XDG_RUNTIME_DIR}"/wayland-*; do
    if [ -S "$sock" ]; then
      export WAYLAND_DISPLAY="$(basename "$sock")"
      break
    fi
  done
fi
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ]; then
  export DISPLAY=":0"
fi
log "env: WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-} DISPLAY=${DISPLAY:-}"

# --- De-dup: if Sanctuary is already running, do nothing (the app's own USB
#     insertion trigger will handle the "already open" case). ------------------
if pgrep -f "$APP_BIN" >/dev/null 2>&1; then
  log "already running — not launching a second instance"
  exit 0
fi

if [ ! -x "$APP_BIN" ]; then
  log "ERROR: app binary not found/executable: $APP_BIN"
  exit 1
fi

log "launching Sanctuary"
# Detach so udev's worker doesn't block on the app's lifetime.
setsid "$APP_BIN" >> "$LOG" 2>&1 &
exit 0
