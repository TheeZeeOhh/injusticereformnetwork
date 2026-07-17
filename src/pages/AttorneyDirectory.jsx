import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

const SPECIALTIES = ['Criminal Defense', 'Immigration', 'Civil Rights', 'Family', 'Housing'];

const SEED_ATTORNEYS = [
  { id: 1, name: 'Sarah Jenkins, Esq.', firm: 'Jenkins Legal Aid', specialty: 'Civil Rights', phone: '(555) 019-2831', email: 'sjenkins@legalaid.org', status: 'Vetted', proBono: true },
  { id: 2, name: 'David Kim', firm: 'Kim & Associates', specialty: 'Housing', phone: '(555) 441-9920', email: 'dkim@kimlaw.com', status: 'Pending Review', proBono: false },
  { id: 3, name: 'Maya Rostova', firm: 'Rostova Immigration', specialty: 'Immigration', phone: '(555) 882-1102', email: 'maya@rostovaimm.com', status: 'Vetted', proBono: true }
];

const EMPTY_FORM = { name: '', specialty: 'Criminal Defense', firm: '', phone: '', email: '', proBono: false };

export default function AttorneyDirectory() {
  const { vaultAKey } = useAuthStore();

  const [attorneys, setAttorneys] = useState(SEED_ATTORNEYS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');

  // Load attorney directory from encrypted Vault A on mount
  useEffect(() => {
    async function loadDirectory() {
      if (!vaultAKey) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, 'attorney_directory', 'A');
        if (stored) setAttorneys(stored);
      } catch {
        console.warn("No attorney directory found, using default seed list.");
      }
    }
    loadDirectory();
  }, [vaultAKey]);

  // Persist the full array to Vault A
  const persist = async (updated) => {
    setAttorneys(updated);
    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, 'attorney_directory', updated, 'A');
    } catch (err) {
      console.error("Failed to save attorney directory to vault", err);
    }
  };

  const handleAddAttorney = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newAttorney = {
      id: `att_${Date.now()}`,
      name: form.name.trim(),
      specialty: form.specialty,
      firm: form.firm.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      status: 'Pending Review',
      proBono: form.proBono
    };
    persist([...attorneys, newAttorney]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const handleDelete = (id) => {
    persist(attorneys.filter(a => a.id !== id));
  };

  const filtered = attorneys.filter(att => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (att.name || '').toLowerCase().includes(q) || (att.specialty || '').toLowerCase().includes(q);
  });

  const inputStyle = { width: '100%', padding: '0.65rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' };
  const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Attorney Referral Directory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            Vetted network of allied defense and civil rights attorneys.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)} style={{ background: 'var(--charcoal)', border: '1px solid var(--gold)', color: 'var(--gold)', fontWeight: 'bold' }}>
          {showForm ? 'Cancel' : '+ Add Attorney'}
        </button>
      </div>

      {/* Inline Add Form */}
      {showForm && (
        <form onSubmit={handleAddAttorney} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)' }}>New Attorney Referral</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="Jane Doe, Esq." />
            </div>
            <div>
              <label style={labelStyle}>Specialty</label>
              <select value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle}>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Firm / Org</label>
              <input type="text" value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })} style={inputStyle} placeholder="Doe Legal Group" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} placeholder="jane@firm.org" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              <input id="proBono" type="checkbox" checked={form.proBono} onChange={e => setForm({ ...form, proBono: e.target.checked })} style={{ width: '18px', height: '18px', accentColor: '#4ade80' }} />
              <label htmlFor="proBono" style={{ ...labelStyle, marginBottom: 0, color: 'var(--bone)' }}>Pro Bono Available</label>
            </div>
          </div>
          <div>
            <button type="submit" className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
              Save Attorney
            </button>
          </div>
        </form>
      )}

      {/* Search / Filter */}
      <div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or specialty..."
          style={{ ...inputStyle, maxWidth: '400px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', overflowY: 'auto', paddingBottom: '2rem' }}>
        {filtered.map(att => (
          <div key={att.id} className="glass-panel" style={{ padding: '1.5rem', background: 'var(--charcoal-dark)', borderTop: `4px solid ${att.status === 'Vetted' ? 'var(--gold)' : 'var(--text-secondary)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--bone)', fontFamily: 'var(--font-serif)' }}>{att.name}</h3>
              <button
                onClick={() => handleDelete(att.id)}
                title="Remove attorney"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--ember)', borderRadius: '4px', cursor: 'pointer', padding: '0.15rem 0.5rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              >
                Remove
              </button>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem' }}>{att.firm}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Specialty:</span>
                <span style={{ color: 'var(--bone)' }}>{att.specialty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Phone:</span>
                <span style={{ color: 'var(--bone)' }}>{att.phone}</span>
              </div>
              {att.email && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Email:</span>
                  <span style={{ color: 'var(--bone)' }}>{att.email}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{
                  background: att.status === 'Vetted' ? 'rgba(217, 164, 65, 0.1)' : 'rgba(255,255,255,0.05)',
                  color: att.status === 'Vetted' ? 'var(--gold)' : 'var(--text-secondary)',
                  padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem'
                }}>{att.status}</span>
                {att.proBono && (
                  <span style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Pro-Bono Available</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            No attorneys match your search.
          </div>
        )}
      </div>
    </div>
  );
}
