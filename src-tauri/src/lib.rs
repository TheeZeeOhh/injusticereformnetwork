use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
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

/// Returns the persisted salts JSON, or None if not yet initialized.
#[tauri::command]
fn get_vault_salts() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read error: {e}")),
    }
}

/// Persists the salts JSON to the OS keychain. Idempotent overwrite.
#[tauri::command]
fn set_vault_salts(salts_json: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    entry
        .set_password(&salts_json)
        .map_err(|e| format!("keychain write error: {e}"))
}

/// Deletes the per-install salts from the OS keychain. Used by the portable-USB
/// ("Sanctuary-to-Go") eject flow: after the signed bundle (which carries its own
/// copy of the salts) is confirmed written to the USB, the host keychain salts are
/// cleared so no vault-derivation artifact is left behind on a shared/borrowed
/// machine. Idempotent: an already-absent entry is treated as success, so a wipe
/// on an already-clean host never errors.
#[tauri::command]
fn clear_vault_salts() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SALT_ACCOUNT)
        .map_err(|e| format!("keychain entry error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already clear — nothing to do
        Err(e) => Err(format!("keychain delete error: {e}")),
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

/// Local cache path for a model URL: <cache_dir>/sanctuary-models/<hash>_<name>.
/// Keyed by a FNV-1a hash of the URL (stable, fixed-length, filesystem-safe). The
/// model files are public, non-PHI, so caching them on disk is fine and NOT
/// subject to the vault's technical-incapacity rules.
fn model_cache_path(url: &str) -> Option<std::path::PathBuf> {
    let base = dirs_next_cache().or_else(|| std::env::temp_dir().into())?;
    let dir = base.join("sanctuary-models");
    // Filesystem-safe key derived from the URL. Use a FNV-1a 64-bit hash so the
    // filename is short and fixed-length (no truncation-collision risk), and
    // append the last path segment for human readability. No crate dependency.
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in url.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let tail: String = url
        .rsplit('/')
        .next()
        .unwrap_or("model")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .take(40)
        .collect();
    Some(dir.join(format!("{hash:016x}_{tail}")))
}

// Best-effort OS cache dir without adding a crate dependency.
fn dirs_next_cache() -> Option<std::path::PathBuf> {
    if let Ok(x) = std::env::var("XDG_CACHE_HOME") {
        if !x.is_empty() {
            return Some(std::path::PathBuf::from(x));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(std::path::PathBuf::from(home).join(".cache"));
    }
    None
}

/// Downloads a model file server-side and returns its bytes, caching it on disk
/// so subsequent loads read locally (no repeat 75MB download / no re-freeze).
/// Redirects (incl. the HF Xet CDN) are followed by reqwest. HuggingFace hosts only.
#[tauri::command]
async fn fetch_model_file(url: String) -> Result<Vec<u8>, String> {
    if !is_allowed_model_host(&url) {
        return Err(format!("Refused: {url} is not an allowed model host."));
    }

    // Serve from disk cache when present — the common case after first run.
    if let Some(path) = model_cache_path(&url) {
        if let Ok(bytes) = std::fs::read(&path) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
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
    let vec = bytes.to_vec();

    // Cache to disk (best-effort; a cache write failure must not fail the load).
    if let Some(path) = model_cache_path(&url) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, &vec);
    }

    Ok(vec)
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

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(usb_state)
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
            fetch_model_file,
            hosted_assistant_ask,
            send_sms_reminder
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
