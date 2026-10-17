# IRN OS Kernel Hardening — Verification Test Plan

**Date created:** 2026-10-08  
**Status:** Ready for testing  
**Scope:** Boot parameters, sysctl, module blocking, and grub.d integration

## Overview

This document guides verification of IRN OS kernel hardening across three scenarios:
1. **Live boot** — verify hardening on first boot from ISO (syslinux/grub-efi)
2. **Installer test** — verify grub.d drop-in survives Calamares → grub.cfg
3. **Real hardware** — verify IOMMU behavior on actual hardware (deferred to physical machine)

All hardening comes from `/etc/irn/kernel-cmdline`, which is read by:
- `os/auto/config` → live boots
- `/etc/default/grub.d/99-irn-harden.cfg` → installed systems (Calamares)
- `/usr/local/sbin/irn-verify-kernel-hardening` → verification

## Pre-build checklist

- [ ] Sanctuary .deb is staged: `ls os/config/packages.chroot/Sanctuary_*_amd64.deb`
- [ ] Kernel cmdline file is readable: `cat os/config/includes.chroot/etc/irn/kernel-cmdline`
- [ ] Grub drop-in exists: `cat os/config/includes.chroot/etc/default/grub.d/99-irn-harden.cfg`
- [ ] Verify script is executable: `ls -la os/config/includes.chroot/usr/local/sbin/irn-verify-kernel-hardening`

## Phase 1: Live Boot Verification

**Goal:** Confirm hardening parameters reach the kernel on first boot.

### Build the ISO

```bash
sudo bash os/build-in-container.sh
# → os/live-image-amd64.hybrid.iso (takes ~15–20 min on first run)
```

**Success criteria:**
- Build completes with `ls -l live-image-*.iso`
- ISO is ~2–3 GB (full) or ~800 MB (lite, if SKIP_OLLAMA=1)

### Boot and verify (BIOS)

```bash
./os/boot-test.sh
# Outputs: boot-test-out/shot-*s.png, serial.log
```

**Manual verification:**
1. Desktop appears in final screenshots (labwc + Sanctuary window)
2. No "could not authenticate" on greetd
3. Boot time: 30–60s on KVM, 3–5 min on TCG

### Automated hardening check (inside the live session)

Once the desktop boots, SSH or alt-F2 into a terminal:

```bash
sudo irn-verify-kernel-hardening
# Expected output: all PASS lines, exit 0
```

**Success criteria:**
- All boot parameters recognized
- Lockdown mode is confidentiality
- Hibernation unavailable
- Debugfs disabled
- IOMMU in strict mode
- All sysctl values match
- All modules blocked
- Exit code 0

### Boot and verify (UEFI, optional)

```bash
./os/boot-test.sh --uefi
# Same verification as above; UEFI path may differ slightly
```

## Phase 2: Installer (Calamares) Verification

**Goal:** Confirm grub.d drop-in survives a Calamares install to disk.

### Create a VM disk

```bash
qemu-img create -f qcow2 /tmp/irn-install-test.qcow2 20G
```

### Boot ISO and run Calamares

```bash
qemu-system-x86_64 -m 4096 -smp 4 -enable-kvm \
  -drive file=os/live-image-amd64.hybrid.iso,media=cdrom,readonly \
  -drive file=/tmp/irn-install-test.qcow2,format=qcow2 \
  -boot d
```

**Interactive steps:**
1. Desktop appears
2. Click "Install System"
3. Calamares: language, auto-partition, set operator password
4. Watch progress; 5–10 min
5. Reboot when prompted

### Boot the installed system and verify

```bash
sudo irn-verify-kernel-hardening
# Expect identical PASS output as phase 1
```

**Success criteria:**
- All PASS lines (same as live boot)
- `/proc/cmdline` has all hardening parameters
- `/boot/grub/grub.cfg` contains the parameters

**If this fails:** Check:
- `cat /etc/default/grub.d/99-irn-harden.cfg` (our drop-in exists)
- Run `sudo update-grub && sudo reboot` to regenerate config
- If still fails, the drop-in path is wrong in includes.chroot

## Phase 3: Real Hardware (Deferred)

On actual hardware (not qemu), verify:

1. **BIOS/UEFI boot:** Same verify script checks
2. **IOMMU active:** `dmesg | grep -i iommu` shows `strict` mode
3. **Thunderbolt/USB-C docks:** Confirm functionality
4. **Performance:** Measure any IOMMU latency impact (typically 1–3%)

**Known gotchas:**
- AMD systems may need IOMMU enabled in BIOS
- Intel requires `intel_iommu=on` + IOMMU BIOS setting
- Some boards soft-hang with strict IOMMU; we use the safer option

## Files under test

| File | Purpose | Verification |
|------|---------|--------------|
| `etc/irn/kernel-cmdline` | Single source of truth for params | Read by auto/config and grub.d |
| `etc/default/grub.d/99-irn-harden.cfg` | Installed system integration | Must appear in /boot/grub/grub.cfg |
| `etc/sysctl.d/98-irn-kernel.conf` | Runtime sysctl values | `sysctl -a` must match all keys |
| `etc/modprobe.d/irn-blacklist.conf` | Module blocking | `modprobe -n` must fail with /bin/false |
| `usr/local/sbin/irn-verify-kernel-hardening` | Verification tool | Must be executable, exit 0 on all boots |
| `auto/config` | Live boot params | Must read kernel-cmdline and pass to --bootappend-live |

## Rollback plan

If hardening breaks boot:

1. **Parameter typo:** Check `/proc/cmdline` in serial.log
2. **Sysctl key doesn't exist:** Check `sysctl -a | grep <key>`
3. **Module blocking breaks USB:** Remove from `irn-blacklist.conf`, rebuild, retest
4. **Installed system missing params:** Rerun `sudo update-grub` inside installed system

To back out:
```bash
git checkout os/auto/config os/config/includes.chroot/etc/irn/
sudo bash os/build-in-container.sh
```

## Success summary

| Phase | Evidence | Status |
|-------|----------|--------|
| 1. Live boot | `irn-verify-kernel-hardening` exits 0; /proc/cmdline has params | PENDING |
| 2. Installer | Installed system verify exits 0; grub.cfg has params | PENDING |
| 3. Real HW | IOMMU strict; docks work; no regression | DEFERRED |

## Next steps

1. Build: `sudo bash os/build-in-container.sh`
2. Live verify: `./os/boot-test.sh` then run verify script in guest
3. Install verify: Calamares test, boot, rerun verify script
4. Commit: `git add ... && git commit -m "IRN OS kernel hardening: working hardening stack"`

---

For design rationale, see `os/SECURITY-FEATURES.md` section 4.
