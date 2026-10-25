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
# Installs into EVERY Firefox present (firefox and firefox-esr). irn-browser
# prefers firefox-esr, which is the one that loads the unsigned PHI paste guard:
#   sudo pacman -S firefox-esr          # chaotic-aur; sits beside firefox
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
USER_SHARE="$HOME/.local/share/irn-browser"
COMPDIR="$HOME/.local/share/bash-completion/completions"
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
# Every Firefox on the box gets the policy, not just the first one found:
# irn-browser launches firefox-esr when it exists, and a hardened release build
# beside an unhardened ESR (or the reverse) is the gap this used to leave.
FF_ALL=""
for cand in firefox-esr firefox; do
  command -v "$cand" >/dev/null 2>&1 && FF_ALL="$FF_ALL $cand"
done
FF_BIN="$(printf '%s\n' $FF_ALL | head -1)"
if [ -z "$FF_BIN" ]; then
  warn "no Firefox found. Install it first:  sudo pacman -S firefox-esr"
  warn "continuing with the launcher/EQ; re-run after installing Firefox for the policy."
fi
ff_dirs() {   # $1 = binary -> "LIBDIR ETCDIR"
  case "$1" in
    firefox-esr) echo "/usr/lib/firefox-esr /etc/firefox-esr" ;;
    firefox)     echo "/usr/lib/firefox /etc/firefox" ;;
  esac
}

# --- 1. Launcher, icon, wrapper (user-level) ------------------------------
install -Dm644 "$INC/usr/share/applications/irn-browser.desktop" "$APPS/irn-browser.desktop"
install -Dm644 "$INC/usr/share/icons/hicolor/scalable/apps/irn-browser.svg" "$ICONS/irn-browser.svg"
install -Dm755 "$INC/usr/local/bin/irn-browser" "$BIN/irn-browser"
# Zee Zee bridge: --ask, --capture --zee, and the command center's Zee Zee panel.
install -Dm755 "$INC/usr/local/bin/irn-zee" "$BIN/irn-zee"
# The wrapper resolves its shared assets at /usr/local/share/irn-browser and
# falls back to ~/.local/share/irn-browser. On a daily driver we do not own
# /usr/local, so put the stylesheets and the page template in the fallback —
# without this the theme silently never applies.
install -Dm644 "$SHARE/userChrome.css"  "$USER_SHARE/userChrome.css"
install -Dm644 "$SHARE/userContent.css" "$USER_SHARE/userContent.css"
install -Dm644 "$SHARE/newtab.html"     "$USER_SHARE/newtab.html.template"
say "installed the Zee Zee bridge + IRN stylesheets -> $USER_SHARE"
# Shell completion for irn-browser and irn-zee.
install -Dm644 "$INC/usr/share/bash-completion/completions/irn-browser" \
               "$COMPDIR/irn-browser"
say "installed bash completion -> $COMPDIR/irn-browser"
# Command-center generator: bake this repo's path so it finds reading-room-daily.py
# and sable-posture.sh for the start page's passage + posture panels.
if [ -f "$REPO/irn-newtab.py" ]; then
  sed "s#__REPO__#$REPO#g" "$REPO/irn-newtab.py" > "$BIN/irn-newtab"
  chmod 755 "$BIN/irn-newtab"
  # Point the generator at the template we just installed, so a later repo move
  # doesn't leave it filling slots in a file that no longer exists.
  export IRN_NEWTAB_TEMPLATE="$USER_SHARE/newtab.html.template"
  "$BIN/irn-newtab" >/dev/null 2>&1 || true   # build the home page now so it exists
  say "installed command-center generator + built the home page -> $BIN/irn-newtab"
fi
# On Arch the WM class is "firefox" (not firefox-esr) — fix the .desktop hint.
[ "$FF_BIN" = "firefox" ] && sed -i 's/^StartupWMClass=.*/StartupWMClass=firefox/' "$APPS/irn-browser.desktop"
# Make IRN Browser the default, so links opened from other apps go through the
# wrapper (and its sidebar, theme and session rails) instead of bare Firefox.
if command -v xdg-settings >/dev/null 2>&1; then
  xdg-settings set default-web-browser irn-browser.desktop 2>/dev/null \
    && say "IRN Browser is now the default browser" \
    || warn "could not set the default browser (xdg-settings set default-web-browser irn-browser.desktop)"
fi
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
  # Build the policy once, for this user: the home page points at THIS user's
  # generated command center (the image ships a /usr/local path), and the
  # HTTP allowlist picks up ~/.config/irn-browser/http-allowlist.txt — one
  # origin per line, for the county court sites that still have no HTTPS.
  USER_NEWTAB="$HOME/.local/share/irn-browser/newtab.html"
  HTTP_LIST="$HOME/.config/irn-browser/http-allowlist.txt"
  TMP_POL="$(mktemp)"
  python3 - "$SHARE/policies.json" "$HTTP_LIST" "file://$USER_NEWTAB" > "$TMP_POL" <<'PY'
import json, sys, os
pol_path, allow_path, home = sys.argv[1:4]
raw = open(pol_path, encoding="utf-8").read().replace(
    "file:///usr/local/share/irn-browser/newtab.html", home)
d = json.loads(raw)
extra = []
if os.path.exists(allow_path):
    for line in open(allow_path, encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if line.startswith("http://") or line.startswith("https://"):
            extra.append(line.rstrip("/"))
d["policies"]["HttpAllowlist"] = sorted(set(d["policies"].get("HttpAllowlist", []) + extra))
print(json.dumps(d, indent=2, ensure_ascii=False))
PY
  n_http="$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["policies"]["HttpAllowlist"]))' "$TMP_POL")"
  # The paste guard: zipped from the reviewed source, installed root-owned at the
  # path policies.json names. Root ownership is what makes an unsigned add-on
  # acceptable here: only an admin can swap it.
  TMP_XPI="$(mktemp -d)/paste-guard.xpi"
  ( cd "$SHARE/paste-guard" && python3 -m zipfile -c "$TMP_XPI" manifest.json detect.js guard.js schema.json )
  sudo install -Dm644 "$TMP_XPI" /usr/local/lib/irn-browser/paste-guard.xpi
  say "PHI paste guard -> /usr/local/lib/irn-browser/paste-guard.xpi"
  for ff in $FF_ALL; do
    set -- $(ff_dirs "$ff"); FF_LIB="$1"; FF_ETC="$2"
    sudo install -Dm644 "$TMP_POL"                  "$FF_LIB/distribution/policies.json"
    sudo install -Dm644 "$TMP_POL"                  "$FF_ETC/policies/policies.json"
    sudo install -Dm644 "$SHARE/local-settings.js"  "$FF_LIB/defaults/pref/local-settings.js"
    sudo install -Dm644 "$SHARE/mozilla.cfg"        "$FF_LIB/mozilla.cfg"
    sudo sed -i "s#file:///usr/local/share/irn-browser/newtab.html#file://$USER_NEWTAB#g" "$FF_LIB/mozilla.cfg"
    say "$ff: policy + autoconfig installed ($FF_LIB)"
  done
  # Arch's Firefox ESR also reads /etc/firefox/policies; keep it identical.
  case " $FF_ALL " in *" firefox-esr "*) sudo install -Dm644 "$TMP_POL" /etc/firefox/policies/policies.json ;; esac
  rm -f "$TMP_POL" "$TMP_XPI"
  say "home page -> $USER_NEWTAB; $n_http origin(s) allowed over plain HTTP"
  case " $FF_ALL " in
    *" firefox-esr "*) : ;;
    *) say "NOTE: no firefox-esr. Release Firefox will not load the unsigned paste guard."
       say "      Install it beside firefox:  sudo pacman -S firefox-esr   then re-run this." ;;
  esac
  say "restart the browser, verify at about:policies"
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
echo
echo "  Sessions:   irn-browser                  everyday profile"
echo "              irn-browser -P foia          named profile, separate cookie jar"
echo "              irn-browser --ephemeral      burner in RAM (amber rail)"
echo "              irn-browser --tor            burner over Tor SOCKS5 (violet rail)"
echo "              irn-browser --kiosk URL      fullscreen, chrome stripped"
echo "  Evidence:   irn-browser --capture URL [--zee]"
echo "              full-page render + raw response + SHA256SUMS + manifest.json"
echo "  Zee Zee:    irn-browser --ask \"...\"       local model, nothing leaves the box"
echo "  Safety:     irn-browser --panic          kill browsers, scrub burner residue"
echo "  Home page:  the IRN command center — links, keyword search (cl/foia/lii/...),"
echo "              today's passage, live posture. Rebuilt each launch; 'irn-newtab'"
echo "              refreshes it by hand."
echo "  Add-ons:    uBlock Origin + Dark Reader force-installed; Multi-Account"
echo "              Containers, ClearURLs and SingleFile offered."
echo
echo "Verifying the install..."
"$BIN/irn-browser" --doctor || true
echo
echo "The doctor checks files on disk. The real proof is about:policies in a"
echo "running IRN Browser — open it and confirm the policies list as Active."
