// Ninjabot — defensive watch (on-device, read-only).
//
// A mission-bound defensive operative for Sanctuary: it observes the app's OWN
// already-collected signals (the tamper-evident audit chain and integrity
// checks) and surfaces anomalies for the operator to judge. It is deliberately
// narrow and safe by construction:
//
//   • It NEVER targets external people, scrapes, or crawls anything.
//   • It NEVER reaches the network — no egress, no telemetry, no phone-home.
//   • It NEVER acts automatically — every finding is advisory; a human decides.
//   • It reads only data the app already holds locally (audit log entries +
//     chain-verify result). It collects nothing new and decrypts no PHI
//     (audit entries carry metadata only: action, recordId, vaultTag, ts).
//
// This keeps ninjabot inside Sanctuary's Technical Incapacity Defense: it adds
// no new at-rest data and no new attack surface. All detectors are pure
// functions over injected signals so they unit-test without a browser.

export const SEVERITY = { INFO: 'info', WARN: 'warn', CRITICAL: 'critical' };

// Tunable thresholds. Conservative defaults; the panel can override.
export const DEFAULT_THRESHOLDS = {
  burstWindowMs: 5 * 60 * 1000, // window for "many accesses quickly"
  burstCount: 25,               // ≥ this many read/write in the window → flag
  offHoursStart: 22,            // 22:00–06:00 local is "off hours"
  offHoursEnd: 6,
  vaultBClusterCount: 10,       // ≥ this many Vault B reads in the window → flag
  massDeleteCount: 5,           // ≥ this many deletes in the window → flag
};

function finding(id, severity, title, detail) {
  return { id, severity, title, detail };
}

// DETECTOR 1 — Audit chain integrity.
// `chain` is the result of auditLog.verifyChain(): { ok, count, brokenAtSeq }.
// A broken chain means a past entry was altered or deleted — the log defends
// itself, and a break is the single most serious defensive signal.
export function detectChainTamper({ chain }) {
  if (!chain) return null;
  if (chain.ok === false) {
    return finding('chain_tamper', SEVERITY.CRITICAL,
      'Audit chain integrity BROKEN',
      `The tamper-evident log fails verification at entry #${chain.brokenAtSeq}. A past entry was altered or removed. Treat the device as compromised until reviewed.`);
  }
  return finding('chain_tamper', SEVERITY.INFO,
    'Audit chain intact',
    `All ${chain.count} log entries verify from genesis — no tampering detected.`);
}

// Helper: entries within the most recent `windowMs`, relative to `now`.
function recentEntries(entries, now, windowMs) {
  const cutoff = now - windowMs;
  return entries.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
}

// DETECTOR 2 — Access burst.
// A large number of reads/writes in a short window can indicate an unattended
// unlocked session being drained, or a coerced bulk export.
export function detectAccessBurst({ entries, now, thresholds = DEFAULT_THRESHOLDS }) {
  const recent = recentEntries(entries, now, thresholds.burstWindowMs);
  const rw = recent.filter((e) => e.action === 'read' || e.action === 'write');
  if (rw.length >= thresholds.burstCount) {
    return finding('access_burst', SEVERITY.WARN,
      'Unusual access burst',
      `${rw.length} record accesses in the last ${Math.round(thresholds.burstWindowMs / 60000)} min (threshold ${thresholds.burstCount}). Confirm this was you.`);
  }
  return null;
}

// DETECTOR 3 — Off-hours activity.
// Access during configured off-hours is not inherently bad, but on a kiosk that
// normally runs during business hours it is worth the operator's eyes.
export function detectOffHours({ entries, now, thresholds = DEFAULT_THRESHOLDS }) {
  const recent = recentEntries(entries, now, thresholds.burstWindowMs);
  const { offHoursStart, offHoursEnd } = thresholds;
  const offHours = recent.filter((e) => {
    const d = new Date(e.ts);
    if (Number.isNaN(d.getTime())) return false;
    const h = d.getHours();
    return offHoursStart <= offHoursEnd
      ? (h >= offHoursStart && h < offHoursEnd)
      : (h >= offHoursStart || h < offHoursEnd);
  });
  if (offHours.length > 0) {
    return finding('off_hours', SEVERITY.INFO,
      'Off-hours activity',
      `${offHours.length} access(es) during off-hours (${offHoursStart}:00–${offHoursEnd}:00). Informational — verify if unexpected.`);
  }
  return null;
}

// DETECTOR 4 — Mass delete.
// A run of deletes, or a delete of the '*ALL*' sentinel, signals a wipe event —
// legitimate scorched-earth or hostile exfil-then-destroy.
export function detectMassDelete({ entries, now, thresholds = DEFAULT_THRESHOLDS }) {
  const recent = recentEntries(entries, now, thresholds.burstWindowMs);
  const deletes = recent.filter((e) => e.action === 'delete');
  const nuke = deletes.find((e) => e.recordId === '*ALL*');
  if (nuke) {
    return finding('mass_delete', SEVERITY.CRITICAL,
      'Full-vault wipe recorded',
      'A scorched-earth (*ALL*) delete is present in the recent log. If you did not initiate this, the device may have been seized or breached.');
  }
  if (deletes.length >= thresholds.massDeleteCount) {
    return finding('mass_delete', SEVERITY.WARN,
      'Multiple deletions',
      `${deletes.length} record deletions in the last ${Math.round(thresholds.burstWindowMs / 60000)} min (threshold ${thresholds.massDeleteCount}). Confirm intent.`);
  }
  return null;
}

// DETECTOR 5 — Vault B access cluster.
// Vault B is 42 CFR Part 2 / HRT — the most sensitive tier. A cluster of B
// accesses in a short window is worth surfacing (the access itself is the
// protected fact under Part 2).
export function detectVaultBCluster({ entries, now, thresholds = DEFAULT_THRESHOLDS }) {
  const recent = recentEntries(entries, now, thresholds.burstWindowMs);
  const bReads = recent.filter((e) => e.vaultTag === 'B' && (e.action === 'read' || e.action === 'write'));
  if (bReads.length >= thresholds.vaultBClusterCount) {
    return finding('vault_b_cluster', SEVERITY.WARN,
      'Vault B access cluster',
      `${bReads.length} Vault B (Part 2 / HRT) accesses in the last ${Math.round(thresholds.burstWindowMs / 60000)} min. Ensure Vault B is panic-closed when done.`);
  }
  return null;
}

// DETECTOR 6 — Unreadable (locked) entries present.
// getEntries() marks an entry locked:true when the current audit key can't
// unseal it — i.e. it was written under a different session/key. A mix of
// locked entries alongside readable ones can indicate activity from a session
// this operator does not control.
export function detectForeignEntries({ entries }) {
  const locked = entries.filter((e) => e.locked === true);
  const readable = entries.filter((e) => e.locked === false);
  if (locked.length > 0 && readable.length > 0) {
    return finding('foreign_entries', SEVERITY.INFO,
      'Unreadable log entries present',
      `${locked.length} log entr(ies) cannot be opened with the current key (written under a different session). Expected after a passphrase change; investigate otherwise.`);
  }
  return null;
}

// Run all detectors over injected signals. Returns findings sorted by severity
// (critical → warn → info). Null detector results are dropped. Chain integrity
// always reports (info when clean) so the panel can show an explicit "all good".
export function analyze({ entries = [], chain = null, now = Date.now(), thresholds = DEFAULT_THRESHOLDS }) {
  const raw = [
    detectChainTamper({ chain }),
    detectAccessBurst({ entries, now, thresholds }),
    detectOffHours({ entries, now, thresholds }),
    detectMassDelete({ entries, now, thresholds }),
    detectVaultBCluster({ entries, now, thresholds }),
    detectForeignEntries({ entries }),
  ].filter(Boolean);

  const rank = { [SEVERITY.CRITICAL]: 0, [SEVERITY.WARN]: 1, [SEVERITY.INFO]: 2 };
  raw.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const worst = raw.reduce((acc, f) => Math.min(acc, rank[f.severity]), 3);
  const status = worst === 0 ? SEVERITY.CRITICAL : worst === 1 ? SEVERITY.WARN : SEVERITY.INFO;
  return { status, findings: raw };
}

// Wire the real app signals and analyze. Thin — all logic lives in the pure
// detectors above. Read-only: pulls audit entries + chain verification only.
export async function runNinjabot({ thresholds = DEFAULT_THRESHOLDS } = {}) {
  const { getEntries, verifyChain } = await import('./auditLog');
  let entries = [];
  let chain = null;
  try { entries = await getEntries(); } catch { entries = []; }
  try { chain = await verifyChain(); } catch { chain = null; }
  return analyze({ entries, chain, now: Date.now(), thresholds });
}
