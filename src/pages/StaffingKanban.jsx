import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

export default function StaffingKanban() {
  const { vaultAKey } = useAuthStore();
  const [prospects, setProspects] = useState([
    { id: 1, name: 'Dr. Avery Davis', role: 'Psychiatrist', status: 'Applicants', note: 'Applied 2d ago' },
    { id: 2, name: 'Jordan Lee, RN', role: 'Psychiatric Nurse', status: 'Applicants', note: 'Applied 4d ago' },
    { id: 3, name: 'Dr. Elena Rostova', role: 'Clinical Psychologist', status: 'Interviewing', note: 'Round 2' },
    { id: 4, name: 'Samuel Jackson, MSW', role: 'Social Worker', status: 'Credentialing', note: 'Waiting on Background Check' }
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');

  const columns = ['Applicants', 'Interviewing', 'Credentialing'];

  // Load persisted staffing board on mount
  useEffect(() => {
    async function loadBoard() {
      if (!vaultAKey) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, 'staffing_board', 'A');
        if (stored) setProspects(stored);
      } catch (err) {
        console.warn("No staffing board found, using defaults.");
      }
    }
    loadBoard();
  }, [vaultAKey]);

  const persistBoard = async (updatedProspects) => {
    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, 'staffing_board', updatedProspects, 'A');
    } catch (err) {
      console.error("Failed to persist staffing board to vault", err);
    }
  };

  const moveProspect = async (id, direction) => {
    const updatedProspects = prospects.map(p => {
      if (p.id === id) {
        const currentIndex = columns.indexOf(p.status);
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < columns.length) {
          return { ...p, status: columns[newIndex] };
        }
      }
      return p;
    });
    setProspects(updatedProspects);
    await persistBoard(updatedProspects);
  };

  const addProspect = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newRole.trim()) return;
    const updatedProspects = [...prospects, {
      id: Date.now(),
      name: newName,
      role: newRole,
      status: 'Applicants',
      note: 'Added just now'
    }];
    setProspects(updatedProspects);
    setNewName('');
    setNewRole('');
    setIsAdding(false);
    await persistBoard(updatedProspects);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Staffing Pipeline</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            Manage clinical recruitment, onboarding, and credentialing workflows.
          </p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>
          {isAdding ? 'Cancel' : '+ Add Prospect'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={addProspect} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', background: 'var(--charcoal)' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Full Name</label>
            <input autoFocus type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sarah Jenkins" style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Clinical Role</label>
            <input type="text" value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="e.g. Defense Attorney" style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
            Add to Pipeline
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflowX: 'auto', paddingBottom: '1rem' }}>
        {columns.map((columnName, colIdx) => {
          const colProspects = prospects.filter(p => p.status === columnName);
          return (
            <div key={columnName} className="glass-panel" style={{ minWidth: '320px', flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--charcoal-dark)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${colIdx === 0 ? 'var(--text-secondary)' : colIdx === 1 ? 'var(--gold)' : 'var(--ember)'}`, paddingBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, color: 'var(--bone)', fontFamily: 'var(--font-serif)', fontSize: '1.2rem' }}>{columnName}</h3>
                <span style={{ background: 'var(--charcoal-lighter)', color: 'var(--text-secondary)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  {colProspects.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
                {colProspects.map(p => (
                  <div key={p.id} style={{ background: 'var(--charcoal)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: `3px solid ${colIdx === 0 ? 'var(--text-secondary)' : colIdx === 1 ? 'var(--gold)' : 'var(--ember)'}` }}>
                    <div>
                      <strong style={{ color: 'var(--bone)', display: 'block', fontSize: '1rem' }}>{p.name}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{p.role}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{p.note}</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                      <button 
                        onClick={() => moveProspect(p.id, -1)} 
                        disabled={colIdx === 0}
                        style={{ background: 'transparent', border: 'none', color: colIdx === 0 ? 'transparent' : 'var(--text-secondary)', cursor: colIdx === 0 ? 'default' : 'pointer', fontSize: '0.8rem' }}
                      >
                        ← Back
                      </button>
                      <button 
                        onClick={() => moveProspect(p.id, 1)} 
                        disabled={colIdx === columns.length - 1}
                        style={{ background: 'transparent', border: 'none', color: colIdx === columns.length - 1 ? 'transparent' : 'var(--ember)', cursor: colIdx === columns.length - 1 ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >
                        Advance →
                      </button>
                    </div>
                  </div>
                ))}
                {colProspects.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    No candidates here.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
