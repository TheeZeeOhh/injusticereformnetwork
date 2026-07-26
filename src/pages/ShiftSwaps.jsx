import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Shift-swap marketplace. Scheduling data is operational (not client PHI), so it
// lives in Vault A under a single 'shift_swaps' record. Empty until the team adds
// shifts — no mock data.
const SHIFTS_KEY = 'shift_swaps';

export default function ShiftSwaps() {
  const { user, vaultAKey } = useAuthStore();
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState({ date: '', time: '', role: '' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!vaultAKey) { setShifts([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await loadSecureRecord(vaultAKey, SHIFTS_KEY, 'A');
        if (!cancelled) setShifts(Array.isArray(list) ? list : []);
      } catch { if (!cancelled) setShifts([]); }
    })();
    return () => { cancelled = true; };
  }, [vaultAKey]);

  const persist = async (next) => {
    setShifts(next);
    if (vaultAKey) await saveSecureRecord(vaultAKey, SHIFTS_KEY, next, 'A');
  };

  const addShift = async () => {
    if (!vaultAKey) { setError('Unlock the vault first.'); return; }
    if (!form.date.trim() || !form.time.trim()) { setError('Date and time are required.'); return; }
    setError('');
    const entry = {
      id: `S-${Date.now()}`,
      user: user?.username || 'Me',
      role: user?.role || form.role || 'Staff',
      date: form.date.trim(),
      time: form.time.trim(),
      status: 'Available for Swap',
    };
    await persist([...shifts, entry]);
    setForm({ date: '', time: '', role: '' });
    setShowForm(false);
  };

  const offerToCover = async (id) => {
    await persist(shifts.map((s) => (s.id === id ? { ...s, status: 'Pending Approval', coveredBy: user?.username || 'Me' } : s)));
  };

  const removeShift = async (id) => {
    await persist(shifts.filter((s) => s.id !== id));
  };

  const mine = shifts.filter((s) => s.user === (user?.username || 'Me'));

  return (
    <div className="data-panel glass-panel">
      <h2>Shift Swap Marketplace</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Request coverage or pick up available shifts from other team members. All swaps require manager approval.
      </p>

      {!vaultAKey && (
        <div style={{ color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          🔒 Unlock the vault to view and post shifts.
        </div>
      )}

      <button className="btn-primary" onClick={() => setShowForm((v) => !v)} disabled={!vaultAKey} style={{ padding: '0.4rem 1rem', marginBottom: '1rem' }}>
        {showForm ? 'Cancel' : '+ Post a Shift'}
      </button>
      {showForm && (
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input placeholder="Date (e.g. Oct 17, 2026)" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} />
          <input placeholder="Time (e.g. 08:00 AM - 04:00 PM)" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inp} />
          <input placeholder="Role (optional)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inp} />
          <button className="btn-primary" onClick={addShift} style={{ padding: '0.4rem 1rem' }}>Post</button>
          {error && <div style={{ color: '#fda4af', fontSize: '0.8rem', width: '100%' }}>{error}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 280 }}>
          <h3>Available Shifts</h3>
          <div className="patient-list" style={{ marginTop: '1rem' }}>
            {shifts.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '1rem 0' }}>No shifts posted yet.</div>
            )}
            {shifts.map((shift) => (
              <div key={shift.id} className="patient-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="patient-info">
                  <div className="avatar" style={{ background: 'var(--color-primary)', color: 'white' }}>{(shift.user || '?').substring(0, 2)}</div>
                  <div>
                    <div className="patient-name">{shift.date} • {shift.time}</div>
                    <div className="patient-id">{shift.user} ({shift.role}) - {shift.status}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {shift.status === 'Available for Swap' && (
                    <button onClick={() => offerToCover(shift.id)} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
                      Offer to Cover
                    </button>
                  )}
                  {shift.status === 'Pending Approval' && (
                    <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>Pending</span>
                  )}
                  {shift.user === (user?.username || 'Me') && (
                    <button onClick={() => removeShift(shift.id)} title="Remove" style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, color: '#fda4af', cursor: 'pointer', padding: '0.3rem 0.5rem' }}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220, background: 'var(--bg-color-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>My Upcoming Shifts</h3>
          <ul style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', listStyle: 'none', padding: 0 }}>
            {mine.length === 0 && <li style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None posted.</li>}
            {mine.map((s) => (
              <li key={s.id} style={{ padding: '1rem', background: 'var(--bg-color-main)', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)' }}>
                <strong>{s.date}</strong><br />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{s.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const inp = { padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' };
