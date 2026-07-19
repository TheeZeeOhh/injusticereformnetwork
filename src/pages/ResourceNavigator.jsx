import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import AminaPanel from './AminaPanel';

// Resource Navigator — recovered from the original Sanctuary
// (Baltimore's Safe Haven & Data Sovereignty Platform). A curated directory of
// real Trans/LGBTQ+ affirming resources in Baltimore/Maryland. The directory
// itself is static, non-PHI reference data. A Navigator can STAR resources for a
// client; that saved list is sensitive (identity/interest data) and is persisted
// ENCRYPTED in Vault B (42 CFR Part 2 / Trans Shield posture).
const SAVED_ID = 'saved_resources';

// Real Baltimore/Maryland resources, recovered verbatim from the original app's
// dataset. Do not fabricate additions — this is community-curated knowledge.
// lat/lng are present only for resources with a fixed physical Baltimore-area
// address, for the map pins. Hotlines / statewide / national entries have none.
const RESOURCES = [
  { name: 'Chase Brexton Health Care', addr: '1001 Cathedral St', note: 'Gender-affirming, LGBTQ+ primary care', phone: '410-837-2050', cat: 'Healthcare', lat: 39.3009, lng: -76.6160 },
  { name: 'GBMC Transgender Services', addr: '6701 N Charles St, Towson', note: 'Hormone therapy, surgery referrals', phone: '443-849-2000', cat: 'Healthcare', lat: 39.4009, lng: -76.6236 },
  { name: 'Planned Parenthood MD', addr: 'Multiple locations', note: 'Hormone care, trans-affirming', phone: '1-800-230-7526', cat: 'Healthcare' },
  { name: 'Homeless Services Hotline', addr: 'Baltimore City', note: '24/7 emergency housing routing', phone: '410-361-9028', cat: 'Housing' },
  { name: 'Healthcare for the Homeless', addr: '111 Park Ave', note: 'Housing + health services', phone: '410-837-5533', cat: 'Housing', lat: 39.2926, lng: -76.6178 },
  { name: 'Baltimore Station', addr: '140 W West St', note: 'Transitional housing', phone: '410-779-4801', cat: 'Housing', lat: 39.2740, lng: -76.6155 },
  { name: 'ACLU of Maryland', addr: '3600 Clipper Mill Rd', note: 'Civil rights, trans legal support', phone: '410-889-8550', cat: 'Legal', lat: 39.3320, lng: -76.6480 },
  { name: 'Maryland Volunteer Lawyers', addr: '201 N Charles St', note: 'Free civil legal assistance', phone: '410-539-6800', cat: 'Legal', lat: 39.2884, lng: -76.6146 },
  { name: 'Trans Equity Maryland', addr: 'Statewide', note: 'Name/gender marker changes', phone: 'mdtransequality.org', cat: 'Legal' },
  { name: 'Trans Lifeline', addr: 'National', note: 'By and for trans people', phone: '877-565-8860', cat: 'Crisis' },
  { name: 'Baltimore Crisis Response', addr: 'Baltimore City', note: 'Non-police mobile crisis', phone: '410-433-5175', cat: 'Crisis' },
  { name: '988 Lifeline', addr: 'National', note: 'Call or text 988', phone: '988', cat: 'Crisis' },
  { name: 'Ember Fund — ThriveBMore', addr: 'thrivebmore.org/ember', note: 'Emergency direct relief', phone: 'thrivebmore.org/ember', cat: 'Financial' },
  { name: 'SNAP Enrollment', addr: 'Maryland DHR', note: 'Food assistance', phone: '410-767-7500', cat: 'Financial' },
  { name: 'Tax Sale Legal Aid', addr: 'Baltimore City', note: 'ACLU + MVP for property defense', phone: '410-889-8550', cat: 'Legal' },
  { name: 'Baltimore Harm Reduction', addr: 'Baltimore City', note: 'Naloxone, safer use supplies', phone: 'baltimoreharmreduction.org', cat: 'Harm Reduction' },
  { name: 'Free Narcan', addr: 'Many Baltimore pharmacies', note: 'No prescription required in MD', phone: 'baltimoreharmreduction.org', cat: 'Harm Reduction' },

  // --- Food & Recovery anchors (Path B) ---
  // These are well-known statewide anchors added as a starting scaffold. Details
  // were NOT verified against a live source (knowledge cutoff), so each is marked
  // unverified. Confirm current phone/address/hours before referring a client.
  { name: 'Maryland Food Bank', addr: 'Baltimore (statewide network)', note: 'Food pantry network + partner locator', phone: '410-737-8282', cat: 'Food', unverified: true },
  { name: 'Maryland 211', addr: 'Statewide', note: 'Food, benefits & essential-needs referral line', phone: '211', cat: 'Food', unverified: true },
  { name: 'SNAP Enrollment', addr: 'Maryland DHR', note: 'Food assistance (also listed under Food)', phone: '410-767-7500', cat: 'Food', unverified: true },
  { name: 'Maryland Crisis / Recovery Line', addr: 'Statewide', note: 'Substance-use crisis & treatment referral', phone: '1-800-422-0009', cat: 'Recovery', unverified: true },
  { name: 'SAMHSA National Helpline', addr: 'National', note: 'Free, confidential treatment referral, 24/7', phone: '1-800-662-4357', cat: 'Recovery', unverified: true },
  { name: '988 Recovery Support', addr: 'National', note: 'Call or text 988 for MH/substance crisis', phone: '988', cat: 'Recovery', unverified: true }
];

const CATEGORIES = ['All', 'Healthcare', 'Housing', 'Legal', 'Crisis', 'Harm Reduction', 'Financial', 'Food', 'Recovery'];

// Derive a city bucket from an address for the city filter. Statewide/National
// entries (hotlines) are bucketed so a city pick never hides them.
function cityOf(addr) {
  const a = (addr || '').toLowerCase();
  if (a.includes('national')) return 'National';
  if (a.includes('statewide') || a.includes('maryland dhr') || a.includes('multiple')) return 'Statewide';
  if (a.includes('towson')) return 'Towson';
  return 'Baltimore';
}

const CITIES = ['All', ...Array.from(new Set(RESOURCES.map((r) => cityOf(r.addr)))).sort()];

// Crisis lines surfaced prominently regardless of filter.
const CRISIS = RESOURCES.filter((r) => r.cat === 'Crisis');

export default function ResourceNavigator() {
  const { vaultBKey, vaultAKey } = useAuthStore();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [city, setCity] = useState('All');
  const [saved, setSaved] = useState([]); // array of resource names
  const [status, setStatus] = useState('');
  const [clients, setClients] = useState([]); // Vault A client directory (for Amina context)

  const vaultBOpen = !!vaultBKey;

  useEffect(() => {
    async function loadSaved() {
      if (!vaultBKey) { setSaved([]); return; }
      try {
        const list = await loadSecureRecord(vaultBKey, SAVED_ID, 'B');
        if (list) setSaved(list);
      } catch {
        setStatus('Could not decrypt saved resources with the current Vault B key.');
      }
    }
    loadSaved();
  }, [vaultBKey]);

  // Load the Vault A client directory so Amina can optionally use a client's
  // saved transcript as (local-only) context.
  useEffect(() => {
    async function loadClients() {
      if (!vaultAKey) { setClients([]); return; }
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch {
        // No directory yet — Amina's context picker just stays empty.
      }
    }
    loadClients();
  }, [vaultAKey]);

  const toggleSave = async (name) => {
    if (!vaultBKey) { setStatus('Open Vault B to save resources for a client.'); return; }
    const next = saved.includes(name)
      ? saved.filter((n) => n !== name)
      : [...saved, name];
    setSaved(next);
    try {
      await saveSecureRecord(vaultBKey, SAVED_ID, next, 'B');
    } catch (err) {
      setStatus('Save failed: ' + err.message);
    }
  };

  const visible = RESOURCES.filter((r) => {
    if (cat !== 'All' && r.cat !== cat) return false;
    // City filter: a specific city pick still always shows Statewide/National
    // entries (hotlines) so they're never hidden behind a city choice.
    if (city !== 'All') {
      const c = cityOf(r.addr);
      if (c !== city && c !== 'Statewide' && c !== 'National') return false;
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        r.cat.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Resource Navigator</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Trans &amp; gender-expansive affirming resources · Baltimore, MD. Directory is public reference; saved resources are encrypted per client in Vault B.
        </p>
      </div>

      {/* Crisis lines — always visible */}
      <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #e11d48', background: 'rgba(225,29,72,0.08)' }}>
        <div style={{ color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>🆘 Crisis</div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {CRISIS.map((r) => (
            <div key={r.name} style={{ fontSize: '0.85rem', color: 'var(--bone)' }}>
              <strong>{r.name}</strong> · <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{r.phone}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Amina assistant + map */}
      <AminaPanel resources={RESOURCES} onFocusResource={(r) => { setCat('All'); setQuery(r.name); }} vaultAKey={vaultAKey} clients={clients} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources..."
          style={{ flex: 1, minWidth: '220px', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
        />
        <select value={city} onChange={(e) => setCity(e.target.value)} title="Filter by city" style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {CITIES.map((c) => <option key={c} value={c}>{c === 'All' ? 'All cities' : c}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? 'var(--gold)' : 'transparent', color: cat === c ? 'var(--charcoal)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '0.35rem 0.7rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {!vaultBOpen && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          🔒 Vault B closed — you can browse the directory, but saving resources for a client requires unlocking Vault B.
        </div>
      )}

      {/* Directory */}
      <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', alignContent: 'start' }}>
        {visible.map((r) => {
          const isSaved = saved.includes(r.name);
          return (
            <div key={r.name} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'var(--charcoal-lighter)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ color: 'var(--bone)', fontWeight: 'bold', fontSize: '0.9rem' }}>{r.name}</div>
                <button onClick={() => toggleSave(r.name)} disabled={!vaultBOpen} title={vaultBOpen ? 'Save for client' : 'Unlock Vault B to save'} style={{ background: 'transparent', border: 'none', cursor: vaultBOpen ? 'pointer' : 'not-allowed', fontSize: '1.1rem', opacity: vaultBOpen ? 1 : 0.4 }}>
                  {isSaved ? '★' : '☆'}
                </button>
              </div>
              <div style={{ color: 'var(--gold)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', margin: '0.25rem 0' }}>{r.cat}</div>
              {r.unverified && (
                <div title="Details not verified against a live source — confirm before referring a client" style={{ display: 'inline-block', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: '#fbbf24', border: '1px solid #b45309', background: 'rgba(251,191,36,0.08)', borderRadius: '4px', padding: '1px 6px', marginBottom: '0.35rem' }}>
                  ⚠ VERIFY BEFORE REFERRAL
                </div>
              )}
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>{r.note}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{r.addr}</div>
              <div style={{ color: 'var(--gold)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginTop: '0.3rem' }}>{r.phone}</div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No resources match.</div>
        )}
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.6rem', borderRadius: '4px' }}>{status}</div>
      )}
    </div>
  );
}
