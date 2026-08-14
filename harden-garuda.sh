#!/usr/bin/env bash
# Fold the portable IRN OS hardening onto an existing Arch/Garuda box — no new
# distro to maintain. Safe wins run by default; destructive/optional ones are
# behind flags. Idempotent; backs up user configs it edits to *.bak.
#
#   ./harden-garuda.sh              Brave policy + WireGuard tool + EasyEffects EQ
#   ./harden-garuda.sh --sysctl     also apply kernel-hardening sysctls
#   ./harden-garuda.sh --duress     also install the duress panic wipe (prompts)
#
# Run WITHOUT sudo — it elevates per-step so the ~/.config edits stay yours.
# What it deliberately SKIPS (OS-appliance-only, bad for a daily driver):
# the sealed kiosk, and amnesiac no-swap (you want zram/hibernate on Garuda).
set -euo pipefail

[ "$(id -u)" -ne 0 ] || { echo "Run WITHOUT sudo (the script elevates per-step)." >&2; exit 1; }
command -v pacman >/dev/null 2>&1 || { echo "This targets Arch/Garuda (pacman not found)." >&2; exit 1; }

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/os/config/includes.chroot"
USER_NAME="$USER"

say() { printf '  %s\n' "$*"; }
backup() { [ -f "$1" ] && cp -n "$1" "$1.bak" && say "backed up $1 -> $1.bak" || true; }

# --- Safe win: hardened Brave managed policy ------------------------------
do_brave() {
  echo "[Brave] hardened managed policy"
  sudo install -Dm644 "$SRC/etc/brave/policies/managed/irn-hardening.json" \
    /etc/brave/policies/managed/irn-hardening.json
  say "restart Brave, verify at brave://policy (source should be Platform)"
}

# --- Safe win: WireGuard VPN tool -----------------------------------------
do_vpn() {
  echo "[VPN] wireguard-tools + irn-vpn helper"
  sudo pacman -S --needed wireguard-tools openresolv
  sudo install -Dm755 "$SRC/usr/local/sbin/irn-vpn" /usr/local/sbin/irn-vpn
  sudo install -Dm600 "$SRC/etc/wireguard/irn.conf.example" /etc/wireguard/irn.conf.example
  say "usage: sudo irn-vpn import <your.conf> && sudo irn-vpn up   (kill-switch on full tunnel)"
}

# --- Safe win: system-wide EasyEffects EQ ---------------------------------
do_eq() {
  echo "[EQ] easyeffects + IRN preset"
  sudo pacman -S --needed easyeffects
  install -Dm644 "$SRC/etc/skel/.config/easyeffects/output/IRN.json" \
    "$HOME/.config/easyeffects/output/IRN.json"
  local AUTO="$HOME/.config/labwc/autostart"
  if [ -f "$AUTO" ] && ! grep -q 'easyeffects' "$AUTO"; then
    backup "$AUTO"
    cat >> "$AUTO" <<'EOF'

# IRN: system-wide audio EQ (EasyEffects)
easyeffects --gapplication-service >/dev/null 2>&1 &
( sleep 2; easyeffects -l IRN ) >/dev/null 2>&1 &
EOF
    say "added EasyEffects to labwc autostart"
  else
    say "labwc autostart already starts easyeffects (or no autostart file) — skipped"
  fi
  say "log out/in (or run 'easyeffects -l IRN') to apply the preset"
}

# --- Optional: kernel-hardening sysctls -----------------------------------
do_sysctl() {
  echo "[sysctl] no core dumps, restrict kptr/dmesg/ptrace"
  sudo tee /etc/sysctl.d/99-irn-harden.conf >/dev/null <<'EOF'
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
fs.suid_dumpable=0
kernel.yama.ptrace_scope=2
EOF
  sudo sysctl --system >/dev/null && say "applied"
}

# --- Optional (DESTRUCTIVE): duress panic wipe ----------------------------
do_duress() {
  echo "[duress] IRREVERSIBLE LUKS panic wipe"
  echo "  Installs a watcher that, WHEN ARMED, destroys THIS machine's LUKS keys"
  echo "  and powers off. Installed DISARMED (no trigger). Only meaningful if your"
  echo "  Garuda root is LUKS-encrypted."
  printf "  Type INSTALL to proceed (anything else skips): "
  read -r c; [ "$c" = INSTALL ] || { say "skipped duress"; return 0; }
  sudo install -Dm755 "$SRC/usr/local/sbin/irn-panic-wipe" /usr/local/sbin/irn-panic-wipe
  sudo install -Dm755 "$SRC/usr/local/sbin/irn-arm-deadman" /usr/local/sbin/irn-arm-deadman
  sudo install -Dm644 "$SRC/etc/systemd/system/irn-panic-wipe.service" /etc/systemd/system/irn-panic-wipe.service
  sudo install -Dm644 "$SRC/etc/systemd/system/irn-panic-wipe.path"    /etc/systemd/system/irn-panic-wipe.path
  # The shipped tmpfiles hardcodes user 'irn'; on Garuda the trigger dir must be
  # owned by YOU so the Sanctuary app (and you) can arm it.
  echo "d /run/irn 0700 $USER_NAME $USER_NAME -" | sudo tee /etc/tmpfiles.d/irn.conf >/dev/null
  sudo systemd-tmpfiles --create /etc/tmpfiles.d/irn.conf
  sudo systemctl daemon-reload
  sudo systemctl enable --now irn-panic-wipe.path
  say "watcher enabled, DISARMED. To arm later:"
  say "  app  : Sanctuary duress passphrase -> touch /run/irn/panic"
  say "  USB  : sudo irn-arm-deadman   (removing the token wipes)"
  say "  TEST IN A VM WITH THROWAWAY DATA FIRST (see os/SECURITY-FEATURES.md)"
}

echo "Folding IRN hardening onto Garuda (user: $USER_NAME)"
do_brave
do_vpn
do_eq
for a in "$@"; do
  case "$a" in
    --sysctl) do_sysctl ;;
    --duress) do_duress ;;
    *) echo "unknown flag: $a (known: --sysctl, --duress)" >&2 ;;
  esac
done
echo "Done. Reloading waybar if running…"; pkill -SIGUSR2 waybar 2>/dev/null || true
