# IRN OS — defensive security features

Two anti-seizure features, both **destructive by design** and **unverified** (no
LUKS device or root available where they were written — test them in a VM with
throwaway data before trusting them with real vaults).

These are *defensive*: they destroy the operator's own data so it cannot be
compelled out of them. They do nothing to any other system.

---

## 1. Amnesiac mode — nothing decrypted touches disk

**What it does.** The live boot runs entirely from a tmpfs overlay: with no
persistence partition, every write lives in RAM and is gone at poweroff. On top
of that:

- `irn-noswap.service` runs `swapoff -a` early every boot — no RAM page
  (master key, decrypted PHI) is ever written to a swap device.
- Kernel cmdline `init_on_alloc=1 init_on_free=1` zeroes memory on allocation
  and on free, shrinking the cold-boot / data-remanence window.

**Fully amnesiac (removable stick).** Add `toram` at the boot menu (press `Tab`
/ `e` on the boot entry): the image loads completely into RAM, so you can pull
the USB and the running system leaves no trace on any disk.

**Limits (honest).**
- `init_on_free` is not a guaranteed cold-boot wipe; against a freezer/cold-boot
  attacker you want full-RAM-wipe-on-shutdown (Tails-style kernel work) — not
  implemented here, noted as a follow-up.
- An *installed* (non-live) system is only amnesiac for swap/RAM; its disk
  persists (that's what the duress wipe below is for).

---

## 2. Duress panic wipe — make the disk unrecoverable, now

**What it does.** `/usr/local/sbin/irn-panic-wipe` erases the LUKS key slots for
every device in `/etc/crypttab` and clobbers each LUKS header with random data,
then hard-powers-off. Without the header + key slots, the ciphertext can never
be decrypted again — **irreversible**. It does not zero every sector (too slow
under duress); destroying the keys is enough.

**How it fires.** A systemd path unit (`irn-panic-wipe.path`) watches
`/run/irn/panic`. The instant that file appears, the wipe runs. `/run` is tmpfs,
so the trigger can never survive a reboot or fire accidentally at boot.

**Arming a trigger** (nothing is armed by default):

| Trigger | How to arm | Risk |
|---|---|---|
| **Sanctuary duress action** | App runs `touch /run/irn/panic` (the kiosk user owns `/run/irn`). Wire a duress passphrase / hidden button in the app. | Any code running as the kiosk user can wipe. Acceptable — wipe is the *safe* direction. |
| **USB dead-man's switch** | `sudo irn-arm-deadman`, pick the token's serial, type `ARM`. Pulling that USB wipes. | Knock the stick loose → total data loss. Complements the Tauri USB dead-man in `src-tauri`. |
| **Manual** | `touch /run/irn/panic` as the kiosk user, or `systemctl start irn-panic-wipe.service` as root. | For drills only. |

**Test it safely.**
1. In a VM, install to a scratch disk with LUKS and put throwaway data in it.
2. `sudo systemctl start irn-panic-wipe.service` (or `touch /run/irn/panic`).
3. Reboot → the LUKS prompt should reject every passphrase (slots gone) and the
   disk should be unrecoverable. Confirm with `cryptsetup luksDump <dev>` (header
   should be destroyed).

**Do NOT** arm any trigger on a machine holding real client data until you have
watched the wipe work end-to-end in a VM.

---

---

## App integration — duress passphrase → wipe

The OS side is done; the Sanctuary app is where a human arms the wipe under
coercion. The bridge is already in place in `src-tauri`:

- **Actuator (built):** Rust command `trigger_duress_wipe` touches
  `/run/irn/panic` and emits `duress-wipe-initiated`. The frontend
  (`App.jsx`) listens for that event and immediately drops RAM keys (`logout()`),
  silently — no alert, so a duress event looks unremarkable to an onlooker.
  Call it from JS with `invoke('trigger_duress_wipe')`.
- **Guard rails (built):** the command is IRN-OS-only. On a dev build (`/run/irn`
  absent) it errors instead of firing. Unit tests cover both branches.

**Still to build — the DECISION (auth-crypto; specced, not yet coded):**

A *duress passphrase* entered at the normal unlock prompt should trigger the wipe
instead of unlocking, indistinguishably. Spec:

1. **Registration.** In Settings, register a duress passphrase alongside the
   vault passphrases. Store only an **Argon2id verifier** for it (same KDF params
   as the vaults, via `cryptoEngine`) — it derives **no** key and unlocks
   nothing. Enforce that it does not collide with any real vault passphrase.
2. **Check at unlock.** In `authStore.login`, after computing the entered
   passphrase's verifier, compare against the duress verifier **before** the
   Vault A/B checks. On match: call `invoke('trigger_duress_wipe')` and render
   the ordinary "wrong passphrase" state — never reveal that a wipe was armed.
3. **Amnesiac note.** On a live/amnesiac boot there is no LUKS at rest, so the
   duress path still drops RAM keys (via the event) but has nothing on disk to
   destroy — correct and safe (the wipe command logs "nothing at rest").
4. **Tests.** Add: duress verifier matches → wipe invoked + no unlock; normal
   passphrase → no wipe; duress passphrase rejected at registration if it equals
   a vault passphrase. Keep all existing auth tests green.

This step touches the auth engine, so it wants its own review pass — say the word
and I'll implement it against the spec with the tests above.

## 3. On-device AI — what it is, and the risk it carries

The image ships **Zee Zee** (the AI twin) with a **local Ollama runtime** and the
`ai-twin-custom` model baked in. The privacy story is the point: prompts,
documents and conversation are answered by a model on the disk, and
`ollama.service` binds **127.0.0.1 only**, so nothing on the network can reach
it and no prompt leaves the machine. The service runs as an unprivileged
`ollama` user under systemd confinement (`ProtectSystem=strict`, `ProtectHome`,
`NoNewPrivileges`, loopback-restricted address families).

> **Zee Zee can execute shell commands, and its sandbox does not work.**
>
> `sandbox_runner.py` is named like a sandbox but is not one: Landlock
> enforcement is dead, two of its three exec stacks are non-functional, and the
> deny-list leaks. It ships here **with command execution enabled**, a deliberate
> choice by Aziza (2026-08-22) for parity with the Garuda setup.
>
> What that means concretely: anything that can steer Zee Zee — a prompt you
> paste, a document it reads, a plugin it loads — can run commands as the desktop
> user. That user has passwordless `sudo` on the live image. Zee Zee is therefore
> the largest privilege surface on this OS, larger than the browser.
>
> It does **not** weaken the Sanctuary vaults (client PHI is encrypted with keys
> that live in Sanctuary's RAM, not the desktop's), and it does not open a
> network path inward. But treat an unattended, unlocked desktop running Zee Zee
> as a machine someone can run code on. Lock the screen; do not paste untrusted
> text into it while a vault is open.
>
> To ship it inert instead, remove `Exec=zee-zee` reachability by deleting
> `/usr/local/bin/zee-zee` from the image, or drop `zee-zee` from
> `config/includes.chroot` and `config/hooks/live/0600-zee-zee.hook.chroot`.

**Sanctuary Terminal** ships alongside it (`sanctuary-terminal`) — a PyQt5
terminal over a pty. It is an ordinary terminal: same privileges as `foot`,
no additional exposure beyond what a shell already gives you.

## 4. Kernel hardening — Debian's kernel, locked down

**Why not a custom kernel.** Debian's backports kernel (7.1.8) already compiles in
nearly every build-time hardening option: stack protector, KASLR, hardened
usercopy, freelist hardening, FORTIFY_SOURCE, heap/stack zeroing. What it leaves
switched *off* can be turned on at boot and runtime, which keeps Debian's weekly
security updates. A hand-built kernel would have to be re-patched by us, forever.

**What is turned on.**

| Layer | File | Does |
|---|---|---|
| Boot parameters | `/etc/irn/kernel-cmdline` (single source of truth) | `lockdown=confidentiality` (root can't read kernel memory or load unsigned modules), memory zeroing, `slab_nomerge`, `hibernate=no` (RAM never written to disk), strict IOMMU against DMA attacks through ports, no 32-bit syscalls, no debugfs |
| Runtime | `/etc/sysctl.d/98-irn-kernel.conf` | kexec syscall off, unprivileged BPF off + JIT hardening, `perf_event_paranoid=3`, unprivileged userfaultfd off, SysRq off, protected FIFOs/files in `/tmp` |
| Modules | `/etc/modprobe.d/irn-blacklist.conf` | FireWire, SCTP/RDS/TIPC/ATM/CAN, rare filesystems, `vivid` can never load |

Live boots read the parameter file through `auto/config`. **Installed systems** read
it through `/etc/default/grub.d/99-irn-harden.cfg`: Calamares writes its own GRUB
config, so before this drop-in an installed system silently got none of these
parameters, including `init_on_free`.

**Deliberately not done**, each because it breaks something real: disabling user
namespaces (removes WebKitGTK's bubblewrap sandbox in Sanctuary), `modules_disabled=1`
(breaks hotplugged USB and the dead-man token), blocking `thunderbolt` (USB-C docks;
strict IOMMU covers the DMA risk instead), blocking Bluetooth (shipped for audio),
`amd_iommu=force_isolation` (breaks some AMD laptops).

**Verify on a booted system:** `sudo irn-verify-kernel-hardening`. It reads live
kernel state (lockdown mode, IOMMU log line, sysctl values, modprobe resolution,
parameters the kernel rejected) and exits non-zero on any failure.

**Verified so far (2026-09-13).** The real 7.1.8 kernel booted in qemu from the
existing lite ISO with these parameters: every parameter recognised, lockdown
engaged in confidentiality mode, IOMMU strict, heap zeroing on alloc and free,
boot reached greetd with zero failed units. systemd logs refused BPF reads of
kernel RAM under lockdown and continues. 

**Full verification in progress (2026-10-08).** All hardening files are in place
(kernel-cmdline, grub.d drop-in, sysctl, modprobe, verify script). Ready for
three-phase testing: (1) live boot, (2) Calamares install, (3) real hardware.
See `KERNEL-HARDENING-VERIFICATION.md` for the test plan and success criteria.
**Not yet verified:** the sysctl and modprobe files on a freshly built image,
a Calamares install picking up the grub drop-in, and a boot on real hardware
(IOMMU behaviour varies by board).

## Files

- `etc/irn/kernel-cmdline`, `etc/default/grub.d/99-irn-harden.cfg`,
  `etc/sysctl.d/98-irn-kernel.conf`, `etc/modprobe.d/irn-blacklist.conf`,
  `usr/local/sbin/irn-verify-kernel-hardening` — kernel hardening (section 4).
- `usr/local/sbin/irn-panic-wipe` — the wipe.
- `etc/systemd/system/irn-panic-wipe.{service,path}` — watcher + action.
- `etc/tmpfiles.d/irn.conf` — creates the user-writable `/run/irn` trigger dir.
- `usr/local/sbin/irn-arm-deadman` + `etc/udev/rules.d/99-irn-deadman.rules.disabled`
  — optional USB dead-man (disarmed).
- `etc/systemd/system/irn-noswap.service` — swap off.
- hooks `0400-amnesiac` / `0500-duress` — enable the units at build time.
