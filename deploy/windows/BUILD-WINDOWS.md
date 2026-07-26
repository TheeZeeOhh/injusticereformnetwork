# Building Sanctuary on Windows

This is a **build kit**, not a ready-to-run app. Sanctuary is a Tauri desktop
app that must be **compiled on Windows** — it cannot be cross-built from Linux.
Follow this guide on the Windows machine that will run it.

> Honest status: the Linux build is fully verified. The Windows build target is
> configured (`nsis`, `msi` in `src-tauri/tauri.conf.json`) but **has not been
> built or tested by us**. Two subsystems are Linux-verified only and MUST be
> re-tested on Windows (see "Verify after building"). Budget time for that.

---

## 1. Install the toolchain (one-time)

Download and install, in this order:

1. **Microsoft C++ Build Tools** (MSVC) — Tauri needs the MSVC linker.
   https://visualstudio.microsoft.com/visual-cpp-build-tools/
   In the installer, select **"Desktop development with C++"**.

2. **Rust** (MSVC toolchain): https://rustup.rs — run `rustup-init.exe`, accept
   defaults. Then confirm: `rustc --version` and
   `rustup default stable-x86_64-pc-windows-msvc`.

3. **WebView2 Runtime** — the Windows equivalent of Linux's WebKitGTK. Most
   Windows 10/11 already have it; if not:
   https://developer.microsoft.com/microsoft-edge/webview2/ (Evergreen Bootstrapper).

4. **Node.js LTS** (≥18): https://nodejs.org — provides `npm`.

5. **(For the assistant) Ollama for Windows**: https://ollama.com/download
   Needed for the local Amina/Wifey AI. Without it, the assistant falls back to
   guided mode only.

---

## 2. Build the app

From the repo root (this folder), in a **Developer Command Prompt / PowerShell**:

```powershell
npm install
npm run tauri build
```

Output installers land in:
`src-tauri\target\release\bundle\nsis\Sanctuary_0.1.0_x64-setup.exe`
`src-tauri\target\release\bundle\msi\Sanctuary_0.1.0_x64_en-US.msi`

Install either one, or run the raw binary at
`src-tauri\target\release\sanctuary.exe` (note: on Windows the binary is
`sanctuary.exe`; on Linux it was `app`).

---

## 3. Run everything the app needs

The desktop app alone is not "everything you do in Sanctuary." Also run, on this
Windows machine:

- **Ollama** (for Amina/Wifey AI):
  ```powershell
  ollama serve            # must be reachable at http://localhost:11434
  ollama pull llama3.2    # ~2 GB model
  ```
- **The operational backend** (Intelligence Layer, some panels — holds NO PHI):
  ```powershell
  cd server
  npm install
  npx prisma db push
  node index.js
  ```
  The backend reads a `server\.env` (NOT shipped in this kit — create it):
  ```
  DATABASE_URL="file:./dev.db"
  PORT=5000
  # Only if you use the Google Calendar integration:
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  ```
  `prisma db push` creates a fresh local `dev.db`. GOOGLE_* are optional —
  omit them if you don't use calendar sync.

---

## 4. Verify after building (DO NOT SKIP)

These two subsystems are implemented against Linux APIs and are **unverified on
Windows**. Test them before trusting the app with real data:

- **Keychain / vault salts** — the Rust `keyring` crate maps to **Windows
  Credential Manager** on Windows. Create a vault, close the app, reopen: the
  vault must still unlock (salts persisted). If it fails, the salt storage path
  needs Windows-specific work in `src-tauri/src/lib.rs` (`get/set_vault_salts`).

- **USB dead-man's switch + insertion trigger** — uses `rusb`/libusb. On Windows
  this needs a **WinUSB driver** for the token (via Zadig, or the device may need
  driver association). Arm the switch, unplug the token → keys should wipe;
  replug → "Start Sanctuary?" prompt. If USB enumeration returns nothing, the
  driver/permission model differs on Windows and needs attention.

- **Your data does NOT travel with the app.** Vaults start empty on a fresh
  machine (by design — Technical Incapacity). To move records, use the in-app
  Sanctuary-to-Go encrypted backup (**records_only**) and restore with your
  passphrase. Never use records_and_salts (salt-wipe risk).

---

## 5. What is NOT covered here

- **Cold-launch on USB insert** (the Linux udev rule in `deploy/kiosk/`) has no
  Windows equivalent here. The Windows analogue would be a scheduled task or a
  registry autorun keyed to device insertion — not yet built.
- Code-signing the `.exe`/`.msi` (Windows SmartScreen will warn on unsigned
  installers). For distribution you'll want an Authenticode certificate.

See `DEPENDENCIES.md` in this kit for direct download links.
