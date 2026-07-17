import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

const APPTS_ID = 'appointments';
const STATUSES = ['Scheduled', 'Confirmed', 'Completed', 'No-show', 'Cancelled'];

export default function Schedule() {
  const [appointments, setAppointments] = useState([]);
  const [gcalEvents] = useState([]);
  const { vaultAKey } = useAuthStore();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const syncStatus = queryParams.get('mock_sync') || queryParams.get('sync');

  // Client directory for the picker (so appointments link to a real client id,
  // which is what the SMS reminder matcher resolves against).
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ patientId: '', startTime: '', status: 'Scheduled' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  // Load appointments + client directory from the local encrypted vault.
  useEffect(() => {
    async function load() {
      if (!vaultAKey) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, APPTS_ID, 'A');
        if (Array.isArray(stored)) setAppointments(stored);
      } catch (err) {
        console.warn('No encrypted appointments found yet.', err);
      }
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch (err) {
        console.warn('No client directory found yet.', err);
      }
    }
    load();
  }, [vaultAKey]);

  const sortByStart = (list) =>
    [...list].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const persistAppointments = async (next) => {
    setAppointments(next);
    await saveSecureRecord(vaultAKey, APPTS_ID, next, 'A');
  };

  const handleCreate = async () => {
    setStatus(null);
    if (!vaultAKey) {
      setStatus({ ok: false, msg: 'Log in to schedule appointments.' });
      return;
    }
    if (!form.patientId) {
      setStatus({ ok: false, msg: 'Select a client.' });
      return;
    }
    const when = new Date(form.startTime);
    if (!form.startTime || Number.isNaN(when.getTime())) {
      setStatus({ ok: false, msg: 'Choose a valid date and time.' });
      return;
    }
    setSaving(true);
    try {
      const appt = {
        id: `appt_${crypto.randomUUID()}`,
        patientId: form.patientId,
        // Store as ISO so ordering and the reminder date parse consistently.
        startTime: when.toISOString(),
        status: form.status,
      };
      await persistAppointments(sortByStart([...appointments, appt]));
      setForm({ patientId: '', startTime: '', status: 'Scheduled' });
      setStatus({ ok: true, msg: 'Appointment scheduled and encrypted to vault.' });
    } catch (err) {
      setStatus({ ok: false, msg: 'Save failed: ' + (err?.message || 'unknown error') });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!vaultAKey) return;
    try {
      await persistAppointments(appointments.filter((a) => a.id !== id));
    } catch (err) {
      setStatus({ ok: false, msg: 'Delete failed: ' + (err?.message || 'unknown error') });
    }
  };

  const nameFor = (patientId) => {
    const c = clients.find((c) => c.id === patientId);
    return c ? c.name : patientId;
  };

  const handleSyncGCal = () => {
    // Cloud calendar sync is disabled: exporting appointment PHI to Google
    // would break the Technical Incapacity Defense (no default cloud sync of PHI).
    alert('Google Calendar sync is disabled. Syncing appointment data to a third-party cloud would expose PHI and violate the local-first defense posture.');
  };

  return (
    <div className="data-panel glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Schedule &amp; Logistics</h2>
        <button onClick={handleSyncGCal} className="btn-primary" style={{ background: 'var(--charcoal, #333)', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
          <span>🔒</span> Cloud Sync Disabled (Local-First)
        </button>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
        View and manage your upcoming shifts and patient appointments.
      </p>

      {/* Create appointment */}
      <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)' }}>New Appointment</h3>
        {clients.length === 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            No clients in the directory yet — add a client first.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Client</label>
            <select value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })}
              style={{ padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              <option value="">— select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id.replace('client_', '')})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Date &amp; time</label>
            <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}
              style={{ padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              style={{ padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={handleCreate} disabled={saving} className="btn-primary"
            style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold', padding: '0.6rem 1.25rem', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Schedule'}
          </button>
        </div>
        {status && (
          <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: status.ok ? '#4ade80' : '#f87171' }}>
            {status.msg}
          </div>
        )}
      </div>

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
              <div key={app.id} className="patient-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="patient-info">
                  <div>
                    <div className="patient-name">{nameFor(app.patientId)}</div>
                    <div className="patient-id">{new Date(app.startTime).toLocaleString()} — {app.status}</div>
                  </div>
                </div>
                <button onClick={() => handleDelete(app.id)}
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fda4af', borderRadius: '4px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
