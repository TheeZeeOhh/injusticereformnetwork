#!/bin/sh
# Build the IRN OS ISO inside a Debian trixie container — so it works on any
# host with Podman or Docker (e.g. this Arch/Garuda box, which cannot run
# live-build natively). A --privileged Debian container supplies the three things
# the build needs and the sandbox/host lacks: root, Debian mirrors, and the
# loop/mount access debootstrap requires.
#
# PREREQUISITE: stage the Sanctuary .deb first (built with the Tauri toolchain,
# which lives on the host, not in this minimal container):
#     npm ci && npm run tauri build
#     cp src-tauri/target/release/bundle/deb/Sanctuary_*_amd64.deb os/config/packages.chroot/
#     (keep the bundler's filename — see the naming trap below)
#
# Then:  ./os/build-in-container.sh   → os/live-image-amd64.hybrid.iso
set -eu

cd "$(dirname "$0")/.."          # repo root
REPO="$(pwd)"

# Only ONE build at a time. Every run starts with `lb clean --purge`, so a second
# invocation deletes the first one's chroot and package cache out from under it —
# which surfaces as a baffling mid-debootstrap "E: Couldn't download packages: <x>"
# rather than anything that says "you started this twice".
#
# flock -E 99 gives the lock-contention case its own exit code, so it is
# distinguishable from the build itself failing.
#
# The lock lives in os/, NOT /tmp: this script runs under sudo, and on a hardened
# kernel (fs.protected_regular=1) root cannot open a file it does not own inside a
# sticky world-writable directory like /tmp — so a lock left there by an earlier
# non-root run makes every later sudo run die with "cannot open lock file".
LOCK="$REPO/os/.build.lock"
if [ -z "${IRN_BUILD_LOCKED:-}" ] && command -v flock >/dev/null 2>&1; then
  IRN_BUILD_LOCKED=1
  export IRN_BUILD_LOCKED
  # `|| status=$?` and not a bare call: under `set -e` a non-zero exit here would
  # kill the script before it could explain itself.
  status=0
  flock -n -E 99 "$LOCK" "$0" "$@" || status=$?
  if [ "$status" -eq 99 ]; then
    echo "An IRN OS build is already running (lock: $LOCK)." >&2
    echo "Not starting a second one: every run does 'lb clean --purge', so two" >&2
    echo "concurrent builds delete each other's chroot mid-debootstrap." >&2
  fi
  exit "$status"
fi

# Pick a container engine.
if command -v podman >/dev/null 2>&1; then ENGINE=podman
elif command -v docker >/dev/null 2>&1; then ENGINE=docker
else echo "need podman or docker installed" >&2; exit 1; fi
echo "Using container engine: $ENGINE"

# debootstrap must mknod device nodes — impossible rootless on most kernels.
if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
  echo "NOTE: rootless podman cannot mknod device nodes; debootstrap will fail." >&2
  echo "      Re-run this whole script with sudo:  sudo bash $0" >&2
fi

# Storage-driver selection (podman only; docker's driver is daemon-level).
# Rootless podman's default `overlay` driver is NOT supported directly over
# btrfs (Garuda's default FS) — it fails with "overlay is not supported over
# btrfs". Prefer fuse-overlayfs; fall back to the native btrfs driver. Override
# with STORAGE_DRIVER=... if you know better.
ENGINE_OPTS=""
if [ "$ENGINE" = podman ]; then
  if [ -n "${STORAGE_DRIVER:-}" ]; then
    ENGINE_OPTS="--storage-driver ${STORAGE_DRIVER}"
    echo "Storage driver: ${STORAGE_DRIVER} (from \$STORAGE_DRIVER)"
  elif command -v fuse-overlayfs >/dev/null 2>&1; then
    ENGINE_OPTS="--storage-driver overlay --storage-opt overlay.mount_program=$(command -v fuse-overlayfs)"
    echo "Storage driver: overlay + fuse-overlayfs"
  else
    # No fuse-overlayfs — check whether the storage lives on btrfs and, if so,
    # use the native btrfs driver so the build still works.
    fstype="$(stat -f -c %T "$HOME/.local/share/containers" 2>/dev/null \
              || stat -f -c %T "$HOME" 2>/dev/null || echo unknown)"
    if [ "$fstype" = btrfs ]; then
      echo "WARNING: on btrfs without fuse-overlayfs — using the native btrfs driver."
      echo "         For fewer surprises: sudo pacman -S fuse-overlayfs  (Debian: apt install fuse-overlayfs)."
      ENGINE_OPTS="--storage-driver btrfs"
    fi
  fi
fi

# Check the staged app .deb — and check it the way live-build actually does.
#
# THE TRAP: live-build's chroot_archives only picks up local packages matching
#     config/packages.chroot/*_${ARCH}.deb   or   *_all.deb
# A .deb renamed to something tidy like `sanctuary.deb` is silently ignored — no
# error, no mention in the log, and you get an ISO that boots to a desktop with
# no app on it. Keep the bundler's own filename (Sanctuary_0.1.0_amd64.deb).
staged_any=""
staged_usable=""
for f in os/config/packages.chroot/*.deb; do
  [ -e "$f" ] || continue
  staged_any="yes"
  case "$f" in
    *_amd64.deb|*_all.deb) staged_usable="yes" ;;
  esac
done

if [ -n "$staged_any" ] && [ -z "$staged_usable" ]; then
  echo "ERROR: os/config/packages.chroot/ has a .deb, but none matching live-build's" >&2
  echo "       glob (*_amd64.deb or *_all.deb), so it would be SILENTLY IGNORED:" >&2
  ls -1 os/config/packages.chroot/*.deb >&2
  echo "       Restage it under the bundler's original name, e.g." >&2
  echo "         cp src-tauri/target/release/bundle/deb/Sanctuary_*_amd64.deb os/config/packages.chroot/" >&2
  exit 1
fi

if [ -z "$staged_any" ]; then
  echo "WARNING: no Sanctuary .deb in os/config/packages.chroot/ — build the .deb"
  echo "         first (see the header of this script) or the desktop will come up"
  echo "         with no app installed."
  printf "Continue anyway? [y/N] "
  read -r ans; [ "$ans" = y ] || [ "$ans" = Y ] || exit 1
fi

# Run the build.
#  --privileged      : debootstrap needs mknod + loop/mount (requires ROOTFUL —
#                      run this whole script with sudo; rootless can't mknod
#                      device nodes on most kernels).
#  --network=host    : use the host's network stack so the container reaches the
#                      Debian mirrors. Rootful podman's default bridge often has
#                      no egress (firewall/netavark), which fails debootstrap.
# $ENGINE_OPTS is unquoted on purpose (it is a flag list, possibly empty).
# shellcheck disable=SC2086
"$ENGINE" $ENGINE_OPTS run --rm --privileged --network=host \
  -v "$REPO":/repo -w /repo/os \
  docker.io/library/debian:trixie \
  bash -euxc '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends live-build ca-certificates
    lb clean --purge || true   # clear any stale chroot/cache from a failed run
    # Drop lb-generated config files (from an earlier bookworm run) so lb config
    # regenerates them for the distribution in auto/config. Hand-written config
    # (package-lists/, hooks/, includes.chroot/, packages.chroot/) is untouched.
    rm -f config/bootstrap config/binary config/chroot config/common config/source
    lb config                  # reads auto/config
    lb build                   # → live-image-amd64.hybrid.iso
    ls -l live-image-*.iso
  ' && exit 0

status=$?
echo >&2
echo "Build failed (exit $status)." >&2
if [ "$ENGINE" = podman ]; then
  echo "If it was a storage-driver mismatch (a previous run created storage with a" >&2
  echo "different driver), reset podman's storage and retry:" >&2
  echo "    podman system reset -f && bash $0" >&2
fi
exit "$status"
