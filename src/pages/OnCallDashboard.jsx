import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// On-call roster. Operational (not client PHI) → Vault A, single record. Editable
// primary + secondary assignments; empty until set (no mock clinicians).
const ONCALL_KEY = 'oncall_roster';
const EMPTY = { primary: { name: '', specialty: '', shiftEnds: '' }, secondary: { name: '', specialty: '', shiftEnds: '' } };

export default function OnCallDashboard() {
  const { vaultAKey } = useAuthStore();
  const [roster, setRoster] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => {
    if (!vaultAKey) { setRoster(EMPTY); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await loadSecureRecord(vaultAKey, ONCALL_KEY, 'A');
        if (!cancelled && r && r.primary) setRoster(r);
      } catch { /* keep EMPTY */ }
    })();
    return () => { cancelled = true; };
  }, [vaultAKey]);

  const startEdit = () => { setDraft(roster); setEditing(true); };
  const save = async () => {
    setRoster(draft);
    setEditing(false);
    if (vaultAKey) await saveSecureRecord(vaultAKey, ONCALL_KEY, draft, 'A');
  };

  const tier = (t) => (t.name ? 'assigned' : 'unassigned');

  return (
    <div className="data-panel glass-panel">
      <h2>On-Call Dashboard</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        On-call clinical staff and emergency dispatch routing.
      </p>

      {!vaultAKey ? (
        <div style={{ color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Unlock the vault to view or set the on-call roster.
        </div>
      ) : (
        <>
          <button className="btn-primary" onClick={editing ? save : startEdit} style={{ padding: '0.4rem 1rem', marginBottom: '1rem' }}>
            {editing ? 'Save Roster' : 'Edit Roster'}
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {[['primary', 'Current Primary On-Call', '#48bb78'], ['secondary', 'Secondary Backup (Tier 2)', 'var(--color-primary)']].map(([key, title, color]) => {
              const t = editing ? draft[key] : roster[key];
              return (
                <div key={key} style={{ background: 'var(--bg-color-surface)', padding: '2rem', borderRadius: '8px', borderLeft: `4px solid ${color}` }}>
                  <h3 style={{ marginTop: 0, color }}>{title}</h3>
                  {editing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {['name', 'specialty', 'shiftEnds'].map((f) => (
                        <input key={f} placeholder={f} value={t[f]} onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], [f]: e.target.value } })} style={inp} />
                      ))}
                    </div>
                  ) : (
                    <>
                      <p><strong>Name:</strong> {t.name || '— (unassigned)'}</p>
                      <p><strong>Specialty:</strong> {t.specialty || '—'}</p>
                      <p><strong>Shift Ends:</strong> {t.shiftEnds || '—'}</p>
                      <button className="btn-primary" disabled={tier(t) === 'unassigned'} style={{ marginTop: '1rem', background: key === 'primary' ? '#e53e3e' : 'transparent', border: key === 'primary' ? 'none' : '1px solid var(--color-primary)', color: key === 'primary' ? '#fff' : 'var(--color-primary)', opacity: tier(t) === 'unassigned' ? 0.5 : 1 }}>
                        {key === 'primary' ? '🚨 Page Immediately' : 'Notify Standby'}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const inp = { padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' };
