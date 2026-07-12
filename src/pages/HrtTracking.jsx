import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Vault B (BridgeVault) — HRT "No-Interruption" continuity tracking.
// Maryland Trans Shield Act posture: gender-affirming care data is local-first,
// encrypted under the SEPARATE Vault B key, and inaccessible when Vault B is
// panic-closed. Records are keyed 'hrt_<clientRef>'.
export default function HrtTracking() {
  const { vaultBKey } = useAuthStore();
  const [clientRef, setClientRef] = useState('');
  const [record, setRecord] = useState({
    chosenName: '',
    genderMarkerHistory: '',
    regimen: '',
    refillWindow: '',
    prescriber: '',
    pharmacy: ''
  });
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const vaultOpen = !!vaultBKey;

  // Load an existing HRT record when a client reference is entered.
  useEffect(() => {
    async function load() {
      if (!vaultBKey || !clientRef.trim()) return;
      try {
        const stored = await loadSecureRecord(vaultBKey, `hrt_${clientRef.trim()}`, 'B');
        if (stored) {
          setRecord(stored);
          setStatus('Existing Vault B record loaded.');
        }
      } catch {
        setStatus('Could not decrypt record with the current Vault B key.');
      }
    }
    load();
  }, [vaultBKey, clientRef]);

  const update = (field, value) => setRecord({ ...record, [field]: value });

  const handleSave = async () => {
    if (!vaultBKey) { setStatus('Vault B is closed. Cannot save sensitive records.'); return; }
    if (!clientRef.trim()) { setStatus('Enter a client reference ID first.'); return; }
    setIsSaving(true);
    try {
      await saveSecureRecord(vaultBKey, `hrt_${clientRef.trim()}`, record, 'B');
      setStatus('HRT record encrypted and saved to Vault B.');
    } catch (err) {
      setStatus('Save failed: ' + err.message);
    }
    setIsSaving(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>HRT Continuity Tracker</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
          Vault B · Maryland Trans Shield Act · Local-first, separately encrypted
        </p>
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Vault B is currently CLOSED (BridgeVault panic-lock active). Sensitive HRT records cannot be read or written until you re-authenticate.
        </div>
      )}

      <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: vaultOpen ? 1 : 0.5, pointerEvents: vaultOpen ? 'auto' : 'none' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Client Reference ID</label>
          <input type="text" value={clientRef} onChange={e => setClientRef(e.target.value)} placeholder="e.g. PT-8942" style={inputStyle} />
        </div>

        <h2 style={sectionStyle}>Gender Marker & Chosen Name</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Chosen Name / Alias</label>
            <input type="text" value={record.chosenName} onChange={e => update('chosenName', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Gender Marker History / Notes</label>
            <input type="text" value={record.genderMarkerHistory} onChange={e => update('genderMarkerHistory', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <h2 style={sectionStyle}>Regimen & Continuity</h2>
        <div>
          <label style={labelStyle}>Current Regimen / Dosage</label>
          <input type="text" value={record.regimen} onChange={e => update('regimen', e.target.value)} placeholder="e.g. Estradiol 4mg daily" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Refill Window Date</label>
            <input type="date" value={record.refillWindow} onChange={e => update('refillWindow', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Prescriber</label>
            <input type="text" value={record.prescriber} onChange={e => update('prescriber', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Pharmacy Contact</label>
          <input type="text" value={record.pharmacy} onChange={e => update('pharmacy', e.target.value)} style={inputStyle} />
        </div>

        <button onClick={handleSave} disabled={isSaving || !vaultOpen} className="btn-primary" style={{ background: '#e11d48', color: 'white', fontWeight: 'bold', padding: '0.75rem', alignSelf: 'flex-start' }}>
          {isSaving ? 'Encrypting…' : 'Encrypt & Save to Vault B'}
        </button>
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
const sectionStyle = { color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.1rem' };
