#!/usr/bin/env bash
# Put Sable on your waybar: add a live "custom/sable" module (node pet.js --bar)
# to the top bar, colored by mood. Idempotent (re-run safe) and non-destructive
# (backs up each config it edits to *.bak). Run on YOUR box, not the sandbox.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
PET="$REPO/pet.js"
CFG="$HOME/.config/waybar/config.jsonc"
CSS="$HOME/.config/waybar/style.css"

say() { printf '  %s\n' "$*"; }
backup() { [ -f "$1" ] && cp -n "$1" "$1.bak" && say "backed up $1 -> $1.bak" || true; }

echo "Sable waybar installer"

command -v node >/dev/null 2>&1 || { echo "need node on PATH" >&2; exit 1; }
[ -f "$PET" ] || { echo "pet.js not found at $PET" >&2; exit 1; }
command -v playerctl >/dev/null 2>&1 || say "NOTE: playerctl not found — the music reaction is skipped until you install it."

# Pick a terminal for the click-to-open-full-view action.
for t in kitty konsole foot alacritty xterm; do
  if command -v "$t" >/dev/null 2>&1; then
    case "$t" in konsole|foot|alacritty|xterm) ONCLICK="$t -e node $PET --watch" ;; *) ONCLICK="$t -e node $PET --watch" ;; esac
    break
  fi
done
: "${ONCLICK:=node $PET --watch}"

[ -f "$CFG" ] || { echo "waybar config not found at $CFG" >&2; exit 1; }

if grep -q 'custom/sable' "$CFG"; then
  say "waybar config: already has Sable, skipping"
else
  backup "$CFG"
  # 1) define the module right after the top-level opening brace (getline avoids
  #    all the awk quoting pain — the JSON line is built in shell below).
  MODULE="  \"custom/sable\": { \"exec\": \"node $PET --bar\", \"return-type\": \"json\", \"interval\": 5, \"tooltip\": true, \"on-click\": \"$ONCLICK\" },"
  TMPMOD="$(mktemp)"; printf '%s\n' "$MODULE" > "$TMPMOD"
  awk -v modfile="$TMPMOD" '!ins && /^\{/ { print; while ((getline line < modfile) > 0) print line; ins=1; next } { print }' \
    "$CFG" > "$CFG.tmp" && mv "$CFG.tmp" "$CFG"
  rm -f "$TMPMOD"
  # 2) show her: prepend to modules-right (falls back to modules-left).
  if grep -q '"modules-right":[[:space:]]*\[' "$CFG"; then
    sed -i 's#"modules-right":[[:space:]]*\[#"modules-right": ["custom/sable", #' "$CFG"
    say "waybar config: added Sable to modules-right"
  elif grep -q '"modules-left":[[:space:]]*\[' "$CFG"; then
    sed -i 's#"modules-left":[[:space:]]*\[#"modules-left": ["custom/sable", #' "$CFG"
    say "waybar config: added Sable to modules-left"
  else
    say "waybar config: module defined, but add \"custom/sable\" to a modules- list yourself."
  fi
fi

# 3) color her by mood
if [ -f "$CSS" ] && ! grep -q 'custom-sable' "$CSS"; then
  backup "$CSS"
  cat >> "$CSS" <<'CSSEOF'

#custom-sable { padding: 0 10px; margin: 3px 2px; border-radius: 6px; background: #10273d; }
#custom-sable.content, #custom-sable.happy, #custom-sable.proud, #custom-sable.eager, #custom-sable.busy { color: #7ab8ff; }
#custom-sable.anxious, #custom-sable.worried, #custom-sable.curious { color: #ffcc66; }
#custom-sable.sleepy { color: #6b7a8d; }
#custom-sable.alarmed { color: #ff6b6b; }
CSSEOF
  say "waybar style: added Sable's mood colors"
fi

pidof waybar >/dev/null 2>&1 && killall -SIGUSR2 waybar 2>/dev/null && say "reloaded waybar" || say "start waybar to see Sable"
echo "Done. Sable is on your top bar — she re-reads every 5s. Click her for the full view."
