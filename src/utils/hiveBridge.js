// Local IPC bridge: hands one relayed hive-mind candidate through the exact
// same admit path IntelligenceLayer.jsx's addHiveEntry uses — precheck via
// admissionGate, embed, hiveMind.insert(), persistHive(). This module is the
// single call site so App.jsx's Tauri event listener stays free of gate
// plumbing and the behavior is unit-testable without a webview.
//
// The candidate arrives from src-tauri's hive-mind bridge (see
// spawn_hive_bridge / handle_hive_bridge_conn in src-tauri/src/lib.rs), which
// relays it VERBATIM from an external local process (e.g. Zee Zee's
// crdt_put) without interpreting or validating it — this function, and the
// admissionGate it calls, are the only real gate. Nothing here can be
// bypassed by talking to the socket instead of the UI.
import { useAuthStore } from '../store/authStore';
import { hiveMind, getVectorEmbedding, admissionGate } from './hiveEngine';

/**
 * @param {{ key?: string, sourceText?: string, isPattern?: boolean, sourceCount?: number, lastVerifiedBy?: string }} payload
 * @returns {Promise<{ ok: boolean, reason?: string, admitted?: number }>}
 */
export async function handleHiveAdmitRequest(payload = {}) {
  const { hiveKey, persistHive } = useAuthStore.getState();
  if (!hiveKey) {
    return { ok: false, reason: 'Vault A is locked' };
  }

  const key = String(payload.key || '').trim();
  const sourceText = String(payload.sourceText || '').trim();
  if (!key || !sourceText) {
    return { ok: false, reason: 'key and sourceText are both required' };
  }

  const candidate = {
    sourceText,
    isPattern: !!payload.isPattern,
    sourceCount: payload.isPattern ? Number(payload.sourceCount) : undefined,
    lastVerifiedBy: payload.lastVerifiedBy ? String(payload.lastVerifiedBy).trim() : undefined,
  };

  // Pre-check so the caller gets a specific reason before an embedding call is
  // spent. insert() enforces the same gate regardless — this cannot be
  // skipped to sneak a candidate through.
  const verdict = admissionGate(candidate);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason };
  }

  try {
    const vector = await getVectorEmbedding(sourceText);
    await hiveMind.insert(key, vector, Date.now(), candidate);
    const written = await persistHive();
    return { ok: true, admitted: written === false ? hiveMind.flatten().length : written };
  } catch (err) {
    return { ok: false, reason: err.message || 'insert failed' };
  }
}
