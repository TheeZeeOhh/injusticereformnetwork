#!/bin/sh
# Boot-test the IRN OS ISO in qemu and capture evidence.
#
# WHY: "the ISO builds" is not "the ISO boots". The failure mode this exists to
# catch is greetd autologin dying post-GRUB ("could not authenticate") — which
# only shows up on a real boot, and only on screen. So we drive qemu headless
# and screendump the framebuffer at intervals; the PNGs are the verification
# artifact.
#
#   ./os/boot-test.sh                      # BIOS (syslinux) boot
#   ./os/boot-test.sh --uefi               # UEFI (grub-efi) boot, needs OVMF
#   ./os/boot-test.sh --debug              # serial console + verbose boot (see below)
#   ./os/boot-test.sh --iso path.iso --out dir --shots "20 60 120"
#
# --debug exists because a black screen tells you nothing. It pulls the kernel and
# initrd straight out of the ISO and boots them with -kernel/-initrd, so it can
# set its own cmdline: no quiet/splash, console on ttyS0, and journald forwarded
# to that console. serial.log then holds the whole boot — including whatever
# greetd, labwc, or the session actually said before the screen went dark. The
# shipped image is untouched; this only changes how qemu starts it.
#
# Output: $OUT/shot-<seconds>s.png, serial.log, qemu.log, and a summary line.
set -eu

ISO="$(dirname "$0")/live-image-amd64.hybrid.iso"
OUT="$(dirname "$0")/../boot-test-out"
SHOTS="15 30 50 75 110 150 200"
FIRMWARE=bios
DEBUG=no
RAM=4096
CPUS=4

while [ $# -gt 0 ]; do
  case "$1" in
    --iso)   ISO="$2"; shift 2 ;;
    --out)   OUT="$2"; shift 2 ;;
    --shots) SHOTS="$2"; shift 2 ;;
    --uefi)  FIRMWARE=uefi; shift ;;
    --debug) DEBUG=yes; shift ;;
    --ram)   RAM="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -f "$ISO" ] || { echo "ISO not found: $ISO" >&2; exit 1; }
command -v qemu-system-x86_64 >/dev/null || { echo "need qemu-system-x86_64" >&2; exit 1; }
command -v socat >/dev/null || { echo "need socat (to drive the qemu monitor)" >&2; exit 1; }

mkdir -p "$OUT"
rm -f "$OUT"/shot-*.png "$OUT"/shot-*.ppm "$OUT"/serial.log "$OUT"/qemu.log
# The monitor socket lives in a SHORT path, not $OUT: AF_UNIX paths are capped
# at ~108 bytes and a nested output dir blows past that.
SOCKDIR="$(mktemp -d /tmp/irn-boot-test.XXXXXX)"
MON="$SOCKDIR/mon.sock"

ACCEL=""
if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
  ACCEL="-enable-kvm -cpu host"
  echo "accel: KVM"
else
  echo "accel: none (TCG software emulation — expect a SLOW boot; stretch --shots)"
fi

FW_ARGS=""
if [ "$FIRMWARE" = uefi ]; then
  CODE=""
  for c in /usr/share/edk2-ovmf/x64/OVMF_CODE.4m.fd /usr/share/OVMF/OVMF_CODE.fd \
           /usr/share/edk2/x64/OVMF_CODE.fd; do
    [ -f "$c" ] && { CODE="$c"; break; }
  done
  [ -n "$CODE" ] || { echo "no OVMF firmware found; install edk2-ovmf" >&2; exit 1; }
  VARS_SRC="$(dirname "$CODE")/OVMF_VARS.4m.fd"
  [ -f "$VARS_SRC" ] || VARS_SRC="$(dirname "$CODE")/OVMF_VARS.fd"
  cp "$VARS_SRC" "$OUT/OVMF_VARS.fd"
  FW_ARGS="-drive if=pflash,format=raw,readonly=on,file=$CODE -drive if=pflash,format=raw,file=$OUT/OVMF_VARS.fd"
  echo "firmware: UEFI ($CODE)"
else
  echo "firmware: legacy BIOS (seabios)"
fi

echo "iso: $ISO ($(du -h "$ISO" | cut -f1))"
echo "out: $OUT"

# --debug: boot the ISO's own kernel/initrd directly so we control the cmdline.
# live-boot still finds the squashfs by scanning block devices, so the ISO stays
# attached as the cdrom and supplies the real root filesystem.
if [ "$DEBUG" = yes ]; then
  command -v bsdtar >/dev/null || { echo "--debug needs bsdtar to unpack the ISO" >&2; exit 1; }
  bsdtar -xOf "$ISO" live/vmlinuz  > "$OUT/vmlinuz"  2>/dev/null
  bsdtar -xOf "$ISO" live/initrd.img > "$OUT/initrd.img" 2>/dev/null
  [ -s "$OUT/vmlinuz" ] && [ -s "$OUT/initrd.img" ] || {
    echo "could not extract live/vmlinuz + live/initrd.img from the ISO" >&2; exit 1; }
  APPEND="boot=live components noeject hostname=irn-os username=irn"
  APPEND="$APPEND console=tty0 console=ttyS0,115200"
  APPEND="$APPEND systemd.journald.forward_to_console=1 systemd.log_level=info"
  # Positional params, not a string: $APPEND is multi-word and must reach qemu as
  # ONE argument, which an unquoted variable expansion would split apart.
  set -- -kernel "$OUT/vmlinuz" -initrd "$OUT/initrd.img" -append "$APPEND"
  echo "debug: booting extracted kernel with serial console -> $OUT/serial.log"
else
  set --
fi

# shellcheck disable=SC2086
qemu-system-x86_64 $ACCEL $FW_ARGS "$@" \
  -m "$RAM" -smp "$CPUS" \
  -drive file="$ISO",media=cdrom,readonly=on \
  -boot d \
  -vga std -display none \
  -serial "file:$OUT/serial.log" \
  -monitor "unix:$MON,server,nowait" \
  -no-reboot \
  > "$OUT/qemu.log" 2>&1 &
QPID=$!
trap 'kill "$QPID" 2>/dev/null || true; rm -rf "$SOCKDIR"' EXIT INT TERM

# Wait for the monitor socket to appear.
i=0
while [ ! -S "$MON" ]; do
  i=$((i + 1)); [ "$i" -gt 100 ] && { echo "qemu monitor never appeared" >&2; cat "$OUT/qemu.log" >&2; exit 1; }
  sleep 0.1
done

mon() { printf '%s\n' "$1" | socat - "UNIX-CONNECT:$MON" >/dev/null 2>&1 || true; }

# The bootloader menu waits for a keypress on some builds; nudge it twice.
sleep 6;  mon "sendkey ret"
sleep 4;  mon "sendkey ret"

elapsed=10
for t in $SHOTS; do
  wait_for=$((t - elapsed))
  [ "$wait_for" -gt 0 ] && sleep "$wait_for"
  elapsed=$t
  kill -0 "$QPID" 2>/dev/null || { echo "!! qemu exited before ${t}s (guest halted/rebooted)"; break; }
  ppm="$OUT/shot-${t}s.ppm"
  mon "screendump $ppm"
  sleep 1
  if [ -f "$ppm" ]; then
    if command -v magick >/dev/null 2>&1; then magick "$ppm" "$OUT/shot-${t}s.png"
    elif command -v convert >/dev/null 2>&1; then convert "$ppm" "$OUT/shot-${t}s.png"
    elif command -v pnmtopng >/dev/null 2>&1; then pnmtopng "$ppm" > "$OUT/shot-${t}s.png"
    fi
    [ -f "$OUT/shot-${t}s.png" ] && rm -f "$ppm"
    echo "  captured ${t}s"
  else
    echo "  !! no framebuffer dump at ${t}s"
  fi
done

mon "quit"
sleep 1
kill "$QPID" 2>/dev/null || true
wait "$QPID" 2>/dev/null || true
rm -rf "$SOCKDIR"

echo
echo "screenshots:"
ls -1 "$OUT"/shot-*.png 2>/dev/null || echo "  (none — check $OUT/qemu.log)"
[ -s "$OUT/serial.log" ] && echo "serial output: $OUT/serial.log ($(wc -l < "$OUT/serial.log") lines)"
echo
echo "What to look for in the last screenshots:"
echo "  PASS  labwc desktop: waybar top bar + Sanctuary window"
echo "  FAIL  a bare tty with 'could not authenticate' -> greetd PAM autologin"
echo "  FAIL  black screen with a cursor            -> compositor started, app/session died"
