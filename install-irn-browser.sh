#!/usr/bin/env bash
# Install the IRN Browser onto an existing Arch/Garuda desktop: a hardened
# Firefox (enterprise policy + autoconfig + dark UI), a launcher/icon/wrapper, a
# right-click menu item, a waybar dock button, and the EasyEffects system EQ with
# the IRN preset. Same hardened Firefox the IRN OS image ships — this brings it
# to your daily driver. Idempotent (safe to re-run), backs up each config to *.bak.
#
#   ./install-irn-browser.sh            # user launcher + system policy (uses sudo)
#   ./install-irn-browser.sh --no-sudo  # skip the system-wide policy/autoconfig
#
# Add-on installs stay ENABLED (daily-driver requirement). Dark mode is on by
# default (built-in dark theme + forced dark page rendering); install Dark Reader
# from addons.mozilla.org for full page darkening. EQ is EasyEffects (system EQ),
# which equalizes ALL browser audio including cross-origin streams (the radio) —
# an in-browser EQ cannot. Run on YOUR box, not through the sandbox.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
INC="$REPO/os/config/includes.chroot"
SHARE="$INC/usr/local/share/irn-browser"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"
BIN="$HOME/.local/bin"
AUTOSTART="$HOME/.config/autostart"
EE_PRESETS="$HOME/.config/easyeffects/output"
LABWC_MENU="$HOME/.config/labwc/menu.xml"
DOCK_JSONC="$HOME/.config/waybar/dock.jsonc"
DOCK_CSS="$HOME/.config/waybar/dock.css"
DO_SUDO=1
[ "${1:-}" = "--no-sudo" ] && DO_SUDO=0

say()   { printf '  %s\n' "$*"; }
warn()  { printf '  ! %s\n' "$*" >&2; }
backup(){ [ -f "$1" ] && cp -n "$1" "$1.bak" && say "backed up $1 -> $1.bak" || true; }

echo "IRN Browser installer (hardened Firefox + EasyEffects EQ)"

# --- 0. Locate Firefox ----------------------------------------------------
FF_BIN=""; FF_LIB=""; FF_ETC=""
for cand in firefox firefox-esr; do
  if command -v "$cand" >/dev/null 2>&1; then FF_BIN="$cand"; break; fi
done
if [ -z "$FF_BIN" ]; then
  warn "no Firefox found. Install it first:  sudo pacman -S firefox"
  warn "continuing with the launcher/EQ; re-run after installing Firefox for the policy."
fi
case "$FF_BIN" in
  firefox-esr) FF_LIB=/usr/lib/firefox-esr; FF_ETC=/etc/firefox-esr ;;
  firefox)     FF_LIB=/usr/lib/firefox;     FF_ETC=/etc/firefox ;;
esac

# --- 1. Launcher, icon, wrapper (user-level) ------------------------------
install -Dm644 "$INC/usr/share/applications/irn-browser.desktop" "$APPS/irn-browser.desktop"
install -Dm644 "$INC/usr/share/icons/hicolor/scalable/apps/irn-browser.svg" "$ICONS/irn-browser.svg"
install -Dm755 "$INC/usr/local/bin/irn-browser" "$BIN/irn-browser"
# Command-center generator: bake this repo's path so it finds reading-room-daily.py
# and sable-posture.sh for the start page's passage + posture panels.
if [ -f "$REPO/irn-newtab.py" ]; then
  sed "s#__REPO__#$REPO#g" "$REPO/irn-newtab.py" > "$BIN/irn-newtab"
  chmod 755 "$BIN/irn-newtab"
  "$BIN/irn-newtab" >/dev/null 2>&1 || true   # build the home page now so it exists
  say "installed command-center generator + built the home page -> $BIN/irn-newtab"
fi
# On Arch the WM class is "firefox" (not firefox-esr) — fix the .desktop hint.
[ "$FF_BIN" = "firefox" ] && sed -i 's/^StartupWMClass=.*/StartupWMClass=firefox/' "$APPS/irn-browser.desktop"
say "installed launcher, icon, and wrapper into ~/.local"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true
command -v gtk-update-icon-cache   >/dev/null 2>&1 && gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
case ":$PATH:" in *":$BIN:"*) : ;; *) say "NOTE: $BIN is not on PATH — add it so 'irn-browser' resolves." ;; esac

# --- 1b. Desktop shortcut (double-clickable icon on ~/Desktop) -------------
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP_DIR" ]; then
  SHORTCUT="$DESKTOP_DIR/irn-browser.desktop"
  # Absolute Exec + Icon so it works even before ~/.local/bin is on PATH.
  sed -e "s#^Exec=irn-browser#Exec=$BIN/irn-browser#" \
      -e "s#^Icon=irn-browser#Icon=$ICONS/irn-browser.svg#" \
      "$APPS/irn-browser.desktop" > "$SHORTCUT"
  chmod +x "$SHORTCUT"
  # Mark trusted where the DE requires it (KDE Plasma / GNOME), best-effort.
  command -v gio       >/dev/null 2>&1 && gio set "$SHORTCUT" metadata::trusted true 2>/dev/null || true
  command -v kioclient >/dev/null 2>&1 && : # KDE honors the +x bit on Plasma 6
  say "placed desktop shortcut -> $SHORTCUT"
else
  say "no Desktop dir found ($DESKTOP_DIR) — skipped desktop shortcut"
fi

# --- 2. Hardened Firefox: enterprise policy + autoconfig (system, sudo) ----
if [ -n "$FF_BIN" ] && [ "$DO_SUDO" = 1 ]; then
  say "installing hardened Firefox policy + autoconfig (sudo)..."
  sudo install -Dm644 "$SHARE/policies.json"      "$FF_LIB/distribution/policies.json"
  sudo install -Dm644 "$SHARE/policies.json"      "$FF_ETC/policies/policies.json"
  sudo install -Dm644 "$SHARE/local-settings.js"  "$FF_LIB/defaults/pref/local-settings.js"
  sudo install -Dm644 "$SHARE/mozilla.cfg"        "$FF_LIB/mozilla.cfg"
  # Point the home page at THIS user's generated command center (the policy ships
  # a /usr/local system path for the IRN OS image; rewrite it for the daily driver).
  USER_NEWTAB="$HOME/.local/share/irn-browser/newtab.html"
  sudo sed -i "s#file:///usr/local/share/irn-browser/newtab.html#file://$USER_NEWTAB#g" \
    "$FF_LIB/distribution/policies.json" "$FF_ETC/policies/policies.json" 2>/dev/null || true
  say "policy + autoconfig installed; home page -> $USER_NEWTAB"
  say "restart Firefox, verify at about:policies"
elif [ -n "$FF_BIN" ]; then
  say "skipping system policy (--no-sudo). Dark mode + hardening won't apply globally."
fi

# --- 3. EasyEffects system EQ + IRN preset + autostart --------------------
if ! command -v easyeffects >/dev/null 2>&1; then
  warn "easyeffects not installed — the EQ won't run. Install it:  sudo pacman -S easyeffects"
fi
install -Dm644 "$INC/etc/skel/.config/easyeffects/output/IRN.json" "$EE_PRESETS/IRN.json"
say "installed the IRN EasyEffects preset -> $EE_PRESETS/IRN.json"
# Autostart: headless EasyEffects + apply the IRN preset. XDG autostart works on
# KDE/Plasma, GNOME, and any DE that honors ~/.config/autostart.
cat > "$AUTOSTART/irn-eq.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=IRN Audio EQ
Comment=EasyEffects system equalizer with the IRN preset
Exec=sh -c 'easyeffects --gapplication-service & sleep 2; easyeffects -l IRN'
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
say "added EasyEffects autostart (~/.config/autostart/irn-eq.desktop)"
# Apply now if EasyEffects is present and a session is up.
if command -v easyeffects >/dev/null 2>&1; then
  ( easyeffects --gapplication-service >/dev/null 2>&1 & sleep 2; easyeffects -l IRN >/dev/null 2>&1 ) || true
  say "applied the IRN preset to the running session"
fi

# --- 4. labwc right-click menu item ---------------------------------------
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

# --- 5. waybar dock button ------------------------------------------------
if [ -f "$DOCK_JSONC" ]; then
  if grep -q 'custom/irn-browser' "$DOCK_JSONC"; then
    say "waybar dock: already has the IRN Browser button, skipping"
  else
    backup "$DOCK_JSONC"
    awk '!ins && /^\{/ {
           print;
           print "  \"custom/irn-browser\": { \"format\": \"󰈹\", \"tooltip\": true, \"tooltip-format\": \"IRN Browser\", \"on-click\": \"irn-browser\" },";
           ins=1; next }
         {print}' "$DOCK_JSONC" > "$DOCK_JSONC.tmp" && mv "$DOCK_JSONC.tmp" "$DOCK_JSONC"
    if grep -q '"custom/launcher", "wlr/taskbar"' "$DOCK_JSONC"; then
      sed -i 's#"custom/launcher", "wlr/taskbar"#"custom/launcher", "custom/irn-browser", "wlr/taskbar"#' "$DOCK_JSONC"
      say "waybar dock: added button + module"
    else
      say "waybar dock: module defined, but couldn't auto-place it in modules-center"
      say "             — add \"custom/irn-browser\" to that array manually."
    fi
  fi
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

# --- 6. Reload the desktop ------------------------------------------------
pidof labwc  >/dev/null 2>&1 && kill -HUP "$(pidof labwc)"          && say "reloaded labwc"  || true
pidof waybar >/dev/null 2>&1 && killall -SIGUSR2 waybar 2>/dev/null && say "reloaded waybar" || true

echo "Done. IRN Browser (hardened Firefox) is in the launcher, menu, and dock."
echo "  - Home page: the IRN command center (links + today's passage + posture),"
echo "               rebuilt each launch. Run 'irn-newtab' to refresh it by hand."
echo "  - Bundled add-ons: uBlock Origin + Dark Reader force-installed; you can"
echo "                     still install anything else from addons.mozilla.org."
echo "  - Amnesiac mode: 'irn-browser --ephemeral' — a RAM profile that leaves no"
echo "                   trace (resistFingerprinting on, erased on exit/poweroff)."
echo "  - Dark mode on by default; EQ via EasyEffects with the IRN preset at login."
echo "  - Camera/mic/location default-deny; WebRTC local-IP leak closed; no disk cache."
[ -n "$FF_BIN" ] && echo "  - Verify hardening at: about:policies (and about:config for prefs)."
