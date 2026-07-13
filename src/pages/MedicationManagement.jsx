import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Medication Management — medication tracking & reconciliation (NOT prescribing).
//
// Navigators record medications a client is ALREADY prescribed by their own
// licensed provider, to support continuity of care (refill windows, gaps,
// coordination). This is a RECORD, not a prescription: nothing is transmitted to
// a pharmacy or payer, no e-prescribing, no controlled-substance workflow.
//
// Vault routing (per record): general medications live in Vault A. Sensitive
// medications — HRT, MAT / substance-use treatment (42 CFR Part 2), anything the
// Navigator marks sensitive — live in Vault B, so they are separately encrypted
// and hidden when Vault B is closed.
const INDEX_A = 'med_index';   // Vault A index
const INDEX_B = 'med_index_b'; // Vault B index

// MAT (medication-assisted treatment for substance use) is folded into this
// module rather than a separate one, so all sensitive medication records live in
// one place. MAT records are 42 CFR Part 2 data and MUST go to Vault B — typing a
// MAT medication auto-flags the record sensitive. This is a RECORD of a client's
// existing MAT, not prescribing or dosing authority.
export const MAT_MEDS = ['buprenorphine', 'suboxone', 'subutex', 'methadone', 'naltrexone', 'vivitrol', 'sublocade'];
export function isMatMed(name) {
  const n = (name || '').toLowerCase();
  return MAT_MEDS.some((m) => n.includes(m));
}

const EMPTY = {
  clientRef: '', medication: '', dose: '', frequency: '',
  prescriber: '', pharmacy: '', program: '', refillDate: '', status: 'Active', sensitive: false
};

export default function MedicationManagement() {
  const { vaultAKey, vaultBKey } = useAuthStore();
  const [aList, setAList] = useState([]);
  const [bList, setBList] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);

  const vaultAOpen = !!vaultAKey;
  const vaultBOpen = !!vaultBKey;

  // Load Vault A meds when logged in.
  useEffect(() => {
    async function load() {
      if (!vaultAKey) { setAList([]); return; }
      try {
        const idx = await loadSecureRecord(vaultAKey, INDEX_A, 'A');
        if (idx) setAList(idx);
      } catch {
        setStatus('Could not decrypt medication index (Vault A).');
      }
    }
    load();
  }, [vaultAKey]);

  // Load Vault B meds only when Vault B is open; clear them when it closes.
  useEffect(() => {
    async function load() {
      if (!vaultBKey) { setBList([]); return; }
      try {
        const idx = await loadSecureRecord(vaultBKey, INDEX_B, 'B');
        if (idx) setBList(idx);
      } catch {
        setStatus('Could not decrypt sensitive medication index (Vault B).');
      }
    }
    load();
  }, [vaultBKey]);

  const update = (field, value) => {
    const next = { ...form, [field]: value };
    // Typing a MAT medication auto-flags the record sensitive (Vault B, 42 CFR
    // Part 2). The Navigator can still manually mark other meds sensitive.
    if (field === 'medication' && isMatMed(value)) next.sensitive = true;
    setForm(next);
  };

  const handleAdd = async () => {
    if (!form.clientRef.trim() || !form.medication.trim()) {
      setStatus('Client reference and medication are required.');
      return;
    }
    const toB = form.sensitive;
    if (toB && !vaultBKey) {
      setStatus('This medication is marked sensitive but Vault B is closed. Unlock Vault B first.');
      return;
    }
    if (!toB && !vaultAKey) return;

    const key = toB ? vaultBKey : vaultAKey;
    const tag = toB ? 'B' : 'A';
    const indexId = toB ? INDEX_B : INDEX_A;
    const list = toB ? bList : aList;

    const entry = { id: `MED-${Date.now()}`, ...form };
    const updated = [entry, ...list];
    try {
      await saveSecureRecord(key, indexId, updated, tag);
      if (toB) setBList(updated); else setAList(updated);
      setForm(EMPTY);
      setShowForm(false);
      setStatus(`Saved ${entry.medication} to Vault ${tag}.`);
    } catch (err) {
      setStatus('Save failed: ' + err.message);
    }
  };

  const discontinue = async (item) => {
    const toB = item.sensitive;
    const key = toB ? vaultBKey : vaultAKey;
    if (!key) return;
    const tag = toB ? 'B' : 'A';
    const indexId = toB ? INDEX_B : INDEX_A;
    const list = toB ? bList : aList;
    const updated = list.map((m) => m.id === item.id ? { ...m, status: 'Discontinued' } : m);
    try {
      await saveSecureRecord(key, indexId, updated, tag);
      if (toB) setBList(updated); else setAList(updated);
      setStatus(`Marked ${item.medication} discontinued.`);
    } catch (err) {
      setStatus('Update failed: ' + err.message);
    }
  };

  // Merge visible meds: Vault A always (if open) + Vault B only when open.
  const all = [...aList, ...bList];
  const visible = query.trim()
    ? all.filter((m) =>
        m.medication.toLowerCase().includes(query.trim().toLowerCase()) ||
        m.clientRef.toLowerCase().includes(query.trim().toLowerCase()))
    : all;

  return (
    <div className="data-panel glass-panel">
      <h2>Medication Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Medication tracking &amp; reconciliation. Records what a client is already
        prescribed by their provider — this is a record, not a prescription.
        Nothing is transmitted to a pharmacy.
      </p>

      {!vaultBOpen && (
        <div style={{ background: 'rgba(225,29,72,0.10)', borderLeft: '4px solid #e11d48', padding: '0.75rem 1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          🔒 Vault B closed — sensitive medications (HRT, MAT / 42 CFR Part 2) are hidden. Unlock Vault B to view or add them.
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by client or medication..." style={{ flex: 1, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)} disabled={!vaultAOpen}>
          {showForm ? 'Cancel' : '+ Add Medication'}
        </button>
      </div>

      {showForm && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <input placeholder="Client ref *" value={form.clientRef} onChange={(e) => update('clientRef', e.target.value)} style={inp} />
          <input placeholder="Medication *" value={form.medication} onChange={(e) => update('medication', e.target.value)} style={inp} />
          <input placeholder="Dose" value={form.dose} onChange={(e) => update('dose', e.target.value)} style={inp} />
          <input placeholder="Frequency" value={form.frequency} onChange={(e) => update('frequency', e.target.value)} style={inp} />
          <input placeholder="Prescriber" value={form.prescriber} onChange={(e) => update('prescriber', e.target.value)} style={inp} />
          <input placeholder="Pharmacy" value={form.pharmacy} onChange={(e) => update('pharmacy', e.target.value)} style={inp} />
          <input placeholder="Program / clinic (MAT)" value={form.program} onChange={(e) => update('program', e.target.value)} style={inp} />
          <input type="date" title="Next refill" value={form.refillDate} onChange={(e) => update('refillDate', e.target.value)} style={inp} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--bone)' }}>
            <input type="checkbox" checked={form.sensitive} onChange={(e) => update('sensitive', e.target.checked)} />
            Sensitive (HRT / MAT → Vault B)
          </label>
          {isMatMed(form.medication) && (
            <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: '#fda4af', fontFamily: 'var(--font-mono)' }}>
              MAT medication detected — this record is 42 CFR Part 2 and will be stored in Vault B.
            </div>
          )}
          <button className="btn-primary" onClick={handleAdd} style={{ gridColumn: '1 / -1' }}>Save Medication</button>
        </div>
      )}

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={th}>Client</th>
              <th style={th}>Medication</th>
              <th style={th}>Dose / Freq</th>
              <th style={th}>Next Refill</th>
              <th style={th}>Vault</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((med) => (
              <tr key={med.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{med.clientRef}</td>
                <td style={{ padding: '1rem' }}>{med.medication}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{med.dose}{med.frequency ? ` — ${med.frequency}` : ''}</td>
                <td style={{ padding: '1rem' }}>{med.refillDate || '—'}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: med.sensitive ? '#fda4af' : 'var(--text-secondary)' }}>
                    {med.sensitive ? 'B · sensitive' : 'A'}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ background: med.status === 'Active' ? 'rgba(72, 187, 120, 0.2)' : 'rgba(229, 62, 62, 0.2)', color: med.status === 'Active' ? '#48bb78' : '#e53e3e', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {med.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  {med.status === 'Active' && (
                    <button onClick={() => discontinue(med)} style={{ background: 'transparent', border: '1px solid var(--border-color)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Discontinue</button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No medications on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.6rem', borderRadius: '4px', marginTop: '1rem' }}>{status}</div>
      )}
    </div>
  );
}

const inp = { padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' };
const th = { padding: '1rem' };
