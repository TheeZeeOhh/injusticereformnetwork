import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { STIPEND_TYPES, stipendTotal, summarizeByType, validateStipend } from '../utils/stipends';

// Per-client stipend / incentive tracker. Logs incentives GIVEN TO a client
// (gift card, transit, cash, food) as a per-client history. PHI: stored
// encrypted in Vault A under stipends_<clientId>. Separate from the budget-drawn
// Voucher Program.
const today = () => new Date().toISOString().slice(0, 10);

const inputStyle = {
  padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)',
  color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
};

export default function StipendTracker() {
  const { vaultAKey } = useAuthStore();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [stipends, setStipends] = useState([]);
  const [form, setForm] = useState({ type: STIPEND_TYPES[0], amount: '', reason: '', date: today(), note: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDir() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch { /* none yet */ }
    }
    loadDir();
  }, [vaultAKey]);

  const selectClient = async (id) => {
    setClientId(id);
    setStipends([]);
    setError('');
    if (!id || !vaultAKey) return;
    try {
      const list = await loadSecureRecord(vaultAKey, `stipends_${id}`, 'A');
      if (Array.isArray(list)) setStipends(list);
    } catch { /* none yet */ }
  };

  const persist = async (list) => {
    setStipends(list);
    await saveSecureRecord(vaultAKey, `stipends_${clientId}`, list, 'A');
  };

  const addStipend = async () => {
    setError('');
    if (!vaultAKey) { setError('Unlock the vault first.'); return; }
    if (!clientId) { setError('Select a client first.'); return; }
    const check = validateStipend(form);
    if (!check.ok) { setError(check.error); return; }
    const entry = {
      id: `stp_${Date.now()}`,
      type: form.type,
      amount: form.amount === '' ? '' : Number(form.amount),
      reason: form.reason.trim(),
      date: form.date || today(),
      note: form.note.trim(),
    };
    try {
      await persist([entry, ...stipends]);
      setForm({ type: STIPEND_TYPES[0], amount: '', reason: '', date: today(), note: '' });
    } catch (err) {
      setError(err?.message || 'Save failed.');
    }
  };

  const removeStipend = async (id) => {
    try { await persist(stipends.filter((s) => s.id !== id)); }
    catch (err) { setError(err?.message || 'Delete failed.'); }
  };

  const summary = summarizeByType(stipends);
  const total = stipendTotal(stipends);
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Stipend &amp; Incentive Tracker</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Log incentives given to a client. Stored encrypted per client in the vault.
        </p>
      </div>

      <select value={clientId} onChange={(e) => selectClient(e.target.value)} style={{ ...inputStyle, maxWidth: '280px' }}>
        <option value="">— Select a client —</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>)}
      </select>

      {clientId && (
        <>
          {/* Add form */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Log an incentive</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={labelStyle}>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                  {STIPEND_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={labelStyle}>Amount (optional)</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 25.00" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={labelStyle}>Reason</label>
              <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Attended group session" style={inputStyle} />
            </div>
            {error && <div style={{ color: '#fda4af', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={addStipend} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>+ Add Incentive</button>
            </div>
          </div>

          {/* Summary strip */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total: <strong style={{ color: 'var(--gold)' }}>{money(total)}</strong></span>
            {Object.entries(summary).map(([type, s]) => (
              <span key={type} style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', padding: '2px 10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                {type}: {s.count} · {money(s.total)}
              </span>
            ))}
          </div>

          {/* List */}
          <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
            {stipends.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontFamily: 'var(--font-mono)' }}>No incentives logged for this client yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem' }}>Date</th>
                    <th style={{ padding: '0.6rem' }}>Type</th>
                    <th style={{ padding: '0.6rem' }}>Amount</th>
                    <th style={{ padding: '0.6rem' }}>Reason</th>
                    <th style={{ padding: '0.6rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {stipends.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                      <td style={{ padding: '0.6rem' }}>{s.date}</td>
                      <td style={{ padding: '0.6rem', color: 'var(--gold)' }}>{s.type}</td>
                      <td style={{ padding: '0.6rem' }}>{s.amount === '' || s.amount === undefined ? '—' : money(s.amount)}</td>
                      <td style={{ padding: '0.6rem' }}>{s.reason || '—'}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                        <button onClick={() => removeStipend(s.id)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fda4af', padding: '0.25rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const labelStyle = { fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' };
