#!/usr/bin/env bash
# Install Sable as a Cinnamon desklet (a live widget on your actual desktop).
# She reads `node pet.js --bar` every 5s and shows her mood-tinted face; click
# her for the full terminal view. Idempotent (re-run safe), non-destructive.
# Run on YOUR box in a Cinnamon session — NOT the sandbox (it can't write to
# ~/.local/share/cinnamon).
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
PET="$REPO/pet.js"
ASK="$REPO/sable-ask.sh"
UUID="sable@irn"
SRC="$REPO/desklets/$UUID"
DEST="$HOME/.local/share/cinnamon/desklets/$UUID"

command -v node >/dev/null 2>&1 || { echo "need node on PATH" >&2; exit 1; }
[ -f "$PET" ] || { echo "pet.js not found at $PET" >&2; exit 1; }
[ -f "$ASK" ] || { echo "sable-ask.sh not found at $ASK" >&2; exit 1; }
[ -f "$SRC/desklet.js" ] || { echo "desklet source not found at $SRC" >&2; exit 1; }
chmod +x "$ASK" 2>/dev/null || true

# Pick a terminal for the click-to-open-full-view action.
TERM_CMD=""
for t in konsole kitty foot alacritty gnome-terminal xterm; do
  if command -v "$t" >/dev/null 2>&1; then
    case "$t" in gnome-terminal) TERM_CMD="$t --" ;; *) TERM_CMD="$t -e" ;; esac
    break
  fi
done
: "${TERM_CMD:=xterm -e}"

mkdir -p "$DEST"
cp -f "$SRC/metadata.json" "$DEST/metadata.json"
# Bake the absolute pet.js / ask-script paths and chosen terminal into the desklet.
sed -e "s#__PET_PATH__#$PET#g" -e "s#__ASK_PATH__#$ASK#g" -e "s#__TERM_CMD__#$TERM_CMD#g" \
    "$SRC/desklet.js" > "$DEST/desklet.js"

echo "Installed Sable desklet -> $DEST"
echo "  pet.js:   $PET"
echo "  ask:      $ASK   (left-click Sable -> ask Amina)"
echo "  watch:    middle-click Sable -> live mood view"
echo "  terminal: $TERM_CMD"
echo
echo "Add her to the desktop:"
echo "  • Right-click the desktop -> Add Desklets -> Sable -> Add to desktop, OR"
echo "  • Menu -> System Settings -> Desklets -> Sable -> check it on."
echo
echo "If Sable isn't in the list yet, reload Cinnamon (Alt+F2 -> r -> Enter)"
echo "so it rescans ~/.local/share/cinnamon/desklets."
