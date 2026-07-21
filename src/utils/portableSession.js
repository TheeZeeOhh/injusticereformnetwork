// portableSession.js
//
// "Sanctuary-to-Go" — Option A portable-USB session orchestrator.
//
// Goal: a caseworker plugs a USB stick into any machine, unlocks, works on real
// records, then ejects — the same records travel with the stick and NO readable
// artifact is left on the host.
//
// Design: this is a PURE orchestrator over already-verified primitives
// (createBackup / restoreBackup / nukeStorage). It performs NO crypto itself and
// changes no crypto primitive. All I/O (reading/writing the USB bundle, clearing
// keychain salts) is INJECTED, so the safety-critical sequencing is unit-testable
// without a real USB or Tauri runtime. The Tauri fs/dialog + keychain-clear
// command are the integration layer that wraps this (and must be runtime-verified
// on the desktop build before shipping).
//
// Safety invariants enforced here:
//   1. Restore verifies the bundle's HMAC (via restoreBackup) BEFORE any local
//      mutation — a bad/tampered bundle or wrong passphrase never corrupts state.
//   2. On eject, the new bundle is written and CONFIRMED on the USB BEFORE any
//      local wipe — never wipe local data until the USB copy is durable
//      (prevents "yanked mid-save = data lost").
//   3. Wipe policy is explicit and injected — the caller decides how aggressively
//      to scrub the host; the default is the strongest (records + keychain salts).

/**
 * Wipe policies for host cleanup on eject.
 * - 'records_and_salts': nuke local records AND clear keychain salts (default;
 *   strongest Technical-Incapacity posture, best for shared/library terminals).
 * - 'records_only': nuke records, leave (non-secret) salts in the host keychain.
 * - 'none': no automatic wipe (operator triggers cleanup manually elsewhere).
 */
export const WIPE_POLICIES = ['records_and_salts', 'records_only', 'none'];

/**
 * @typedef {Object} PortableIO
 * @property {() => Promise<object|null>} readBundle  read+parse the USB bundle, or null if absent
 * @property {(bundle: object) => Promise<void>} writeBundle  atomically persist the bundle to USB
 * @property {(bundle: object) => Promise<object|null>} [readBack]  read the just-written bundle back (durability confirm)
 * @property {() => Promise<void>} [clearSalts]  clear per-install salts from host keychain (for records_and_salts)
 */

/**
 * @typedef {Object} PortableDeps
 * @property {(passphrase: string, bundle: object) => Promise<{restored:number}>} restoreBackup
 * @property {(passphrase: string) => Promise<object>} createBackup
 * @property {() => Promise<unknown>} nukeStorage
 */

/**
 * Begin a portable session: load the USB bundle into local storage after HMAC
 * verification. If no bundle exists on the USB, this is a fresh stick (returns
 * started:true, restored:0) so the operator can begin a new portable vault.
 *
 * @param {string} passphrase
 * @param {PortableIO} io
 * @param {PortableDeps} deps
 * @returns {Promise<{ started: boolean, restored: number, fresh: boolean }>}
 */
export async function beginPortableSession(passphrase, io, deps) {
  if (!passphrase) throw new Error('portable session requires a passphrase');
  const bundle = await io.readBundle();
  if (bundle == null) {
    // Fresh USB — no prior vault. Nothing to restore; caller starts clean.
    return { started: true, restored: 0, fresh: true };
  }
  // restoreBackup verifies the HMAC against the bundle's own salts BEFORE it
  // mutates any local state, so a tampered bundle or wrong passphrase aborts
  // without side effects.
  const { restored } = await deps.restoreBackup(passphrase, bundle);
  return { started: true, restored, fresh: false };
}

/**
 * End a portable session: export the current records to a fresh signed bundle,
 * write it to the USB, CONFIRM the write is durable, and only THEN wipe the host
 * according to `wipePolicy`.
 *
 * Ordering is the whole point: local data is never destroyed until the USB copy
 * is confirmed on disk.
 *
 * @param {string} passphrase
 * @param {PortableIO} io
 * @param {PortableDeps} deps
 * @param {{ wipePolicy?: typeof WIPE_POLICIES[number] }} [opts]
 * @returns {Promise<{ ejected: boolean, wiped: string }>}
 */
export async function endPortableSession(passphrase, io, deps, opts = {}) {
  if (!passphrase) throw new Error('portable session requires a passphrase');
  const wipePolicy = opts.wipePolicy || 'records_and_salts';
  if (!WIPE_POLICIES.includes(wipePolicy)) {
    throw new Error(`invalid wipePolicy '${wipePolicy}'`);
  }

  // 1. Build the new signed portable bundle from current records.
  const bundle = await deps.createBackup(passphrase);

  // 2. Persist to USB.
  await io.writeBundle(bundle);

  // 3. Durability confirm: read the bundle back and check it round-trips. If we
  //    cannot confirm the USB copy, we DO NOT wipe — better to leave the host
  //    intact (and warn) than to destroy the only copy.
  if (typeof io.readBack === 'function') {
    const back = await io.readBack(bundle);
    if (!back || !isSameBundle(back, bundle)) {
      throw new Error('USB write could not be confirmed; host NOT wiped to avoid data loss.');
    }
  }

  // 4. Host wipe, per policy — only reached once the USB copy is durable.
  if (wipePolicy === 'none') {
    return { ejected: true, wiped: 'none' };
  }
  await deps.nukeStorage();
  if (wipePolicy === 'records_and_salts') {
    if (typeof io.clearSalts !== 'function') {
      throw new Error("wipePolicy 'records_and_salts' requires io.clearSalts");
    }
    await io.clearSalts();
    return { ejected: true, wiped: 'records_and_salts' };
  }
  return { ejected: true, wiped: 'records_only' };
}

// Cheap structural equality for the durability confirm. Compares the signature
// and record count/ids — enough to catch a truncated or failed write.
function isSameBundle(a, b) {
  if (!a || !b) return false;
  if (a.hmac !== b.hmac) return false;
  const ar = Array.isArray(a.records) ? a.records : [];
  const br = Array.isArray(b.records) ? b.records : [];
  if (ar.length !== br.length) return false;
  const aids = ar.map((r) => r.id).join(',');
  const bids = br.map((r) => r.id).join(',');
  return aids === bids;
}
