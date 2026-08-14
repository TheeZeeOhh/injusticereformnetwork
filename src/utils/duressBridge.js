// Bridge from the app's duress decision to the OS-level panic wipe.
//
// The Rust `trigger_duress_wipe` command touches /run/irn/panic, which starts
// the irreversible LUKS key destruction + poweroff on IRN OS (see
// os/SECURITY-FEATURES.md), and emits `duress-wipe-initiated` so the frontend
// drops RAM keys immediately. This module is the single call site so the auth
// store stays free of Tauri plumbing and the behavior is unit-testable.
//
// SILENT BY DESIGN: on a non-Tauri build (dev/browser) there is nothing to
// wipe, and even on Tauri any failure is swallowed with no console output — a
// duress event must leave no visible trace an onlooker could notice.

function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

// Fire the OS panic wipe. Best-effort and non-throwing: callers invoke this and
// then proceed to present the ordinary "incorrect passphrase" outcome.
export async function triggerDuressWipe() {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('trigger_duress_wipe');
  } catch {
    // Not IRN OS, or the command errored: nothing to do here, stay silent.
  }
}
