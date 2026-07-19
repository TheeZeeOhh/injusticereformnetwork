import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { CREDENTIAL_TYPES, credentialStatus, summarizeCredentials, validateCredential, daysUntil } from '../utils/credentials';

// Credential Monitoring — track staff credentials/certifications and their
// expiry, auto-flagging expired / expiring-soon. Standalone (not tied to the
// hiring board). Non-PHI operational data, stored encrypted in Vault A under
// the 'credentials' record for consistency with the app's single store.
const RECORD_ID = 'credentials';

const inputStyle = {
  padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)',
  color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
};
const labelStyle = { fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' };

const STATUS_META = {
  expired: { label: 'Expired', color: '#f87171' },
  urgent: { label: '≤30 days', color: 'var(--ember)' },
  soon: { label: '≤60 days', color: 'var(--gold)' },
  valid: { label: 'Valid', color: '#4ade80' },
  unknown: { label: 'No expiry', color: 'var(--text-tertiary)' },
};

export default function CredentialMonitor() {
  const { vaultAKey } = useAuthStore();
  const [creds, setCreds] = useState([]);
  const [form, setForm] = useState({ staffName: '', credentialType: CREDENTIAL_TYPES[0], issuer: '', issuedDate: '', expiryDate: '', note: '' });
  const [error, setError] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    async function load() {
      if (!vaultAKey) return;
      try {
        const list = await loadSecureRecord(vaultAKey, RECORD_ID, 'A');
        if (Array.isArray(list)) setCreds(list);
      } catch { /* none yet */ }
    }
    load();
  }, [vaultAKey]);

  const persist = async (list) => {
    setCreds(list);
    await saveSecureRecord(vaultAKey, RECORD_ID, list, 'A');
  };

  const addCredential = async () => {
    setError('');
    if (!vaultAKey) { setError('Unlock the vault first.'); return; }
    const check = validateCredential(form);
    if (!check.ok) { setError(check.error); return; }
    const entry = {
      id: `cred_${Date.now()}`,
      staffName: form.staffName.trim(),
      credentialType: form.credentialType,
      issuer: form.issuer.trim(),
      issuedDate: form.issuedDate,
      expiryDate: form.expiryDate,
      note: form.note.trim(),
    };
    try {
      await persist([entry, ...creds]);
      setForm({ staffName: '', credentialType: CREDENTIAL_TYPES[0], issuer: '', issuedDate: '', expiryDate: '', note: '' });
    } catch (err) {
      setError(err?.message || 'Save failed.');
    }
  };

  const removeCredential = async (id) => {
    try { await persist(creds.filter((c) => c.id !== id)); }
    catch (err) { setError(err?.message || 'Delete failed.'); }
  };

  const now = new Date();
  const summary = summarizeCredentials(creds, now);

  // Sort soonest-expiry first; unknowns last.
  const sorted = [...creds].sort((a, b) => {
    const da = daysUntil(a.expiryDate, now);
    const db = daysUntil(b.expiryDate, now);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  const rows = flaggedOnly
    ? sorted.filter((c) => ['expired', 'urgent', 'soon'].includes(credentialStatus(c, now)))
    : sorted;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Credential Monitoring</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Track staff credentials and get flagged before they expire.
        </p>
      </div>

      {/* Monitoring strip */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {['expired', 'urgent', 'soon', 'valid', 'unknown'].map((k) => (
          <div key={k} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: `1px solid ${STATUS_META[k].color}`, background: 'var(--charcoal-lighter)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            <span style={{ color: STATUS_META[k].color, fontWeight: 'bold' }}>{summary[k]}</span>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{STATUS_META[k].label}</span>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Add a credential</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <Field label="Staff name"><input value={form.staffName} onChange={(e) => setForm({ ...form, staffName: e.target.value })} placeholder="e.g. Jordan Lee, RN" style={inputStyle} /></Field>
          <Field label="Type">
            <select value={form.credentialType} onChange={(e) => setForm({ ...form, credentialType: e.target.value })} style={inputStyle}>
              {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Issuer"><input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="e.g. MD Board of Nursing" style={inputStyle} /></Field>
          <Field label="Issued date"><input type="date" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} style={inputStyle} /></Field>
          <Field label="Expiry date"><input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} style={inputStyle} /></Field>
          <Field label="Note"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
        </div>
        {error && <div style={{ color: '#fda4af', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={addCredential} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>+ Add Credential</button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Show only expiring / expired
        </label>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontFamily: 'var(--font-mono)' }}>No credentials {flaggedOnly ? 'flagged' : 'on file'}.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.6rem' }}>Staff</th>
                <th style={{ padding: '0.6rem' }}>Type</th>
                <th style={{ padding: '0.6rem' }}>Expiry</th>
                <th style={{ padding: '0.6rem' }}>Status</th>
                <th style={{ padding: '0.6rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const st = credentialStatus(c, now);
                const d = daysUntil(c.expiryDate, now);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                    <td style={{ padding: '0.6rem' }}>{c.staffName}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--gold)' }}>{c.credentialType}</td>
                    <td style={{ padding: '0.6rem' }}>{c.expiryDate || '—'}{d != null && st !== 'valid' && st !== 'unknown' ? ` (${d < 0 ? `${Math.abs(d)}d ago` : `${d}d`})` : ''}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <span style={{ fontSize: '0.7rem', color: STATUS_META[st].color, background: 'var(--charcoal-lighter)', padding: '2px 8px', borderRadius: '10px', border: `1px solid ${STATUS_META[st].color}` }}>{STATUS_META[st].label}</span>
                    </td>
                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                      <button onClick={() => removeCredential(c.id)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fda4af', padding: '0.25rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
