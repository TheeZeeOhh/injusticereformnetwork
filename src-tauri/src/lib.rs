use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

// Shared state for the hardware lock. `watched` packs the armed token's
// vendor/product id as (vid << 16 | pid) so the poll thread can read it
// atomically without locking.
struct UsbLockState {
    is_armed: Arc<AtomicBool>,
    watched: Arc<AtomicU32>,
}

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
    let id_part = vid_pid.split_whitespace().next().unwrap_or("").trim();
    let (vid_s, pid_s) = id_part
        .split_once(':')
        .ok_or_else(|| "vid_pid must be in 'vid:pid' hex form, e.g. 1050:0407".to_string())?;
    let vid = u16::from_str_radix(vid_s.trim(), 16).map_err(|_| "invalid vendor id".to_string())?;
    let pid = u16::from_str_radix(pid_s.trim(), 16).map_err(|_| "invalid product id".to_string())?;

    if !usb_present(vid, pid) {
        return Err(format!(
            "Token {vid:04x}:{pid:04x} is not currently connected. Insert it before arming."
        ));
    }

    state.watched.store(pack_vid_pid(vid, pid), Ordering::SeqCst);
    state.is_armed.store(true, Ordering::SeqCst);
    Ok(format!(
        "Hardware dead-man's switch ARMED to token {vid:04x}:{pid:04x}. Removal will wipe session keys."
    ))
}

#[tauri::command]
fn disarm_deadmans_switch(state: tauri::State<'_, UsbLockState>) -> Result<String, String> {
    state.is_armed.store(false, Ordering::SeqCst);
    Ok("Hardware dead-man's switch DISARMED.".to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let usb_state = UsbLockState {
        is_armed: Arc::new(AtomicBool::new(false)),
        watched: Arc::new(AtomicU32::new(0)),
    };

    let is_armed_clone = usb_state.is_armed.clone();
    let watched_clone = usb_state.watched.clone();

    tauri::Builder::default()
        .manage(usb_state)
        .invoke_handler(tauri::generate_handler![
            arm_deadmans_switch,
            disarm_deadmans_switch,
            list_usb_devices,
            get_vault_salts,
            set_vault_salts
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

            // Spawn the hardware polling daemon. When armed, it enumerates the
            // USB bus once per second and checks whether the designated token is
            // still present. Physical removal -> emit the kill signal so the
            // frontend drops all AES keys from RAM.
            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_millis(1000));

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
