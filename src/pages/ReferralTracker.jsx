import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { REFERRAL_STATUSES, summarizeReferrals, activeAgencies, validateAgency, validateReferral } from '../utils/referrals';

// Inter-Agency Referral. Two parts:
//  - Agency Network: partner agencies we refer to (non-PHI, referral_agencies).
//  - Referrals: a client sent to an agency with a status lifecycle. PHI —
//    encrypted per client in Vault A under referrals_<clientId>.
const AGENCIES_ID = 'referral_agencies';
const today = () => new Date().toISOString().slice(0, 10);

const inputStyle = {
  padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)',
  color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
};
const labelStyle = { fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' };
const ghostBtn = { background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' };

export default function ReferralTracker() {
  const { vaultAKey } = useAuthStore();
  const [tab, setTab] = useState('referrals'); // 'referrals' | 'agencies'
  const [agencies, setAgencies] = useState([]);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');

  // Agency form
  const [agencyForm, setAgencyForm] = useState({ name: '', services: '', contact: '', phone: '' });

  // Referral state
  const [clientId, setClientId] = useState('');
  const [referrals, setReferrals] = useState([]);
  const [refForm, setRefForm] = useState({ agencyId: '', reason: '', date: today() });

  useEffect(() => {
    async function load() {
      if (!vaultAKey) return;
      try {
        const ag = await loadSecureRecord(vaultAKey, AGENCIES_ID, 'A');
        if (Array.isArray(ag)) setAgencies(ag);
      } catch { /* none */ }
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch { /* none */ }
    }
    load();
  }, [vaultAKey]);

  // ---- Agencies ----
  const persistAgencies = async (list) => { setAgencies(list); await saveSecureRecord(vaultAKey, AGENCIES_ID, list, 'A'); };

  const addAgency = async () => {
    setError('');
    if (!vaultAKey) { setError('Unlock the vault first.'); return; }
    const check = validateAgency(agencyForm);
    if (!check.ok) { setError(check.error); return; }
    const entry = { id: `agc_${Date.now()}`, name: agencyForm.name.trim(), services: agencyForm.services.trim(), contact: agencyForm.contact.trim(), phone: agencyForm.phone.trim(), status: 'Active' };
    try { await persistAgencies([entry, ...agencies]); setAgencyForm({ name: '', services: '', contact: '', phone: '' }); }
    catch (err) { setError(err?.message || 'Save failed.'); }
  };
  const toggleAgency = async (id) => {
    const list = agencies.map((a) => a.id === id ? { ...a, status: a.status === 'Active' ? 'Inactive' : 'Active' } : a);
    await persistAgencies(list);
  };
  const removeAgency = async (id) => { await persistAgencies(agencies.filter((a) => a.id !== id)); };

  // ---- Referrals ----
  const selectClient = async (id) => {
    setClientId(id); setReferrals([]); setError('');
    if (!id || !vaultAKey) return;
    try {
      const list = await loadSecureRecord(vaultAKey, `referrals_${id}`, 'A');
      if (Array.isArray(list)) setReferrals(list);
    } catch { /* none */ }
  };
  const persistReferrals = async (list) => { setReferrals(list); await saveSecureRecord(vaultAKey, `referrals_${clientId}`, list, 'A'); };

  const addReferral = async () => {
    setError('');
    if (!vaultAKey) { setError('Unlock the vault first.'); return; }
    if (!clientId) { setError('Select a client first.'); return; }
    const check = validateReferral(refForm);
    if (!check.ok) { setError(check.error); return; }
    const agency = agencies.find((a) => a.id === refForm.agencyId);
    const entry = { id: `ref_${Date.now()}`, agencyId: refForm.agencyId, agencyName: agency?.name || '—', reason: refForm.reason.trim(), date: refForm.date || today(), status: 'Sent' };
    try { await persistReferrals([entry, ...referrals]); setRefForm({ agencyId: '', reason: '', date: today() }); }
    catch (err) { setError(err?.message || 'Save failed.'); }
  };
  const setReferralStatus = async (id, status) => {
    await persistReferrals(referrals.map((r) => r.id === id ? { ...r, status } : r));
  };
  const removeReferral = async (id) => { await persistReferrals(referrals.filter((r) => r.id !== id)); };

  const summary = summarizeReferrals(referrals);
  const destinations = activeAgencies(agencies);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Inter-Agency Referral</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Refer clients to partner agencies and track outcomes. Referrals are encrypted per client.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--charcoal-lighter)', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-color)', maxWidth: '360px' }}>
        {[['referrals', 'Referrals'], ['agencies', 'Agency Network']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setError(''); }} style={{ flex: 1, padding: '0.5rem', background: tab === id ? 'var(--charcoal)' : 'transparent', color: tab === id ? 'var(--gold)' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>{label}</button>
        ))}
      </div>

      {error && <div style={{ color: '#fda4af', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{error}</div>}

      {tab === 'agencies' ? (
        <>
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Add a partner agency</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Name"><input value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} placeholder="e.g. Baltimore Housing Coalition" style={inputStyle} /></Field>
              <Field label="Services"><input value={agencyForm.services} onChange={(e) => setAgencyForm({ ...agencyForm, services: e.target.value })} placeholder="e.g. Emergency housing" style={inputStyle} /></Field>
              <Field label="Contact"><input value={agencyForm.contact} onChange={(e) => setAgencyForm({ ...agencyForm, contact: e.target.value })} style={inputStyle} /></Field>
              <Field label="Phone"><input value={agencyForm.phone} onChange={(e) => setAgencyForm({ ...agencyForm, phone: e.target.value })} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={addAgency} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>+ Add Agency</button>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
            {agencies.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontFamily: 'var(--font-mono)' }}>No partner agencies yet.</div>
            ) : agencies.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <span style={{ color: 'var(--bone)', fontWeight: 'bold' }}>{a.name}</span>
                  {a.services && <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{a.services}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: a.status === 'Active' ? '#4ade80' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{a.status}</span>
                  <button onClick={() => toggleAgency(a.id)} style={ghostBtn}>{a.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => removeAgency(a.id)} style={{ ...ghostBtn, color: '#fda4af' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <select value={clientId} onChange={(e) => selectClient(e.target.value)} style={{ ...inputStyle, maxWidth: '280px' }}>
            <option value="">— Select a client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>)}
          </select>

          {clientId && (
            <>
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>New referral</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <Field label="Destination agency">
                    <select value={refForm.agencyId} onChange={(e) => setRefForm({ ...refForm, agencyId: e.target.value })} style={inputStyle}>
                      <option value="">— Select —</option>
                      {destinations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Reason"><input value={refForm.reason} onChange={(e) => setRefForm({ ...refForm, reason: e.target.value })} placeholder="e.g. Emergency housing" style={inputStyle} /></Field>
                  <Field label="Date"><input type="date" value={refForm.date} onChange={(e) => setRefForm({ ...refForm, date: e.target.value })} style={inputStyle} /></Field>
                </div>
                {destinations.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>No active agencies — add one in the Agency Network tab first.</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={addReferral} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>+ Create Referral</button>
                </div>
              </div>

              {/* Summary strip */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {REFERRAL_STATUSES.map((s) => (
                  <span key={s} style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', padding: '2px 10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>{s}: {summary[s]}</span>
                ))}
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
                {referrals.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontFamily: 'var(--font-mono)' }}>No referrals for this client yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem' }}>Date</th><th style={{ padding: '0.6rem' }}>Agency</th><th style={{ padding: '0.6rem' }}>Reason</th><th style={{ padding: '0.6rem' }}>Status</th><th style={{ padding: '0.6rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                          <td style={{ padding: '0.6rem' }}>{r.date}</td>
                          <td style={{ padding: '0.6rem', color: 'var(--gold)' }}>{r.agencyName}</td>
                          <td style={{ padding: '0.6rem' }}>{r.reason || '—'}</td>
                          <td style={{ padding: '0.6rem' }}>
                            <select value={r.status} onChange={(e) => setReferralStatus(r.id, e.target.value)} style={{ ...inputStyle, padding: '0.3rem' }}>
                              {REFERRAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                            <button onClick={() => removeReferral(r.id)} style={{ ...ghostBtn, color: '#fda4af' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
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
