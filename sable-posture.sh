#!/usr/bin/env bash
# Sanctuary security posture — a glanceable read of the wards.
#
# Read-only, no PHI, no secrets on screen: it reports STATE, never contents.
# Each line is ok / warn / alert / unknown. `unknown` is honest — some checks
# need root we don't have; we degrade rather than lie.
#
#   ./sable-posture.sh           pretty text
#   ./sable-posture.sh --json    {"worst","items":[{label,value,state}]} for a widget
set -uo pipefail

JSON=0; [ "${1:-}" = "--json" ] && JSON=1
declare -a L V S   # label, value, state
add() { L+=("$1"); V+=("$2"); S+=("$3"); }

# 1) Non-loopback listeners — anything bound off 127.0.0.1/::1 can talk to the
#    network. The server/ backend is supposed to be localhost-only.
if command -v ss >/dev/null 2>&1; then
  nonlocal=$(ss -H -tln 2>/dev/null | awk '{print $4}' \
    | grep -vE '^(127\.|\[::1\]|::1|\[::ffff:127\.)' | grep -vE '^(127\.0\.0\.1|\[?::1\]?):' \
    | grep -vE '^127\.0\.0\.1:' | sort -u)
  # keep only entries that are NOT loopback
  nonlocal=$(printf '%s\n' "$nonlocal" | grep -vE '(^$|^127\.0\.0\.1:|^\[::1\]:|^::1:)' || true)
  cnt=$(printf '%s\n' "$nonlocal" | grep -c . || true)
  if [ "$cnt" -eq 0 ]; then add "network" "localhost only" "ok"
  else add "network" "$cnt off-loopback: $(printf '%s ' $nonlocal | cut -c1-60)" "warn"; fi
else add "network" "ss missing" "unknown"; fi

# 2) Disk encryption — is a LUKS/crypt mapping active? (lsblk needs no root.)
if command -v lsblk >/dev/null 2>&1; then
  if lsblk -o TYPE 2>/dev/null | grep -q crypt; then add "LUKS" "crypt volume active" "ok"
  else add "LUKS" "no crypt mapping seen" "warn"; fi
else add "LUKS" "lsblk missing" "unknown"; fi

# 3) Firewall — any of the usual services active?
fw="none"
for u in nftables firewalld ufw; do
  if systemctl is-active --quiet "$u" 2>/dev/null; then fw="$u"; break; fi
done
if [ "$fw" != "none" ]; then add "firewall" "$fw active" "ok"; else add "firewall" "none active" "warn"; fi

# 4) Screen lock — Cinnamon screensaver lock on?
if command -v gsettings >/dev/null 2>&1; then
  le=$(gsettings get org.cinnamon.desktop.screensaver lock-enabled 2>/dev/null || echo "")
  case "$le" in true) add "screen lock" "enabled" "ok";; false) add "screen lock" "OFF" "warn";; *) add "screen lock" "unknown" "unknown";; esac
else add "screen lock" "gsettings missing" "unknown"; fi

# 5) Duress/panic chain — a live /run/irn/panic means it FIRED. Otherwise report
#    whether the trigger is installed (armed) vs absent. (State only, never args.)
if [ -e /run/irn/panic ]; then add "panic chain" "TRIGGERED" "alert"
elif [ -x /usr/local/bin/trigger_duress_wipe ] || systemctl list-unit-files 2>/dev/null | grep -qi 'irn.*duress\|duress'; then
  add "panic chain" "armed" "ok"
else add "panic chain" "not installed" "unknown"; fi

# 6) Sanctuary app — running? (presence proxy; we can't see vault lock state,
#    keys live in RAM by design, so we don't claim to.)
if pgrep -fa 'sanctuary|src-tauri|irn-browser' >/dev/null 2>&1; then add "sanctuary app" "running" "ok"
else add "sanctuary app" "not running" "unknown"; fi

# Worst state overall (alert > warn > unknown > ok) drives the widget color.
worst="ok"
for s in "${S[@]}"; do
  case "$s" in
    alert) worst="alert"; break;;
    warn) [ "$worst" = "ok" ] || [ "$worst" = "unknown" ] && worst="warn";;
    unknown) [ "$worst" = "ok" ] && worst="unknown";;
  esac
done

if [ "$JSON" -eq 1 ]; then
  out='{"worst":"'"$worst"'","items":['
  for i in "${!L[@]}"; do
    esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
    out+='{"label":"'"$(esc "${L[$i]}")"'","value":"'"$(esc "${V[$i]}")"'","state":"'"${S[$i]}"'"}'
    [ "$i" -lt $(( ${#L[@]} - 1 )) ] && out+=','
  done
  out+=']}'
  printf '%s\n' "$out"
else
  icon() { case "$1" in ok) echo "✓";; warn) echo "!";; alert) echo "⚠";; *) echo "·";; esac; }
  echo "Sanctuary posture — $worst"
  for i in "${!L[@]}"; do printf '  %s %-14s %s\n' "$(icon "${S[$i]}")" "${L[$i]}" "${V[$i]}"; done
fi
