#!/usr/bin/env bash
# One-shot reinstall of the freshly-built Sanctuary binary to /usr/local/bin.
# Run with: sudo bash deploy/kiosk/reinstall.sh
# (Avoids the paste/space issues with inline cp commands.)
set -euo pipefail
SRC="/home/aziza/injusticereformnetwork/src-tauri/target/release/app"
DEST="/usr/local/bin/sanctuary"
cp -f "$SRC" "$DEST"
chmod 755 "$DEST"
echo "Installed $SRC -> $DEST"
sha256sum "$DEST"
