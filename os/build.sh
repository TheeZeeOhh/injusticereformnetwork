#!/bin/sh
# Preflight + build wrapper for IRN OS.
# Run on a Debian trixie host with root and network access to deb.debian.org.
set -eu

cd "$(dirname "$0")"

# --- Preflight ------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
	echo "E: live-build needs root (debootstrap, loop mounts). Re-run with sudo." >&2
	exit 1
fi

if ! command -v lb >/dev/null 2>&1; then
	echo "E: live-build not installed.  apt install -y live-build" >&2
	exit 1
fi

if [ ! -e config/packages.chroot/sanctuary.deb ] && ! ls config/packages.chroot/*.deb >/dev/null 2>&1; then
	echo "W: no Sanctuary .deb in config/packages.chroot/ — the build will FAIL the" >&2
	echo "W: kiosk-binary check in 0100-irn-harden. Build it first:" >&2
	echo "W:   (repo root) npm ci && npm run tauri build" >&2
	echo "W:   cp src-tauri/target/release/bundle/deb/*.deb os/config/packages.chroot/sanctuary.deb" >&2
	printf "Continue anyway? [y/N] " >&2
	read -r ans
	[ "$ans" = "y" ] || [ "$ans" = "Y" ] || exit 1
fi

# --- Build ----------------------------------------------------------------
# `lb clean --purge` between builds if you change package lists.
lb config          # reads auto/config
lb build           # → live-image-amd64.hybrid.iso

echo
echo "Done. Wrote: $(ls -1 live-image-*.iso 2>/dev/null || echo '(no iso — check lb build output above)')"

# --- First-boot checklist (runtime verification, not done until these pass) ---
# [ ] ISO boots on real hardware / VM to a labwc session (no login prompt)
# [ ] Sanctuary launches fullscreen and is the only window
# [ ] No key combo escapes to a terminal or exits the compositor
# [ ] Calamares installer offers LUKS full-disk encryption and completes
# [ ] Installed system reboots back into the encrypted kiosk
# [ ] `ss -tlnp` shows nothing listening on the network
