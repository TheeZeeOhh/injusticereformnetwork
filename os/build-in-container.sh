#!/bin/sh
# Build the IRN OS ISO inside a Debian bookworm container — so it works on any
# host with Podman or Docker (e.g. this Arch/Garuda box, which cannot run
# live-build natively). A --privileged Debian container supplies the three things
# the build needs and the sandbox/host lacks: root, Debian mirrors, and the
# loop/mount access debootstrap requires.
#
# PREREQUISITE: stage the Sanctuary .deb first (built with the Tauri toolchain,
# which lives on the host, not in this minimal container):
#     npm ci && npm run tauri build
#     cp src-tauri/target/release/bundle/deb/*.deb os/config/packages.chroot/sanctuary.deb
#
# Then:  ./os/build-in-container.sh   → os/live-image-amd64.hybrid.iso
set -eu

cd "$(dirname "$0")/.."          # repo root
REPO="$(pwd)"

# Pick a container engine.
if command -v podman >/dev/null 2>&1; then ENGINE=podman
elif command -v docker >/dev/null 2>&1; then ENGINE=docker
else echo "need podman or docker installed" >&2; exit 1; fi
echo "Using container engine: $ENGINE"

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

# Warn (don't fail) if the app .deb isn't staged — the in-image harden hook will
# flag a missing kiosk binary, but the ISO can still build for config testing.
if ! ls os/config/packages.chroot/*.deb >/dev/null 2>&1; then
  echo "WARNING: no Sanctuary .deb in os/config/packages.chroot/ — build the .deb"
  echo "         first (see the header of this script) or the kiosk will boot"
  echo "         to a blank compositor."
  printf "Continue anyway? [y/N] "
  read -r ans; [ "$ans" = y ] || [ "$ans" = Y ] || exit 1
fi

# Run the build. --privileged for loop/mount; the repo is bind-mounted so the
# ISO lands back in os/ on the host. $ENGINE_OPTS is unquoted on purpose (it is a
# flag list, possibly empty).
# shellcheck disable=SC2086
"$ENGINE" $ENGINE_OPTS run --rm --privileged \
  -v "$REPO":/repo -w /repo/os \
  docker.io/library/debian:bookworm \
  bash -euxc '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends live-build ca-certificates
    lb config          # reads auto/config
    lb build           # → live-image-amd64.hybrid.iso
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
