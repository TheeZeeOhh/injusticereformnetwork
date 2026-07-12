import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord } from '../utils/storageEngine';

export default function Schedule() {
  const [appointments, setAppointments] = useState([]);
  const [gcalEvents] = useState([]);
  const { vaultAKey } = useAuthStore();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const syncStatus = queryParams.get('mock_sync') || queryParams.get('sync');

  // Load appointments from the local encrypted vault, never the plaintext server.
  useEffect(() => {
    async function loadAppointments() {
      if (!vaultAKey) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, 'appointments');
        if (stored) setAppointments(stored);
      } catch (err) {
        console.warn('No encrypted appointments found yet.');
      }
    }
    loadAppointments();
  }, [vaultAKey]);

  const handleSyncGCal = () => {
    // Cloud calendar sync is disabled: exporting appointment PHI to Google
    // would break the Technical Incapacity Defense (no default cloud sync of PHI).
    alert('Google Calendar sync is disabled. Syncing appointment data to a third-party cloud would expose PHI and violate the local-first defense posture.');
  };

  return (
    <div className="data-panel glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Schedule & Logistics</h2>
        <button onClick={handleSyncGCal} className="btn-primary" style={{ background: 'var(--charcoal, #333)', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
          <span>🔒</span> Cloud Sync Disabled (Local-First)
        </button>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
        View and manage your upcoming shifts and patient appointments.
      </p>

      {syncStatus === 'success' && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(66, 133, 244, 0.1)', borderRadius: '8px', border: '1px solid #4285F4' }}>
          <h3 style={{ color: '#4285F4', marginBottom: '1rem' }}>Google Calendar Events</h3>
          <div className="patient-list">
            {gcalEvents.map(event => (
              <div key={event.id} className="patient-item">
                <div className="patient-info">
                  <div>
                    <div className="patient-name">{event.summary}</div>
                    <div className="patient-id">{new Date(event.start?.dateTime || event.start?.date).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h3>Internal DB Appointments</h3>
        <div className="patient-list" style={{ marginTop: '1rem' }}>
          {appointments.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)' }}>No upcoming appointments scheduled.</p>
          ) : (
            appointments.map(app => (
              <div key={app.id} className="patient-item">
                <div className="patient-info">
                  <div>
                    <div className="patient-name">Patient ID: {app.patientId}</div>
                    <div className="patient-id">{new Date(app.startTime).toLocaleString()} - {app.status}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
