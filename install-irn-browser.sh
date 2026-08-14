#!/usr/bin/env bash
# Install the IRN Browser onto this labwc desktop: launcher + icon + wrapper,
# plus a right-click menu item and a waybar dock button. Idempotent (safe to
# re-run) and non-destructive (backs up each config it touches to *.bak).
#
#   ./install-irn-browser.sh            # user-level install
#   ./install-irn-browser.sh --policy   # also install the hardened Brave
#                                         managed policy (uses sudo)
#
# Assets come from the repo (os/config/includes.chroot/...). Run on YOUR box,
# not through the sandbox. Unverified: review before running.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/os/config/includes.chroot"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"
BIN="$HOME/.local/bin"
LABWC_MENU="$HOME/.config/labwc/menu.xml"
DOCK_JSONC="$HOME/.config/waybar/dock.jsonc"
DOCK_CSS="$HOME/.config/waybar/dock.css"

say() { printf '  %s\n' "$*"; }
backup() { [ -f "$1" ] && cp -n "$1" "$1.bak" && say "backed up $1 -> $1.bak" || true; }

echo "IRN Browser installer"

# --- 1. Launcher, icon, wrapper -------------------------------------------
install -Dm644 "$SRC/usr/share/applications/irn-browser.desktop" "$APPS/irn-browser.desktop"
install -Dm644 "$SRC/usr/share/icons/hicolor/scalable/apps/irn-browser.svg" "$ICONS/irn-browser.svg"
install -Dm755 "$SRC/usr/local/bin/irn-browser" "$BIN/irn-browser"
say "installed launcher, icon, and wrapper into ~/.local"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true
command -v gtk-update-icon-cache   >/dev/null 2>&1 && gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

case ":$PATH:" in
  *":$BIN:"*) : ;;
  *) say "NOTE: $BIN is not on PATH — add it so 'irn-browser' resolves." ;;
esac

# --- 2. labwc right-click menu item ---------------------------------------
if [ -f "$LABWC_MENU" ]; then
  if grep -q 'IRN Browser' "$LABWC_MENU"; then
    say "labwc menu: already has IRN Browser, skipping"
  else
    backup "$LABWC_MENU"
    awk '{print}
         /<menu id="root-menu">/ && !done {
           print "    <item label=\"IRN Browser\"><action name=\"Execute\" command=\"irn-browser\" /></item>";
           done=1 }' "$LABWC_MENU" > "$LABWC_MENU.tmp" && mv "$LABWC_MENU.tmp" "$LABWC_MENU"
    say "labwc menu: added IRN Browser"
  fi
else
  say "labwc menu: $LABWC_MENU not found, skipping menu integration"
fi

# --- 3. waybar dock button ------------------------------------------------
if [ -f "$DOCK_JSONC" ]; then
  if grep -q 'custom/irn-browser' "$DOCK_JSONC"; then
    say "waybar dock: already has the IRN Browser button, skipping"
  else
    backup "$DOCK_JSONC"
    # 3a. define the module right after the top-level opening brace
    awk '!ins && /^\{/ {
           print;
           print "  \"custom/irn-browser\": { \"format\": \"󰖟\", \"tooltip\": true, \"tooltip-format\": \"IRN Browser\", \"on-click\": \"irn-browser\" },";
           ins=1; next }
         {print}' "$DOCK_JSONC" > "$DOCK_JSONC.tmp" && mv "$DOCK_JSONC.tmp" "$DOCK_JSONC"
    # 3b. add it to modules-center (between launcher and taskbar)
    if grep -q '"custom/launcher", "wlr/taskbar"' "$DOCK_JSONC"; then
      sed -i 's#"custom/launcher", "wlr/taskbar"#"custom/launcher", "custom/irn-browser", "wlr/taskbar"#' "$DOCK_JSONC"
      say "waybar dock: added button + module"
    else
      say "waybar dock: module defined, but couldn't auto-place it in modules-center"
      say "             — add \"custom/irn-browser\" to that array manually."
    fi
  fi
  # 3c. style it (append once)
  if [ -f "$DOCK_CSS" ] && ! grep -q 'custom-irn-browser' "$DOCK_CSS"; then
    backup "$DOCK_CSS"
    cat >> "$DOCK_CSS" <<'CSS'

#custom-irn-browser {
  color: #7ab8ff;
  padding: 0 12px;
  margin: 2px;
  border-radius: 12px;
}
#custom-irn-browser:hover { background: #16324d; }
CSS
    say "waybar dock: added button styling"
  fi
else
  say "waybar dock: $DOCK_JSONC not found, skipping dock integration"
fi

# --- 4. Optional: hardened Brave managed policy (root) --------------------
if [ "${1:-}" = "--policy" ]; then
  say "installing hardened Brave managed policy (sudo)..."
  sudo install -Dm644 "$SRC/etc/brave/policies/managed/irn-hardening.json" \
    /etc/brave/policies/managed/irn-hardening.json
  say "policy installed — restart Brave and check brave://policy"
fi

# --- 5. Reload the desktop ------------------------------------------------
pidof labwc  >/dev/null 2>&1 && kill -HUP "$(pidof labwc)"        && say "reloaded labwc"  || true
pidof waybar >/dev/null 2>&1 && killall -SIGUSR2 waybar 2>/dev/null && say "reloaded waybar" || true

echo "Done. IRN Browser is in fuzzel (W-d), the right-click menu, and the dock."
