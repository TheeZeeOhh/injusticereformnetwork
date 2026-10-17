#!/bin/bash
set -eu

cd "$(dirname "$0")"
OS_DIR="$(pwd -P)"
DEST_ROOT="$OS_DIR/config/includes.chroot/opt/irn-apps"
MANIFEST="$OS_DIR/apps/manifest.json"

if [ ! -f "$MANIFEST" ]; then
    echo "stage-apps: No manifest found at $MANIFEST" >&2
    exit 1
fi

echo "Staging apps into $DEST_ROOT"
mkdir -p "$DEST_ROOT"
cp "$MANIFEST" "$DEST_ROOT/manifest.json"

python3 -c '
import json
import os
import shutil
import subprocess

manifest_path = "apps/manifest.json"
with open(manifest_path) as f:
    manifest = json.load(f)

dest_base = "'"$DEST_ROOT"'"

for app in manifest.get("apps", []):
    app_id = app["id"]
    src = os.path.expanduser(app["src"])
    dest = os.path.join(dest_base, app_id)
    
    print(f"Staging {app_id} from {src}")
    if os.path.exists(dest):
        shutil.rmtree(dest)
        
    excludes = app.get("exclude", [])
    # Build rsync command
    rsync_cmd = ["rsync", "-a"]
    for ex in excludes:
        rsync_cmd.append(f"--exclude={ex}")
    rsync_cmd.append(f"{src}/")
    rsync_cmd.append(f"{dest}/")
    
    subprocess.run(rsync_cmd, check=True)
'
echo "App staging complete."
echo "total staged: $(du -sh "$DEST_ROOT" | cut -f1)"
