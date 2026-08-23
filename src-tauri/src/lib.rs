use std::collections::HashMap;
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

// Shared state for the hardware lock. `watched` packs the armed token's
// vendor/product id as (vid << 16 | pid) so the poll thread can read it
// atomically without locking.
//
// `trigger_token` packs the SAME token id for the insertion trigger: when this
// token transitions absent -> present on the bus, the poll thread emits an event
// so the frontend can offer to start/unlock the app. 0 means "no trigger set".
// It is persisted (keychain) so insertion is detected even before the app is
// unlocked or the dead-man's switch is armed.
struct UsbLockState {
    is_armed: Arc<AtomicBool>,
    watched: Arc<AtomicU32>,
    trigger_token: Arc<AtomicU32>,
}

// Keychain account holding the persisted insertion-trigger token as "vid:pid".
const KEYCHAIN_TRIGGER_ACCOUNT: &str = "usb_trigger_token_v1";

fn pack_vid_pid(vid: u16, pid: u16) -> u32 {
    ((vid as u32) << 16) | (pid as u32)
}

// Returns true if a USB device with the given vendor:product id is currently
// enumerable on the bus. Enumeration only — we never open or read the device.
fn usb_present(vid: u16, pid: u16) -> bool {
    match rusb::devices() {
        Ok(list) => list.iter().any(|d| {
            match d.device_descriptor() {
                Ok(desc) => desc.vendor_id() == vid && desc.product_id() == pid,
                Err(_) => false,
            }
        }),
        // If the bus can't be read at all, treat as "not present" so an armed
        // switch fails safe (locks) rather than silently ignoring removal.
        Err(_) => false,
    }
}

/// Lists currently-connected USB devices as "vid:pid" strings so the operator
/// can select which token to designate as the kill-switch. Enumeration only.
/// When the device can be opened, a readable "vid:pid — Manufacturer Product"
/// label is returned so the operator can tell devices apart; if it can't be
/// opened (common without udev permissions), the bare "vid:pid" is returned.
#[tauri::command]
fn list_usb_devices() -> Result<Vec<String>, String> {
    let list = rusb::devices().map_err(|e| format!("USB enumeration failed: {e}"))?;
    let mut out = Vec::new();
    for d in list.iter() {
        if let Ok(desc) = d.device_descriptor() {
            let id = format!("{:04x}:{:04x}", desc.vendor_id(), desc.product_id());
            // Skip internal root hubs (Linux Foundation) — they aren't tokens.
            if desc.vendor_id() == 0x1d6b {
                continue;
            }
            // Try to read a human-readable name; fall back to the bare id.
            let label = match d.open() {
                Ok(handle) => {
                    let timeout = std::time::Duration::from_millis(200);
                    let lang = handle
                        .read_languages(timeout)
                        .ok()
                        .and_then(|l| l.into_iter().next());
                    let name = lang.and_then(|lang| {
                        let man = handle.read_manufacturer_string(lang, &desc, timeout).ok();
                        let prod = handle.read_product_string(lang, &desc, timeout).ok();
                        match (man, prod) {
                            (Some(m), Some(p)) => Some(format!("{m} {p}")),
                            (None, Some(p)) => Some(p),
                            (Some(m), None) => Some(m),
                            _ => None,
                        }
                    });
                    match name {
                        Some(n) => format!("{id} — {n}"),
                        None => id,
                    }
                }
                Err(_) => id,
            };
            out.push(label);
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Arms the switch to watch a specific token, given as "vid:pid" (hex). Refuses
/// to arm if that token is not currently present, so you can't arm to a device
/// that is already gone.
#[tauri::command]
fn arm_deadmans_switch(
    state: tauri::State<'_, UsbLockState>,
    vid_pid: String,
) -> Result<String, String> {
    // Accept either a bare "vid:pid" or the labelled "vid:pid — Name" form the
    // device list may return. Take only the leading vid:pid token.
    let (vid, pid) = parse_vid_pid(&vid_pid)?;

    if !usb_present(vid, pid) {
        return Err(format!(
            "Token {vid:04x}:{pid:04x} is not currently connected. Insert it before arming."
        ));
    }

    state.watched.store(pack_vid_pid(vid, pid), Ordering::SeqCst);
    state.is_armed.store(true, Ordering::SeqCst);

    // Reuse this same token as the insertion trigger, and persist it, so a later
    // re-insertion offers to start/unlock the app. Best-effort: never fail arming
    // if persistence hiccups.
    state.trigger_token.store(pack_vid_pid(vid, pid), Ordering::SeqCst);
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_TRIGGER_ACCOUNT) {
        let _ = entry.set_password(&format!("{vid:04x}:{pid:04x}"));
    }

    Ok(format!(
        "Hardware dead-man's switch ARMED to token {vid:04x}:{pid:04x}. Removal will wipe session keys."
    ))
}

#[tauri::command]
fn disarm_deadmans_switch(state: tauri::State<'_, UsbLockState>) -> Result<String, String> {
    state.is_armed.store(false, Ordering::SeqCst);
    Ok("Hardware dead-man's switch DISARMED.".to_string())
}

// --- USB insertion trigger ---------------------------------------------------
//
// A persisted token whose INSERTION (absent -> present) makes the poll thread
// emit "usb-token-inserted". The frontend then offers a "Start Sanctuary?" box.
// This is enumeration-only, advisory, and never opens the device.

// Parse "vid:pid" (optionally with a trailing " — Name" label) to (vid, pid).
fn parse_vid_pid(s: &str) -> Result<(u16, u16), String> {
    let id_part = s.split_whitespace().next().unwrap_or("").trim();
    let (vid_s, pid_s) = id_part
        .split_once(':')
        .ok_or_else(|| "vid_pid must be in 'vid:pid' hex form, e.g. 1050:0407".to_string())?;
    let vid = u16::from_str_radix(vid_s.trim(), 16).map_err(|_| "invalid vendor id".to_string())?;
    let pid = u16::from_str_radix(pid_s.trim(), 16).map_err(|_| "invalid product id".to_string())?;
    Ok((vid, pid))
}

/// Sets (and persists) the token whose insertion triggers the start prompt.
/// Reuses the same "vid:pid" identity as the dead-man's switch. Persisted to the
/// OS keychain so it survives restart and works before unlock.
#[tauri::command]
fn set_usb_trigger_token(
    state: tauri::State<'_, UsbLockState>,
    vid_pid: String,
) -> Result<String, String> {
    let (vid, pid) = parse_vid_pid(&vid_pid)?;
    state.trigger_token.store(pack_vid_pid(vid, pid), Ordering::SeqCst);
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_TRIGGER_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    entry
        .set_password(&format!("{vid:04x}:{pid:04x}"))
        .map_err(|e| format!("keychain write error: {e}"))?;
    Ok(format!("USB start-trigger set to token {vid:04x}:{pid:04x}."))
}

/// Clears the persisted insertion-trigger token.
#[tauri::command]
fn clear_usb_trigger_token(state: tauri::State<'_, UsbLockState>) -> Result<(), String> {
    state.trigger_token.store(0, Ordering::SeqCst);
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_TRIGGER_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete error: {e}")),
    }
}

/// Returns the persisted trigger token as "vid:pid", or None if unset.
#[tauri::command]
fn get_usb_trigger_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_TRIGGER_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read error: {e}")),
    }
}

// --- Vault salt storage in the OS credential store (Design A) ---
//
// The per-install AES-derivation salts are NOT secret, but they must live
// outside webview-accessible storage (localStorage). We keep them in the OS
// keychain so they cannot be read or tampered with by webview-scoped code.
// The derived AES keys themselves never touch Rust — they stay non-extractable
// in the webview's RAM.
const KEYCHAIN_SERVICE: &str = "org.injusticereformnetwork.sanctuary";
const KEYCHAIN_SALT_ACCOUNT: &str = "vault_salts_v1";

// --- Keychain access must never be able to freeze the UI ------------------
//
// THE BUG THIS EXISTS TO PREVENT (observed 2026-08-23):
// These were plain synchronous `#[tauri::command] fn`s. Tauri runs sync commands
// on the MAIN thread, and keyring's secret-service backend makes a blocking D-Bus
// call with no timeout of its own. On a desktop where nothing had started
// gnome-keyring there was no org.freedesktop.secrets to answer, so the call never
// returned -- and because it held the main thread, the whole webview froze. The
// operator saw a vault unlock where "nothing happens": no spinner resolution, no
// error, no way to tell a missing daemon from a wrong passphrase.
//
// Two independent things fix that, and both are needed:
//   1. `async fn` + spawn_blocking moves the call OFF the main thread, so the UI
//      keeps rendering no matter how long the keychain takes.
//   2. A timeout turns "hangs forever" into a real Err the frontend can show.
//      Without this the promise simply never settles and the spinner spins on.
//
// A timed-out call leaks its blocking thread -- a stuck D-Bus call cannot be
// cancelled from outside. That is deliberate: one parked thread is a far better
// outcome than an unusable app, and the process is short-lived anyway.
const KEYCHAIN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// Runs a blocking keychain operation off the main thread, with a hard deadline.
/// `what` names the operation so a timeout message says which one gave up.
async fn keychain_op<T, F>(what: &'static str, f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    // The deadline is a plain std channel recv_timeout, NOT tokio::time::timeout.
    // tokio's timer panics at runtime ("no timer running") unless the surrounding
    // runtime was built with the time driver enabled -- which is tauri's choice,
    // not ours, and could change under us. Trading a timer for one extra thread
    // buys immunity from that: a panic here would be strictly worse than the hang
    // this function exists to prevent.
    tauri::async_runtime::spawn_blocking(move || run_with_deadline(what, KEYCHAIN_TIMEOUT, f))
        .await
        .map_err(|e| format!("keychain {what} task failed: {e}"))?
}

/// Runs `f` on a helper thread and gives up after `deadline`.
///
/// Split out from `keychain_op` so the deadline behaviour is unit-testable
/// without standing up a tauri runtime -- see the tests at the bottom of this
/// file. Blocking, so callers must already be off the main thread.
fn run_with_deadline<T, F>(
    what: &str,
    deadline: std::time::Duration,
    f: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        // Send fails only if the receiver already timed out and went away, which
        // is the expected path for a stuck call -- so the error is dropped.
        let _ = tx.send(f());
    });
    match rx.recv_timeout(deadline) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "keychain {what} timed out after {}s. The OS credential store \
             (org.freedesktop.secrets) did not respond -- on Linux this usually \
             means no keyring daemon is running for this session.",
            deadline.as_secs()
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err(format!("keychain {what} worker stopped unexpectedly"))
        }
    }
}

/// Returns the persisted salts JSON, or None if not yet initialized.
#[tauri::command]
async fn get_vault_salts() -> Result<Option<String>, String> {
    keychain_op("read", || {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
            .map_err(|e| format!("keychain entry error: {e}"))?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain read error: {e}")),
        }
    })
    .await
}

/// Persists the salts JSON to the OS keychain. Idempotent overwrite.
#[tauri::command]
async fn set_vault_salts(salts_json: String) -> Result<(), String> {
    keychain_op("write", move || {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
            .map_err(|e| format!("keychain entry error: {e}"))?;
        entry
            .set_password(&salts_json)
            .map_err(|e| format!("keychain write error: {e}"))
    })
    .await
}

/// Deletes the per-install salts from the OS keychain. Used by the portable-USB
/// ("Sanctuary-to-Go") eject flow: after the signed bundle (which carries its own
/// copy of the salts) is confirmed written to the USB, the host keychain salts are
/// cleared so no vault-derivation artifact is left behind on a shared/borrowed
/// machine. Idempotent: an already-absent entry is treated as success, so a wipe
/// on an already-clean host never errors.
#[tauri::command]
async fn clear_vault_salts() -> Result<(), String> {
    keychain_op("delete", || {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
            .map_err(|e| format!("keychain entry error: {e}"))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // already clear — nothing to do
            Err(e) => Err(format!("keychain delete error: {e}")),
        }
    })
    .await
}

// --- Duress panic wipe bridge (IRN OS) ---------------------------------------
//
// On IRN OS a systemd path unit watches /run/irn/panic and, the instant it
// appears, irreversibly destroys the LUKS key material and powers off (see
// os/SECURITY-FEATURES.md). The kiosk user owns /run/irn, so the app can arm
// that wipe with a single file touch — no root, no shell. This command is the
// app-side actuator. The DECISION to call it (a verified duress passphrase)
// lives in the frontend auth layer; Rust only pulls the trigger.
const DURESS_TRIGGER_DIR: &str = "/run/irn";

// Writes the panic trigger file into `base`. `base` must already exist — that
// directory is created (0700, owned by the kiosk user) only by the IRN OS
// tmpfiles rule, so its presence is our proof we are on the appliance and not a
// dev machine. Factored out so it can be unit-tested against a temp dir.
fn write_duress_trigger(base: &std::path::Path) -> Result<(), String> {
    if !base.is_dir() {
        return Err(format!(
            "duress wipe unavailable: {} not present (not running on IRN OS)",
            base.display()
        ));
    }
    std::fs::write(base.join("panic"), b"1")
        .map_err(|e| format!("failed to arm duress wipe: {e}"))
}

/// Duress panic wipe. Fires the OS-level irreversible LUKS destruction by
/// touching the IRN OS trigger file, and emits `duress-wipe-initiated` so the
/// frontend drops all AES keys from RAM in the brief window before poweroff.
/// IRREVERSIBLE. IRN OS (Linux) only; errors out elsewhere so it can never
/// misfire on a dev build.
#[tauri::command]
fn trigger_duress_wipe(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        write_duress_trigger(std::path::Path::new(DURESS_TRIGGER_DIR))?;
        // Best-effort: force RAM keys out now; the OS wipe + poweroff follows.
        let _ = app.emit("duress-wipe-initiated", ());
        Ok("Duress wipe armed. Destroying keys and powering off.".to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Err("duress wipe is only available on IRN OS".to_string())
    }
}

// --- Portable USB bundle I/O ("Sanctuary-to-Go") -----------------------------
//
// The webview is NOT given filesystem access (no fs plugin). Instead these narrow
// Rust commands read/write ONE fixed file — the signed, encrypted backup bundle —
// in an operator-chosen directory (the USB mount, picked via the native dialog).
// The bundle is already client-side-encrypted + HMAC-signed by the frontend
// before it ever reaches `write_usb_bundle`, so Rust only moves opaque bytes; it
// never sees plaintext PHI or keys. Same discipline as fetch_model_file: a single
// purpose-built command, not a general capability.
const USB_BUNDLE_FILENAME: &str = "sanctuary.backup";

fn usb_bundle_path(dir: &str) -> Result<std::path::PathBuf, String> {
    let d = std::path::Path::new(dir);
    if !d.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }
    Ok(d.join(USB_BUNDLE_FILENAME))
}

/// Writes the signed bundle JSON to `<dir>/sanctuary.backup` atomically
/// (temp file + rename), so a yanked drive mid-write cannot leave a half-written
/// bundle that would fail its own HMAC on restore.
#[tauri::command]
fn write_usb_bundle(dir: String, bundle_json: String) -> Result<(), String> {
    let final_path = usb_bundle_path(&dir)?;
    let tmp_path = final_path.with_extension("backup.tmp");
    std::fs::write(&tmp_path, bundle_json.as_bytes())
        .map_err(|e| format!("USB write failed: {e}"))?;
    std::fs::rename(&tmp_path, &final_path)
        .map_err(|e| format!("USB finalize (rename) failed: {e}"))?;
    Ok(())
}

/// Reads `<dir>/sanctuary.backup` and returns its JSON string, or None if no
/// bundle exists there (a fresh stick). HMAC verification happens frontend-side
/// in restoreBackup — this command only returns bytes.
#[tauri::command]
fn read_usb_bundle(dir: String) -> Result<Option<String>, String> {
    let path = usb_bundle_path(&dir)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("USB read failed: {e}")),
    }
}

// --- Backend model fetch (Audio Intake / Whisper) ---
//
// The webview runs from `tauri://localhost`; HuggingFace serves model files via a
// redirect to its Xet CDN whose CORS only allows the `huggingface.co` origin, so
// the frontend fetch freezes. Fetching from Rust has no CORS/origin restriction
// and follows the redirect normally. transformers.js's `env.fetch` is overridden
// (frontend) to call this command for model files.
//
// SECURITY: only HuggingFace hosts are allowed, so the webview cannot use this as
// an open outbound proxy.
fn is_allowed_model_host(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => matches!(
            u.host_str(),
            Some("huggingface.co")
                | Some("hf.co")
                | Some("cdn-lfs.huggingface.co")
                | Some("cdn-lfs-us-1.huggingface.co")
        ),
        Err(_) => false,
    }
}

// --- Generic export / import file I/O ---------------------------------------
//
// FINDING B1: every upload and download in the app used browser DOM APIs —
// `<a download>` + createObjectURL to save, and a hidden `<input type="file">`
// to load. Neither works inside a Tauri webview. On Linux the webview is
// WebKitGTK, which has no download manager wired up unless the host app handles
// `download-requested`, and no native file chooser unless it handles
// `run-file-chooser`. Tauri does neither by default — that is precisely why the
// dialog plugin exists. So `a.click()` and `input.click()` were silent no-ops:
// the buttons fired, nothing happened, no error surfaced.
//
// These two commands are the narrow counterpart to write_usb_bundle /
// read_usb_bundle: the PATH always originates from a native dialog the operator
// just interacted with, so this is not a general filesystem capability handed to
// the webview — it is "write the bytes to the file the human literally chose."

/// Writes raw bytes to an operator-chosen path. Temp + rename so an interrupted
/// write cannot leave a truncated export that looks complete.
#[tauri::command]
fn write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let final_path = std::path::Path::new(&path);
    if final_path.file_name().is_none() {
        return Err(format!("not a writable file path: {path}"));
    }
    let tmp_path = final_path.with_extension("sanctuary-partial");
    std::fs::write(&tmp_path, &bytes).map_err(|e| format!("export write failed: {e}"))?;
    std::fs::rename(&tmp_path, final_path).map_err(|e| format!("export finalize failed: {e}"))?;
    Ok(())
}

/// Reads an operator-chosen file and returns its bytes. Returns raw bytes via
/// `ipc::Response` rather than `Vec<u8>` for the same reason fetch_model_file
/// does — a JSON number array of a large file locks the webview.
#[tauri::command]
fn read_import_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("import read failed: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Downloads a model file server-side and returns its bytes. Redirects (incl. the
/// HF Xet CDN) are followed by reqwest. Restricted to HuggingFace hosts.
///
/// RETURNS `tauri::ipc::Response`, NOT `Vec<u8>` (finding A1 — first-run freeze).
/// A bare `Vec<u8>` return is serialised by serde as a JSON ARRAY OF NUMBERS.
/// The whisper-tiny fp32 weights are ~75 MB, so that produced a JSON document
/// with ~75 million elements — several hundred MB of text for the webview to
/// parse on its own thread. That is the hang during "Downloading model…": the
/// download itself finishes fine, then the UI locks solid trying to parse the
/// response. `ipc::Response` hands the bytes across raw, no JSON encoding.
#[tauri::command]
async fn fetch_model_file(url: String) -> Result<tauri::ipc::Response, String> {
    if !is_allowed_model_host(&url) {
        return Err(format!("Refused: {url} is not an allowed model host."));
    }
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("model fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("model fetch HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("model read failed: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

// --- Hosted assistant call (generic bureaucracy questions ONLY) --------------
//
// The frontend router (routeEngine.js) + guardrails (guardrails.js) decide
// whether a message is eligible to leave the device. By the time this command
// is invoked, the message MUST already be a generic, referent-free question.
// This command deliberately accepts ONLY a bare question string and a system
// prompt — it has no access to the resource list, client records, or vault, so
// PHI cannot ride along even if a frontend bug tried to send it.
//
// SECURITY:
//   * The Anthropic API key lives ONLY here, read from the environment. It is
//     never exposed to the webview/JS bundle.
//   * Outbound host is allowlisted to api.anthropic.com, so this cannot be used
//     as an open proxy (same discipline as fetch_model_file).
//   * On any missing key / network / API error, returns Err so the frontend
//     falls back to the LOCAL path rather than failing open.
const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";

#[tauri::command]
async fn hosted_assistant_ask(question: String, system_prompt: String) -> Result<String, String> {
    let api_key = std::env::var("SANCTUARY_ANTHROPIC_KEY")
        .map_err(|_| "hosted model unavailable (no key configured)".to_string())?;

    // Defense in depth: refuse anything that is not a short, single question.
    // The real gate is the frontend router; this is a backstop against an
    // oversized payload (which would signal something other than a generic Q).
    if question.trim().is_empty() {
        return Err("empty question".to_string());
    }
    if question.len() > 600 {
        return Err("refused: question too long for the generic hosted path".to_string());
    }

    let body = serde_json::json!({
        "model": "claude-opus-4-8",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{ "role": "user", "content": question }]
    });

    let resp = reqwest::Client::new()
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("hosted request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("hosted API HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("hosted response parse failed: {e}"))?;

    // Anthropic messages API: content is an array of blocks; take the first text.
    let text = data
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.iter().find_map(|b| b.get("text").and_then(|t| t.as_str())))
        .map(|s| s.to_string())
        .ok_or_else(|| "hosted response had no text".to_string())?;

    Ok(text)
}

// ── Outbound SMS reminders (Twilio) ──────────────────────────────────────────
// Same discipline as hosted_assistant_ask: credentials live ONLY in the process
// environment (set via ~/.config/labwc/environment), never in the frontend or
// the encrypted vault. Fails CLOSED on any missing credential so a
// misconfigured deploy cannot silently drop or misroute messages.
//
// Privacy reality: the destination number + message body are sent to Twilio,
// which logs both. The frontend gates every send behind an explicit per-client
// consent flag; this command is the backstop that validates shape and refuses
// oversized or malformed payloads.

/// Minimal E.164 check: leading '+' followed by 7–15 digits. This is a shape
/// guard against a malformed vault field, not full validation (Twilio does that).
fn is_e164(number: &str) -> bool {
    let n = number.trim();
    let Some(digits) = n.strip_prefix('+') else {
        return false;
    };
    let len = digits.len();
    (7..=15).contains(&len) && digits.bytes().all(|b| b.is_ascii_digit())
}

#[tauri::command]
async fn send_sms_reminder(to: String, body: String) -> Result<String, String> {
    let account_sid = std::env::var("TWILIO_ACCOUNT_SID")
        .map_err(|_| "SMS unavailable (no account SID configured)".to_string())?;
    let auth_token = std::env::var("TWILIO_AUTH_TOKEN")
        .map_err(|_| "SMS unavailable (no auth token configured)".to_string())?;
    let from_number = std::env::var("TWILIO_FROM_NUMBER")
        .map_err(|_| "SMS unavailable (no sender number configured)".to_string())?;

    let to = to.trim().to_string();
    if to.is_empty() {
        return Err("refused: empty destination number".to_string());
    }
    if !is_e164(&to) {
        return Err("refused: destination is not a valid E.164 number (e.g. +15551234567)".to_string());
    }
    if body.trim().is_empty() {
        return Err("refused: empty message body".to_string());
    }
    // ~4 SMS segments. Reminders should be short; this caps accidental blasts.
    if body.chars().count() > 640 {
        return Err("refused: message too long for a reminder".to_string());
    }

    let url = format!(
        "https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    );

    let form = [
        ("To", to.as_str()),
        ("From", from_number.as_str()),
        ("Body", body.as_str()),
    ];

    let resp = reqwest::Client::new()
        .post(&url)
        .basic_auth(&account_sid, Some(&auth_token))
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("SMS request failed: {e}"))?;

    let status = resp.status();
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("SMS response parse failed: {e}"))?;

    if !status.is_success() {
        // Twilio returns a human-readable "message" field on error.
        let detail = data
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown Twilio error");
        return Err(format!("SMS not sent (HTTP {status}): {detail}"));
    }

    let sid = data
        .get("sid")
        .and_then(|s| s.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "SMS accepted but response had no message SID".to_string())?;

    Ok(sid)
}

// --- Hive-mind admission bridge (local IPC) ----------------------------------
//
// admissionGate + hiveMind.insert() (src/utils/hiveEngine.js) live entirely in
// the webview: they need IndexedDB and the in-RAM hive key derived from the
// unlocked Vault A passphrase, neither of which exist in Rust. An external
// local process that wants to propose a hive-mind entry — e.g. Zee Zee's
// crdt_put tool — has no way to reach that gate today.
//
// This bridge is a narrow, authenticated relay, not a second gate: a Unix
// socket accepts one JSON candidate per connection, and Rust forwards it
// VERBATIM to the webview via a Tauri event without interpreting or
// validating its shape. The webview is the only place that runs
// admissionGate / hiveMind.insert(), so the gate cannot be bypassed by
// talking to Rust instead of the UI — a malformed or person-identifying
// candidate is rejected there exactly as it would be from IntelligenceLayer.
//
// Auth: a random token, generated once and stored in the OS keychain (same
// mechanism as vault_salts), is required on every request so an arbitrary
// local process cannot write into the bridge. get_hive_bridge_token lets the
// operator retrieve it once to hand to the external process (e.g. stored in
// Zee Zee's own local secret vault) — it is never transmitted anywhere else.
// Not #[cfg(unix)]-gated: plain cross-platform types, so `.manage()` and the
// (not(unix)) stub command both work unconditionally. Only the socket
// listener itself (spawn_hive_bridge, handle_hive_bridge_conn) is Unix-only.
struct HiveBridgeState {
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
}

const KEYCHAIN_HIVE_TOKEN_ACCOUNT: &str = "hive_bridge_token_v1";
#[cfg(unix)]
const HIVE_BRIDGE_SOCKET_NAME: &str = "hive_bridge.sock";
#[cfg(unix)]
const HIVE_BRIDGE_MAX_REQUEST_BYTES: usize = 16 * 1024; // candidates are short text
#[cfg(unix)]
const HIVE_BRIDGE_RESPONSE_TIMEOUT: Duration = Duration::from_secs(8);

/// Returns the persisted bridge token, generating and persisting one on first
/// use so it stays constant across restarts (the external process's stored
/// copy keeps working). Lives in the OS keychain, never in a file the webview
/// or an unrelated local process could read directly.
fn get_or_create_hive_bridge_token() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_HIVE_TOKEN_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    match entry.get_password() {
        Ok(tok) => Ok(tok),
        Err(keyring::Error::NoEntry) => {
            let tok = generate_bridge_token()?;
            entry
                .set_password(&tok)
                .map_err(|e| format!("keychain write error: {e}"))?;
            Ok(tok)
        }
        Err(e) => Err(format!("keychain read error: {e}")),
    }
}

/// Returns the persisted bridge token so the operator can copy it into the
/// external process's own local secret store. Does not create a new one.
#[tauri::command]
fn get_hive_bridge_token() -> Result<String, String> {
    get_or_create_hive_bridge_token()
}

/// 32 bytes of OS CSPRNG randomness, hex-encoded. Reads /dev/urandom directly
/// rather than pulling in an RNG crate for one one-time token — Linux only,
/// matching this bridge's #[cfg(unix)] scope and the app's deployment targets.
fn generate_bridge_token() -> Result<String, String> {
    use std::io::Read;
    let mut buf = [0u8; 32];
    let mut f = std::fs::File::open("/dev/urandom")
        .map_err(|e| format!("failed to open /dev/urandom: {e}"))?;
    f.read_exact(&mut buf)
        .map_err(|e| format!("failed to read entropy: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// Constant-time string comparison so token checking doesn't leak a timing
/// side-channel on how many leading bytes matched.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(unix)]
static HIVE_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(unix)]
fn generate_hive_request_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = HIVE_REQUEST_COUNTER.fetch_add(1, Ordering::SeqCst);
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{t:x}-{n:x}")
}

/// Frontend reply to one relayed candidate, delivered from JS after it has run
/// admissionGate / hiveMind.insert() / persistHive(). Looks up the waiting
/// socket thread by `id` and wakes it with the verdict; if that thread already
/// timed out and gave up, the send is a harmless no-op (dropped receiver).
#[cfg(unix)]
#[tauri::command]
fn hive_bridge_respond(
    state: tauri::State<'_, HiveBridgeState>,
    id: String,
    ok: bool,
    reason: Option<String>,
    admitted: Option<i64>,
) -> Result<(), String> {
    let sender = {
        let mut guard = state
            .pending
            .lock()
            .map_err(|_| "hive bridge state poisoned".to_string())?;
        guard.remove(&id)
    };
    if let Some(tx) = sender {
        let mut payload = serde_json::json!({ "ok": ok });
        if let Some(r) = reason {
            payload["reason"] = serde_json::Value::String(r);
        }
        if let Some(a) = admitted {
            payload["admitted"] = serde_json::Value::from(a);
        }
        let _ = tx.send(payload);
    }
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
fn hive_bridge_respond(
    _id: String,
    _ok: bool,
    _reason: Option<String>,
    _admitted: Option<i64>,
) -> Result<(), String> {
    Err("hive bridge is only available on Unix".to_string())
}

#[cfg(unix)]
fn write_hive_bridge_response(
    stream: &mut UnixStream,
    value: &serde_json::Value,
) -> std::io::Result<()> {
    use std::io::Write;
    let bytes = serde_json::to_vec(value)
        .unwrap_or_else(|_| br#"{"ok":false,"reason":"internal serialize error"}"#.to_vec());
    stream.write_all(&bytes)?;
    stream.shutdown(std::net::Shutdown::Write)
}

/// Handles one connection: read until EOF (the client half-closes its write
/// side once it has sent the full request — see zee_powerhouse.py's client),
/// authenticate, relay to the webview, wait for its verdict, write the
/// response, done. One request per connection, no persistent session state.
#[cfg(unix)]
fn handle_hive_bridge_conn(
    mut stream: UnixStream,
    app_handle: tauri::AppHandle,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
    expected_token: &str,
) {
    use std::io::Read;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() > HIVE_BRIDGE_MAX_REQUEST_BYTES {
                    let _ = write_hive_bridge_response(
                        &mut stream,
                        &serde_json::json!({ "ok": false, "reason": "request too large" }),
                    );
                    return;
                }
            }
            Err(_) => return,
        }
    }

    let req: serde_json::Value = match serde_json::from_slice(&buf) {
        Ok(v) => v,
        Err(_) => {
            let _ = write_hive_bridge_response(
                &mut stream,
                &serde_json::json!({ "ok": false, "reason": "malformed JSON request" }),
            );
            return;
        }
    };

    let token = req.get("token").and_then(|t| t.as_str()).unwrap_or("");
    if !constant_time_eq(token, expected_token) {
        let _ = write_hive_bridge_response(
            &mut stream,
            &serde_json::json!({ "ok": false, "reason": "unauthorized" }),
        );
        return;
    }

    // Everything except the token, forwarded as-is. Rust deliberately does not
    // interpret this — admissionGate in the webview is the sole authority.
    let mut candidate = req;
    if let serde_json::Value::Object(ref mut map) = candidate {
        map.remove("token");
    }

    let request_id = generate_hive_request_id();
    let (tx, rx) = mpsc::channel::<serde_json::Value>();
    {
        let mut guard = match pending.lock() {
            Ok(g) => g,
            Err(_) => {
                let _ = write_hive_bridge_response(
                    &mut stream,
                    &serde_json::json!({ "ok": false, "reason": "internal: bridge state poisoned" }),
                );
                return;
            }
        };
        guard.insert(request_id.clone(), tx);
    }

    let emitted = app_handle.emit(
        "hive-admit-request",
        serde_json::json!({ "id": request_id, "candidate": candidate }),
    );
    if emitted.is_err() {
        if let Ok(mut guard) = pending.lock() {
            guard.remove(&request_id);
        }
        let _ = write_hive_bridge_response(
            &mut stream,
            &serde_json::json!({ "ok": false, "reason": "internal: could not reach the app" }),
        );
        return;
    }

    let result = rx.recv_timeout(HIVE_BRIDGE_RESPONSE_TIMEOUT);
    if let Ok(mut guard) = pending.lock() {
        guard.remove(&request_id); // always clean up, whether timed out or answered
    }

    match result {
        Ok(response) => {
            let _ = write_hive_bridge_response(&mut stream, &response);
        }
        Err(_) => {
            let _ = write_hive_bridge_response(
                &mut stream,
                &serde_json::json!({
                    "ok": false,
                    "reason": "no response from Sanctuary (is it running and Vault A unlocked?)"
                }),
            );
        }
    }
}

/// Spawns the socket-accepting thread. Best-effort: any setup failure (no
/// keychain, no writable app data dir, bind failure) logs and simply leaves
/// the bridge unavailable rather than failing app startup — the hive-mind
/// bridge is optional infrastructure, not core to Sanctuary running at all.
#[cfg(unix)]
fn spawn_hive_bridge(app: &tauri::App) {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::UnixListener;

    let token = match get_or_create_hive_bridge_token() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("hive bridge disabled: {e}");
            return;
        }
    };

    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("hive bridge disabled: could not create {}: {e}", data_dir.display());
        return;
    }
    let socket_path = data_dir.join(HIVE_BRIDGE_SOCKET_NAME);
    // A prior run's socket file (crash, unclean exit) would otherwise make
    // bind() fail with "address in use" even though nothing is listening.
    let _ = std::fs::remove_file(&socket_path);

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("hive bridge disabled: bind failed: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600))
    {
        eprintln!("hive bridge disabled: could not restrict socket permissions: {e}");
        let _ = std::fs::remove_file(&socket_path);
        return;
    }

    let app_handle = app.handle().clone();
    let pending = app.state::<HiveBridgeState>().pending.clone();

    thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(stream) = conn else { continue };
            let app_handle = app_handle.clone();
            let pending = pending.clone();
            let token = token.clone();
            thread::spawn(move || {
                handle_hive_bridge_conn(stream, app_handle, pending, &token);
            });
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let usb_state = UsbLockState {
        is_armed: Arc::new(AtomicBool::new(false)),
        watched: Arc::new(AtomicU32::new(0)),
        trigger_token: Arc::new(AtomicU32::new(0)),
    };

    // Load any persisted insertion-trigger token so it is watched from startup,
    // before unlock / arming. Best-effort: absence or a keychain error just means
    // no trigger is active yet.
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_TRIGGER_ACCOUNT) {
        if let Ok(saved) = entry.get_password() {
            if let Ok((vid, pid)) = parse_vid_pid(&saved) {
                usb_state.trigger_token.store(pack_vid_pid(vid, pid), Ordering::SeqCst);
            }
        }
    }

    let is_armed_clone = usb_state.is_armed.clone();
    let watched_clone = usb_state.watched.clone();
    let trigger_clone = usb_state.trigger_token.clone();

    let hive_bridge_state = HiveBridgeState {
        pending: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(usb_state)
        .manage(hive_bridge_state)
        .invoke_handler(tauri::generate_handler![
            arm_deadmans_switch,
            disarm_deadmans_switch,
            set_usb_trigger_token,
            clear_usb_trigger_token,
            get_usb_trigger_token,
            list_usb_devices,
            get_vault_salts,
            set_vault_salts,
            clear_vault_salts,
            write_usb_bundle,
            read_usb_bundle,
            write_export_file,
            read_import_file,
            fetch_model_file,
            hosted_assistant_ask,
            send_sms_reminder,
            trigger_duress_wipe,
            get_hive_bridge_token,
            hive_bridge_respond
        ])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            let app_handle = app.handle().clone();

            // Screen-capture protection. Marks the window as protected content so
            // the OS excludes it from screenshots / screen recording. This is a
            // best-effort defense-in-depth for on-screen PHI:
            //   - Windows: effective (WDA_EXCLUDEFROMCAPTURE — capture shows black).
            //   - macOS:   effective (NSWindowSharingNone).
            //   - Linux:   NO-OP on X11 / most Wayland compositors — there is no
            //     app-level screenshot block, so do NOT rely on it here.
            // It NEVER stops a phone camera pointed at the screen; the real control
            // for that is the dead-man's switch + short lock timeout. We enable it
            // by default so protection is on wherever the OS supports it.
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_content_protected(true);
                }
            }

            // Grant the microphone permission the WebKitGTK webview denies by
            // default, so on-device Audio Intake (getUserMedia) works in the
            // desktop build. We allow ONLY user-media (mic/camera) requests and
            // deny everything else (geolocation, notifications, etc.) so this is
            // not a blanket permission grant. Linux desktop only.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        use webkit2gtk::{
                            PermissionRequestExt, WebViewExt, UserMediaPermissionRequest,
                        };
                        use webkit2gtk::glib::object::Cast;
                        let wv = webview.inner();
                        wv.connect_permission_request(|_wv, req| {
                            if req.downcast_ref::<UserMediaPermissionRequest>().is_some() {
                                req.allow();
                            } else {
                                req.deny();
                            }
                            true
                        });
                    });
                }
            }

            // Spawn the hardware polling daemon. When armed, it enumerates the
            // USB bus once per second and checks whether the designated token is
            // still present. Physical removal -> emit the kill signal so the
            // frontend drops all AES keys from RAM.
            thread::spawn(move || {
                // Tracks the trigger token's presence across ticks so we emit the
                // insertion event only on the absent -> present EDGE, not every
                // second while it stays plugged in.
                let mut trigger_was_present = false;
                loop {
                    thread::sleep(Duration::from_millis(1000));

                    // --- Insertion trigger (independent of arming) ---
                    // When a persisted trigger token appears on the bus, emit once
                    // so the frontend can offer a "Start Sanctuary?" prompt.
                    let tpacked = trigger_clone.load(Ordering::SeqCst);
                    if tpacked != 0 {
                        let tvid = (tpacked >> 16) as u16;
                        let tpid = (tpacked & 0xffff) as u16;
                        let present = usb_present(tvid, tpid);
                        if present && !trigger_was_present {
                            let _ = app_handle.emit("usb-token-inserted", ());
                        }
                        trigger_was_present = present;
                    } else {
                        trigger_was_present = false;
                    }

                    // --- Removal kill-switch (only when armed) ---
                    if !is_armed_clone.load(Ordering::SeqCst) {
                        continue;
                    }

                    let packed = watched_clone.load(Ordering::SeqCst);
                    let vid = (packed >> 16) as u16;
                    let pid = (packed & 0xffff) as u16;

                    if !usb_present(vid, pid) {
                        println!(
                            "CRITICAL: USB token {vid:04x}:{pid:04x} removed. Triggering key annihilation."
                        );
                        let _ = app_handle.emit("usb-disconnect-kill-signal", ());
                        // Disarm after firing so we don't re-emit every second.
                        is_armed_clone.store(false, Ordering::SeqCst);
                    }
                }
            });

            #[cfg(unix)]
            spawn_hive_bridge(app);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            // Force a clean process exit when the app is asked to quit or the
            // last window is destroyed. The USB poll thread is an infinite loop
            // with no join handle, so without this the process can linger after
            // the window closes — the "have to force-close to restart" bug.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                std::process::exit(0);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    // The duress trigger MUST write only when the IRN OS trigger dir exists,
    // and MUST refuse (not panic, not write elsewhere) when it does not — that
    // refusal is what keeps a dev build from ever arming a real wipe.
    #[test]
    fn duress_trigger_written_when_dir_exists() {
        let dir = std::env::temp_dir().join(format!("irn-duress-ok-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        assert!(write_duress_trigger(&dir).is_ok());
        assert!(dir.join("panic").exists(), "trigger file should be created");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn duress_trigger_refuses_when_dir_missing() {
        let dir = std::env::temp_dir().join(format!("irn-duress-absent-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir); // ensure it does NOT exist

        let res = write_duress_trigger(&dir);
        assert!(res.is_err(), "must refuse when the IRN OS trigger dir is absent");
        assert!(!dir.join("panic").exists(), "must not create anything");
    }

    // Bridge token must be real CSPRNG output, not something guessable from
    // process start time — 64 hex chars (32 bytes) and never repeats.
    #[test]
    fn bridge_token_is_well_formed_and_unique() {
        let a = generate_bridge_token().expect("token generation should succeed");
        let b = generate_bridge_token().expect("token generation should succeed");
        assert_eq!(a.len(), 64, "expected 32 bytes hex-encoded");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "two independently generated tokens must not collide");
    }

    // The token check is the ONLY thing standing between an arbitrary local
    // process and writing into the hive-mind bridge — it must reject anything
    // that isn't an exact match, including same-prefix and different-length
    // strings (a naive prefix compare would wrongly accept those).
    #[test]
    fn constant_time_eq_matches_only_exact_strings() {
        assert!(constant_time_eq("abc123", "abc123"));
        assert!(!constant_time_eq("abc123", "abc124"));
        assert!(!constant_time_eq("abc123", "abc12"));
        assert!(!constant_time_eq("abc123", "abc1234"));
        assert!(!constant_time_eq("", "a"));
        assert!(constant_time_eq("", ""));
    }

    // get_or_create_hive_bridge_token must be idempotent: a second call
    // returns the SAME token rather than silently rotating it, since the
    // external process's stored copy would otherwise stop working on every
    // Sanctuary restart. Uses the real keychain — skipped if none is
    // available (e.g. a headless CI box with no Secret Service running).
    #[test]
    fn hive_bridge_token_persists_across_calls() {
        let first = match get_or_create_hive_bridge_token() {
            Ok(t) => t,
            Err(_) => return, // no keychain backend available in this environment
        };
        let second = get_or_create_hive_bridge_token().expect("second read should succeed");
        assert_eq!(first, second, "token must be stable across calls, not rotated");
    }
}


#[cfg(test)]
mod keychain_deadline_tests {
    use super::run_with_deadline;
    use std::time::{Duration, Instant};

    #[test]
    fn returns_value_when_the_call_completes_in_time() {
        let r = run_with_deadline("read", Duration::from_secs(5), || Ok::<_, String>(Some("ok".to_string())));
        assert_eq!(r.unwrap(), Some("ok".to_string()));
    }

    #[test]
    fn propagates_the_inner_error_unchanged() {
        let r: Result<(), String> =
            run_with_deadline("write", Duration::from_secs(5), || Err("keychain write error: nope".into()));
        assert_eq!(r.unwrap_err(), "keychain write error: nope");
    }

    /// The regression that matters: a keychain call that never returns must
    /// surface an Err, not hang. Before this, a missing secret-service daemon
    /// froze the whole app at vault unlock with no message.
    #[test]
    fn a_hanging_call_times_out_instead_of_blocking_forever() {
        let started = Instant::now();
        let r: Result<(), String> = run_with_deadline("read", Duration::from_millis(300), || {
            std::thread::sleep(Duration::from_secs(30)); // never returns in time
            Ok(())
        });
        let waited = started.elapsed();

        let err = r.expect_err("a hanging keychain call must return Err, not Ok");
        assert!(err.contains("timed out"), "unhelpful message: {err}");
        assert!(err.contains("keyring daemon"), "message should name the likely cause: {err}");
        assert!(waited < Duration::from_secs(5), "gave up too late: {waited:?}");
    }
}
