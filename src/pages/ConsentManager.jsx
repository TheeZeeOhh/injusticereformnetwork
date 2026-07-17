import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Vault B — 42 CFR Part 2 consent management. Consent records are real,
// persisted, encrypted under the Vault B key, and enumerable via an index so a
// consent actually gates access to the corresponding sensitive record class.
// Index is stored under 'consent_index'; each record under 'consent_<id>'.
const INDEX_ID = 'consent_index';

export default function ConsentManager() {
  const { vaultBKey } = useAuthStore();
  const [index, setIndex] = useState([]);
  const [form, setForm] = useState({
    clientRef: '',
    category: '42cfr',
    scope: '',
    revocationDate: ''
  });
  const [status, setStatus] = useState('');

  const vaultOpen = !!vaultBKey;

  useEffect(() => {
    async function loadIndex() {
      if (!vaultBKey) return;
      try {
        const idx = await loadSecureRecord(vaultBKey, INDEX_ID, 'B');
        if (idx) setIndex(idx);
      } catch {
        setStatus('Could not decrypt consent index with the current Vault B key.');
      }
    }
    loadIndex();
  }, [vaultBKey]);

  const update = (field, value) => setForm({ ...form, [field]: value });

  const handleGrant = async () => {
    if (!vaultBKey) { setStatus('Vault B is closed. Cannot mint consent.'); return; }
    if (!form.clientRef.trim() || !form.scope.trim()) {
      setStatus('Client reference and scope are required.');
      return;
    }
    const id = `consent_${form.clientRef.trim()}_${Date.now()}`;
    const record = {
      ...form,
      id,
      status: 'GRANTED',
      grantedAt: new Date().toISOString()
    };
    try {
      await saveSecureRecord(vaultBKey, id, record, 'B');
      const summary = { id, clientRef: form.clientRef.trim(), category: form.category, status: 'GRANTED', grantedAt: record.grantedAt };
      const updatedIndex = [...index, summary];
      setIndex(updatedIndex);
      await saveSecureRecord(vaultBKey, INDEX_ID, updatedIndex, 'B');
      setStatus(`Consent minted and stored in Vault B (${form.category}).`);
      setForm({ clientRef: '', category: '42cfr', scope: '', revocationDate: '' });
    } catch (err) {
      setStatus('Failed to store consent: ' + err.message);
    }
  };

  const handleRevoke = async (id) => {
    if (!vaultBKey) return;
    const updatedIndex = index.map(c => c.id === id ? { ...c, status: 'REVOKED' } : c);
    setIndex(updatedIndex);
    try {
      const rec = await loadSecureRecord(vaultBKey, id, 'B');
      if (rec) {
        await saveSecureRecord(vaultBKey, id, { ...rec, status: 'REVOKED', revokedAt: new Date().toISOString() }, 'B');
      }
      await saveSecureRecord(vaultBKey, INDEX_ID, updatedIndex, 'B');
      setStatus('Consent revoked.');
    } catch (err) {
      setStatus('Revoke failed: ' + err.message);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>Consent Manager</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
          Vault B · 42 CFR Part 2 · Telehealth BAA · consent-gated access
        </p>
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Vault B is CLOSED. Consent records cannot be read or minted until you re-authenticate.
        </div>
      )}

      <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: vaultOpen ? 1 : 0.5, pointerEvents: vaultOpen ? 'auto' : 'none' }}>
        <h2 style={sectionStyle}>Mint New Consent</h2>
        <div>
          <label style={labelStyle}>Client Reference ID</label>
          <input type="text" value={form.clientRef} onChange={e => update('clientRef', e.target.value)} placeholder="e.g. PT-8942" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Consent Category</label>
          <select value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle}>
            <option value="42cfr">42 CFR Part 2 (Substance Use Disorder)</option>
            <option value="telehealth">Telehealth / Jitsi BAA Session</option>
            <option value="data-sharing">External Data Sharing (Court Order)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Scope &amp; Purpose of Disclosure</label>
          <textarea value={form.scope} onChange={e => update('scope', e.target.value)} placeholder="Specifically who, what, and why…" style={{ ...inputStyle, minHeight: '70px' }} />
        </div>
        <div>
          <label style={labelStyle}>Revocation Date (optional)</label>
          <input type="date" value={form.revocationDate} onChange={e => update('revocationDate', e.target.value)} style={inputStyle} />
        </div>
        <button onClick={handleGrant} disabled={!vaultOpen} className="btn-primary" style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 'bold', padding: '0.75rem', alignSelf: 'flex-start' }}>
          Sign &amp; Store Consent
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={sectionStyle}>Consent Ledger</h2>
        {index.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>No consent records stored.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginTop: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Client</th>
                <th style={{ padding: '0.5rem' }}>Category</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
                <th style={{ padding: '0.5rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {index.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                  <td style={{ padding: '0.5rem' }}>{c.clientRef}</td>
                  <td style={{ padding: '0.5rem' }}>{c.category}</td>
                  <td style={{ padding: '0.5rem', color: c.status === 'REVOKED' ? '#fda4af' : '#4ade80' }}>{c.status}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {c.status !== 'REVOKED' && vaultOpen && (
                      <button onClick={() => handleRevoke(c.id)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fda4af', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px' }}>
          {status}
        </div>
      )}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' };
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' };
const sectionStyle = { color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.1rem' };
