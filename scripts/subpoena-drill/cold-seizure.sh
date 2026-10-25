#!/bin/sh
# Subpoena drill, scenario 1: COLD SEIZURE of a workstation running Sanctuary.
#
# Runs the real release binary (native WebKitGTK webview, real keychain code)
# in a sealed world - throwaway HOME, private D-Bus session with its own
# gnome-keyring, headless labwc - plants canary PHI in Vault A and Vault B
# through the UI, then pulls the plug (SIGKILL, no graceful shutdown) and
# examines everything the app left behind for the canaries and passphrases.
#
#   ./scripts/subpoena-drill/cold-seizure.sh [--bin path] [--graceful] [--clean] [--self-test]
#                                            [--upgrade-from old-binary]
#
# --upgrade-from: plant with the OLD binary, confirm its leak is visible (the
# run is invalid if not), then open the same seized home with --bin, log in and
# unlock Vault B (running whatever migration it has), and seize THAT state.
#
# Never touches the operator's real keychain: env -i drops the real session
# bus address, so the app can only reach the private bus started here.
# Evidence is kept under $WORK (printed at the end) unless --clean.
#
# Exit: 0 nothing recovered, 1 PHI/secret recovered, 2 invalid run.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/subpoena-drill"
BIN="$ROOT/src-tauri/target/release/app"
MODE=powercut
CLEAN=no
OLD_BIN=
SELFTEST=no   # --self-test: plant a plaintext canary after the seizure; the scan MUST catch it
while [ $# -gt 0 ]; do
  case "$1" in
    --bin) BIN="$2"; shift 2 ;;
    --graceful) MODE=graceful; shift ;;
    --clean) CLEAN=yes; shift ;;
    --self-test) SELFTEST=yes; shift ;;
    --upgrade-from) OLD_BIN="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

for c in dbus-run-session gnome-keyring-daemon labwc WebKitWebDriver node; do
  command -v "$c" >/dev/null || { echo "need $c" >&2; exit 2; }
done
DRIVER="$(command -v tauri-driver || echo "$HOME/.cargo/bin/tauri-driver")"
[ -x "$DRIVER" ] || { echo "need tauri-driver (cargo install tauri-driver --locked)" >&2; exit 2; }
[ -x "$BIN" ] || { echo "binary not found: $BIN (npx tauri build --no-bundle)" >&2; exit 2; }
[ -z "$OLD_BIN" ] || [ -x "$OLD_BIN" ] || { echo "old binary not found: $OLD_BIN" >&2; exit 2; }

rand() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
TAG="drill$(rand 6)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/subpoena-drill.XXXXXX")"
SEIZED="$WORK/seized-home"
RUNDIR="$(mktemp -d /tmp/sdr.XXXXXX)"   # short: AF_UNIX paths cap at ~108 bytes
mkdir -p "$SEIZED/tmp" "$WORK/labwc"
chmod 700 "$RUNDIR"
PORT=$((20000 + $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 20000))

# Secrets live only in process environments - never written into $WORK.
export DRILL_OPERATOR="op-$TAG"
export DRILL_CANARY_A="ZQXA$(rand 8)"
export DRILL_CANARY_B="ZQXB$(rand 8)"
export DRILL_PASS_A="drill-$(rand 10)-Orchid-Lantern-Ferry"
export DRILL_PASS_B="drillB-$(rand 10)-Quartz-Meadow-Kite"
export DRILL_CLIENT_REF="PT-$(rand 5)"   # pseudonymous, as the HRT form suggests
DRILL_LOGIN_PW="login-$(rand 10)"
SINCE="$(date +%s)"

echo "subpoena drill: cold seizure ($MODE)   $(date -Is)"
[ -n "$OLD_BIN" ] && echo "upgrade from: $OLD_BIN ($(stat -c %y "$OLD_BIN" | cut -d. -f1))"
echo "binary: $BIN ($(stat -c %y "$BIN" | cut -d. -f1))"
echo "work:   $WORK"

INNER="$WORK/inner.sh"
cat > "$INNER" <<'EOF'
set -u
cleanup_tagged() {   # every drill process except this script and its dbus-run-session
  for p in /proc/[0-9]*; do
    case "${p#/proc/}" in "$$"|"$PPID") continue ;; esac
    { tr '\0' '\n' < "$p/environ"; } 2>/dev/null | grep -qx "DRILL_TAG=$DRILL_TAG" && kill "-$1" "${p#/proc/}" 2>/dev/null
  done
}
# A real login keyring is encrypted with the login password; an empty one would
# make gnome-keyring try to pop a GUI prompt and the keychain would never come up.
printf '%s' "$DRILL_LOGIN_PW" | gnome-keyring-daemon --unlock --components=secrets --daemonize >/dev/null 2>&1
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  labwc -C "$DRILL_WORK/labwc" >"$DRILL_WORK/labwc.log" 2>&1 &
i=0; while [ ! -S "$XDG_RUNTIME_DIR/wayland-0" ] && [ $i -lt 50 ]; do sleep 0.2; i=$((i+1)); done
[ -S "$XDG_RUNTIME_DIR/wayland-0" ] || { echo '{"ok":false,"error":"headless labwc did not start"}'; cleanup_tagged 9; exit 1; }
export WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
"$DRILL_DRIVER" --port "$DRILL_PORT" --native-port "$((DRILL_PORT + 1))" --native-driver "$(command -v WebKitWebDriver)" \
  >"$DRILL_WORK/tauri-driver.log" 2>&1 &
sleep 1.5
DRILL_WEBDRIVER="http://127.0.0.1:$DRILL_PORT" node "$DRILL_HERE/drive.mjs"
rc=$?
if [ "$DRILL_MODE" = graceful ]; then
  cleanup_tagged TERM; sleep 4
fi
cleanup_tagged 9   # the power cut: nothing gets to flush or tidy up
sleep 1
exit $rc
EOF

# run_phase <binary> <plant|reopen>: one app session in the sealed world,
# ended by the power cut. Sets DRIVE_OUT / DRIVE_RC.
run_phase() {
  set +e
  DRIVE_OUT="$(env -i PATH="$PATH" HOME="$SEIZED" USER="$(id -un)" LANG=C.UTF-8 \
    XDG_RUNTIME_DIR="$RUNDIR" TMPDIR="$SEIZED/tmp" \
    XDG_CONFIG_HOME="$SEIZED/.config" XDG_DATA_HOME="$SEIZED/.local/share" XDG_CACHE_HOME="$SEIZED/.cache" \
    DRILL_TAG="$TAG" DRILL_WORK="$WORK" DRILL_HERE="$HERE" DRILL_DRIVER="$DRIVER" DRILL_PORT="$PORT" DRILL_MODE="$MODE" \
    DRILL_BIN="$1" DRILL_PHASE="$2" DRILL_OPERATOR="$DRILL_OPERATOR" DRILL_CANARY_A="$DRILL_CANARY_A" DRILL_CANARY_B="$DRILL_CANARY_B" \
    DRILL_PASS_A="$DRILL_PASS_A" DRILL_PASS_B="$DRILL_PASS_B" DRILL_LOGIN_PW="$DRILL_LOGIN_PW" DRILL_CLIENT_REF="$DRILL_CLIENT_REF" \
    dbus-run-session -- sh "$INNER" 2>>"$WORK/inner.err")"
  DRIVE_RC=$?
  set -e
  # Belt and braces: nothing tagged survives the session.
  for p in /proc/[0-9]*; do
    { tr '\0' '\n' < "$p/environ"; } 2>/dev/null | grep -qx "DRILL_TAG=$TAG" && kill -9 "${p#/proc/}" 2>/dev/null
  done
  echo
  echo "$2 ($(basename "$1")): $DRIVE_OUT"
  if [ $DRIVE_RC -ne 0 ]; then
    rm -f "$INNER"
    echo "INVALID: the $2 phase did not demonstrably complete - see $WORK/*.log, $WORK/inner.err"
    exit 2
  fi
}

if [ -n "$OLD_BIN" ]; then
  run_phase "$OLD_BIN" plant
  # The old build must show the leak, or this run proves nothing about the fix.
  echo
  echo "== examining the pre-upgrade state (the leak MUST be visible here)"
  set +e
  DRILL_REPORT="$WORK/report-pre-upgrade.json" node "$HERE/forensics.mjs" "$SEIZED" "$RUNDIR"
  PRE=$?
  set -e
  if [ $PRE -ne 1 ]; then
    rm -f "$INNER"
    echo "INVALID: the old binary's leak was not visible (forensics exit $PRE), so the upgrade is untested"
    exit 2
  fi
  run_phase "$BIN" reopen
else
  run_phase "$BIN" plant
fi
rm -f "$INNER"

# The runtime dir (sockets, keyring control) is RAM-backed on a real box; it is
# examined too, since a warm seizure would see it.
echo
[ "$SELFTEST" = yes ] && printf '%s' "$DRILL_CANARY_A" > "$SEIZED/.local/share/selftest-leak"
echo "== examining seized tree ($MODE)"
set +e
DRILL_SINCE="$SINCE" DRILL_REPORT="$WORK/report.json" node "$HERE/forensics.mjs" "$SEIZED" "$RUNDIR"
RC=$?
set -e
echo
echo "app storage written:"
find "$SEIZED" -type f -printf '  %8s  %P\n' | sort -k2 | head -40
echo
echo "evidence + report.json: $WORK"
rm -rf "$RUNDIR"
[ "$CLEAN" = yes ] && rm -rf "$WORK"
exit $RC
