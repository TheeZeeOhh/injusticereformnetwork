import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

export default function ShiftSwaps() {
  const user = useAuthStore(state => state.user);
  const [shifts, setShifts] = useState([]);
  
  useEffect(() => {
    // Mocking shifts from the backend for the prototype
    setShifts([
      { id: 'S-101', user: 'Dr. Chen', date: 'Oct 15, 2026', time: '08:00 AM - 04:00 PM', role: 'Clinician', status: 'Available for Swap' },
      { id: 'S-102', user: 'Nurse Sarah', date: 'Oct 16, 2026', time: '12:00 PM - 08:00 PM', role: 'Staff', status: 'Pending Approval' }
    ]);
  }, []);

  const requestSwap = () => {
    alert("Shift swap request sent to manager for approval.");
  };

  return (
    <div className="data-panel glass-panel">
      <h2>Shift Swap Marketplace</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Request coverage or pick up available shifts from other team members. All swaps require manager approval.
      </p>

      <div style={{ display: 'flex', gap: '2rem' }}>
        
        {/* Available Swaps */}
        <div style={{ flex: 2 }}>
          <h3>Available Shifts</h3>
          <div className="patient-list" style={{ marginTop: '1rem' }}>
            {shifts.map(shift => (
              <div key={shift.id} className="patient-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="patient-info">
                  <div className="avatar" style={{ background: 'var(--color-primary)', color: 'white' }}>{shift.user.substring(0,2)}</div>
                  <div>
                    <div className="patient-name">{shift.date} • {shift.time}</div>
                    <div className="patient-id">{shift.user} ({shift.role}) - {shift.status}</div>
                  </div>
                </div>
                {shift.status === 'Available for Swap' && (
                  <button onClick={requestSwap} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
                    Offer to Cover
                  </button>
                )}
                {shift.status === 'Pending Approval' && (
                  <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* My Shifts */}
        <div style={{ flex: 1, background: 'var(--bg-color-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>My Upcoming Shifts</h3>
          <ul style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', listStyle: 'none', padding: 0 }}>
            <li style={{ padding: '1rem', background: 'var(--bg-color-main)', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)' }}>
              <strong>Oct 17, 2026</strong><br/>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>08:00 AM - 04:00 PM</span>
              <button style={{ marginTop: '0.5rem', width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Request Swap</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
