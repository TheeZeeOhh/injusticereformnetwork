import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord } from '../utils/storageEngine';
import { computeApptAlerts, computeHrtAlerts } from '../utils/clinicalAlerts';

// Read-only rule-based clinical alerts for the dashboard.
//
// Appointment alerts come from Vault A and always work after login. HRT refill
// alerts come from Vault B (42 CFR Part 2) and are computed ONLY when Vault B is
// unlocked — otherwise the section stays locked and nothing is read from it.
export default function ClinicalAlertsPanel() {
  const { vaultAKey, vaultBKey } = useAuthStore();
  const [appts, setAppts] = useState([]);
  const [clients, setClients] = useState([]);
  const [hrtAlerts, setHrtAlerts] = useState([]);

  // Vault A: appointments + client directory.
  useEffect(() => {
    async function load() {
      if (!vaultAKey) return;
      try {
        const a = await loadSecureRecord(vaultAKey, 'appointments', 'A');
        if (Array.isArray(a)) setAppts(a);
      } catch { /* none yet */ }
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch { /* none yet */ }
    }
    load();
  }, [vaultAKey]);

  // Vault B: probe HRT per client ONLY when Vault B is unlocked.
  useEffect(() => {
    async function loadHrt() {
      if (!vaultBKey || clients.length === 0) { setHrtAlerts([]); return; }
      const records = [];
      for (const c of clients) {
        const bareRef = c.id.replace('client_', '');
        try {
          const rec = await loadSecureRecord(vaultBKey, `hrt_${bareRef}`, 'B');
          if (rec && rec.refillWindow) records.push({ ref: bareRef, refillWindow: rec.refillWindow });
        } catch { /* no HRT for this client */ }
      }
      setHrtAlerts(computeHrtAlerts(records, new Date()));
    }
    loadHrt();
  }, [vaultBKey, clients]);

  const { missed, upcoming } = computeApptAlerts(appts, new Date());

  const nameFor = (patientId) => {
    const bare = String(patientId || '').replace('client_', '');
    const hit = clients.find((c) => c.id === patientId || c.id === `client_${bare}` || c.id.replace('client_', '') === bare);
    return hit?.name || bare || 'Unknown client';
  };
  const nameForRef = (ref) => {
    const hit = clients.find((c) => c.id.replace('client_', '') === ref);
    return hit?.name || ref;
  };

  const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="data-section">
      <div className="data-panel glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Clinical Alerts</h2>

        {/* Missed appointments */}
        <AlertSection
          title="Missed appointments"
          color="#f87171"
          count={missed.length}
          empty="No missed appointments."
        >
          {missed.map((a, i) => (
            <AlertRow key={i} color="#f87171"
              main={nameFor(a.patientId)}
              sub={`was scheduled ${fmt(a.startTime)}`} />
          ))}
        </AlertSection>

        {/* Upcoming within 24h */}
        <AlertSection
          title="Upcoming (next 24h)"
          color="var(--gold)"
          count={upcoming.length}
          empty="Nothing in the next 24 hours."
        >
          {upcoming.map((a, i) => (
            <AlertRow key={i} color="var(--gold)"
              main={nameFor(a.patientId)}
              sub={fmt(a.startTime)} />
          ))}
        </AlertSection>

        {/* HRT refills — Vault B gated */}
        <AlertSection
          title="HRT refills due"
          color="var(--ember)"
          count={vaultBKey ? hrtAlerts.length : null}
          empty="No refills due in the next 7 days."
          locked={!vaultBKey}
        >
          {vaultBKey && hrtAlerts.map((h, i) => (
            <AlertRow key={i} color="var(--ember)"
              main={nameForRef(h.ref)}
              sub={h.dueIn < 0 ? `overdue by ${Math.abs(h.dueIn)} day(s) (${h.refillWindow})` : (h.dueIn === 0 ? `due today (${h.refillWindow})` : `due in ${h.dueIn} day(s) (${h.refillWindow})`)} />
          ))}
        </AlertSection>
      </div>
    </div>
  );
}

function AlertSection({ title, color, count, empty, locked, children }) {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
        <span style={{ color, fontFamily: 'var(--font-serif)', fontWeight: 'bold' }}>{title}</span>
        {count != null && (
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', background: 'var(--charcoal-lighter)', color, padding: '1px 8px', borderRadius: '10px' }}>{count}</span>
        )}
      </div>
      {locked ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          🔒 Unlock Vault B to check HRT refills.
        </div>
      ) : (count === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>{children}</div>
      ))}
    </div>
  );
}

function AlertRow({ color, main, sub }) {
  return (
    <div style={{ background: 'var(--charcoal)', borderLeft: `3px solid ${color}`, padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
      <div style={{ color: 'var(--bone)', fontSize: '0.85rem', fontWeight: 'bold' }}>{main}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{sub}</div>
    </div>
  );
}
