import React, { useState } from 'react';

export default function OnCallDashboard() {
  const [activeCall] = useState({
    clinician: 'Dr. Sarah Chen',
    specialty: 'Psychiatry',
    status: 'On Call (Active)',
    shiftEnds: '08:00 AM Tomorrow'
  });

  return (
    <div className="data-panel glass-panel">
      <h2>On-Call Dashboard</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Live monitoring of on-call clinical staff and emergency dispatch routing.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ background: 'var(--bg-color-surface)', padding: '2rem', borderRadius: '8px', borderLeft: '4px solid #48bb78' }}>
          <h3 style={{ marginTop: 0, color: '#48bb78' }}>Current Primary On-Call</h3>
          <p><strong>Name:</strong> {activeCall.clinician}</p>
          <p><strong>Specialty:</strong> {activeCall.specialty}</p>
          <p><strong>Shift Ends:</strong> {activeCall.shiftEnds}</p>
          <button className="btn-primary" style={{ marginTop: '1rem', background: '#e53e3e' }}>
            🚨 Page Immediately
          </button>
        </div>

        <div style={{ background: 'var(--bg-color-surface)', padding: '2rem', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ marginTop: 0 }}>Secondary Backup (Tier 2)</h3>
          <p><strong>Name:</strong> — (unassigned)</p>
          <p><strong>Specialty:</strong> Crisis Intervention</p>
          <p><strong>Status:</strong> No standby on call</p>
          <button className="btn-primary" style={{ marginTop: '1rem', background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
            Notify Standby
          </button>
        </div>
      </div>
    </div>
  );
}
