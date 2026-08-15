#!/usr/bin/env bash
# Install the IRN Cinnamon desklet family:
#   • sable@irn        — the repo/machine familiar; left-click asks Amina.
#   • readingroom@irn  — a passage of the day from the local library.
#   • posture@irn      — glanceable Sanctuary security posture.
#
# Idempotent, non-destructive. Run on YOUR box in a Cinnamon session — NOT the
# sandbox (it can't write to ~/.local/share/cinnamon). Supersedes the old
# install-sable-desklet.sh (which installs only Sable).
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
DEST_BASE="$HOME/.local/share/cinnamon/desklets"

PET="$REPO/pet.js"
ASK="$REPO/sable-ask.sh"
DAILY="$REPO/reading-room-daily.py"
POSTURE="$REPO/sable-posture.sh"

command -v node >/dev/null 2>&1 || { echo "need node on PATH" >&2; exit 1; }
PY="$(command -v python3 || true)"; : "${PY:=python3}"

for f in "$PET" "$ASK" "$DAILY" "$POSTURE"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done
chmod +x "$ASK" "$DAILY" "$POSTURE" 2>/dev/null || true

# Repos shown in the familiars strip (name|path). Only those with a .git are
# included; edit this list to add/remove codebases.
FAMILIARS=(
  "Sanctuary|$REPO"
  "IRN-OS|$HOME/IRN-OS"
  "Hivemind|$HOME/Projects/sovereign-hivemind"
  "EquityGuard|$HOME/Projects/equityguard"
)
REPOS_JSON="["; _first=1
for entry in "${FAMILIARS[@]}"; do
  name="${entry%%|*}"; path="${entry#*|}"
  if [ -d "$path/.git" ]; then
    [ "$_first" -eq 1 ] || REPOS_JSON+=","
    REPOS_JSON+="{\"name\":\"$name\",\"path\":\"$path\"}"; _first=0
  else
    echo "  (familiars: skip $name — no repo at $path)"
  fi
done
REPOS_JSON+="]"

# Pick a terminal for click actions.
TERM_CMD=""
for t in konsole kitty foot alacritty gnome-terminal xterm; do
  if command -v "$t" >/dev/null 2>&1; then
    case "$t" in gnome-terminal) TERM_CMD="$t --" ;; *) TERM_CMD="$t -e" ;; esac
    break
  fi
done
: "${TERM_CMD:=xterm -e}"

install_one() {
  local uuid="$1"; local src="$REPO/desklets/$uuid"; local dest="$DEST_BASE/$uuid"
  [ -f "$src/desklet.js" ] || { echo "  skip $uuid (no source)"; return; }
  mkdir -p "$dest"
  cp -f "$src/metadata.json" "$dest/metadata.json"
  # Apply every placeholder; ones absent from a given file are simply no-ops.
  sed -e "s#__PET_PATH__#$PET#g" \
      -e "s#__ASK_PATH__#$ASK#g" \
      -e "s#__DAILY_PATH__#$DAILY#g" \
      -e "s#__POSTURE_PATH__#$POSTURE#g" \
      -e "s#__PY__#$PY#g" \
      -e "s#__REPOS_JSON__#$REPOS_JSON#g" \
      -e "s#__TERM_CMD__#$TERM_CMD#g" \
      "$src/desklet.js" > "$dest/desklet.js"
  echo "  installed $uuid -> $dest"
}

echo "Installing IRN desklets (terminal: $TERM_CMD)"
install_one "sable@irn"
install_one "readingroom@irn"
install_one "posture@irn"
install_one "familiars@irn"

echo
echo "Add them to the desktop:"
echo "  • Right-click desktop -> Add Desklets -> pick Sable / Reading Room / Sanctuary Posture / Familiars."
echo "  • If they aren't listed yet, reload Cinnamon: Alt+F2 -> r -> Enter."
echo
echo "Clicks:  Sable         left=ask Amina, middle=mood view"
echo "         Reading Room  left=ask Amina about today's book"
echo "         Posture       left=full report"
echo "         Familiars     left a row=that repo's full view"
