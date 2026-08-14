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
# ISO lands back in os/ on the host.
exec "$ENGINE" run --rm --privileged \
  -v "$REPO":/repo -w /repo/os \
  docker.io/library/debian:bookworm \
  bash -euxc '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends live-build ca-certificates
    lb config          # reads auto/config
    lb build           # → live-image-amd64.hybrid.iso
    ls -l live-image-*.iso
  '
