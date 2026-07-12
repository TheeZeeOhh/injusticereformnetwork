import React, { useState } from 'react';

export default function MedicationManagement() {
  const [medications] = useState([]);

  return (
    <div className="data-panel glass-panel">
      <h2>Medication Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Centralized e-prescribing and medication reconciliation dashboard.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <input type="text" placeholder="Search by patient or medication name..." style={{ flex: 1, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
        <button className="btn-primary">e-Prescribe New</button>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ padding: '1rem' }}>Patient</th>
              <th style={{ padding: '1rem' }}>Medication</th>
              <th style={{ padding: '1rem' }}>Dose / Freq</th>
              <th style={{ padding: '1rem' }}>Next Refill</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {medications.map(med => (
              <tr key={med.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{med.patient}</td>
                <td style={{ padding: '1rem' }}>{med.med}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{med.dose} - {med.frequency}</td>
                <td style={{ padding: '1rem' }}>{med.nextRefill}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    background: med.status === 'Active' ? 'rgba(72, 187, 120, 0.2)' : 'rgba(229, 62, 62, 0.2)', 
                    color: med.status === 'Active' ? '#48bb78' : '#e53e3e',
                    padding: '0.3rem 0.6rem', 
                    borderRadius: '12px', 
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}>
                    {med.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <button style={{ background: 'transparent', border: '1px solid var(--border-color)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Review</button>
                </td>
              </tr>
            ))}
            {medications.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No medications on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
