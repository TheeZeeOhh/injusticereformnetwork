import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { loadClientRecord, saveClientRecord } from '../schema';
import { CanvasBoard } from './VisualCanvas';
import { INTAKE_QUESTIONS } from './intakeQuestions';

// Common pronoun sets offered as multi-select. A client may use more than one,
// and the free-text "self-describe" field below covers anything not listed
// (neopronouns, custom). Affirming-by-design: no one is boxed out.
const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'ze/hir', 'xe/xem', 'name only'];

export default function ClientsModule() {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail'
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const { vaultAKey } = useAuthStore();
  
  // Directory of all clients
  const [clientDirectory, setClientDirectory] = useState([]);

  // Active client details
  const [clientData, setClientData] = useState({
    legalName: '',
    alias: '',
    phone: '',
    emergency: '',
    smsConsent: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  // Outbound SMS reminder state
  const DEFAULT_SMS = 'Reminder from IRN: you have an upcoming appointment. Reply STOP to opt out.';
  const [smsBody, setSmsBody] = useState(DEFAULT_SMS);
  const [smsSending, setSmsSending] = useState(false);
  const [smsStatus, setSmsStatus] = useState(null);
  const [nextAppt, setNextAppt] = useState(null);

  // Intake (needs assessment) state — one Vault-A record per client.
  const [intakeAnswers, setIntakeAnswers] = useState({});
  const [intakeMeta, setIntakeMeta] = useState(null); // { updatedAt }
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState(null);

  // Build the reminder message, folding in the appointment date when we have one.
  const reminderFor = (appt) => {
    if (!appt) return DEFAULT_SMS;
    const when = new Date(appt.startTime).toLocaleString([], {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    return `Reminder from IRN: you have an appointment on ${when}. Reply STOP to opt out.`;
  };

  // Load directory on mount
  useEffect(() => {
    async function loadDirectory() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (dir) setClientDirectory(dir);
      } catch (err) {
        console.warn("No client directory found, using default.");
      }
    }
    loadDirectory();
  }, [vaultAKey]);

  // Load active client data when selected
  useEffect(() => {
    async function loadActiveClient() {
      if (!vaultAKey || !activeClientId) return;
      try {
        const stored = await loadClientRecord(vaultAKey, activeClientId, 'A');
        if (stored) {
          setClientData(stored);
        } else {
          // New blank client
          setClientData({ legalName: 'New Client', alias: '', phone: '', emergency: '', smsConsent: false, photo: '', pronouns: [], pronounsSelfDescribe: '' });
        }
        setSmsStatus(null);

        // Find this client's next upcoming appointment to prefill the reminder.
        // patientId may be stored as the full id ("client_PT-1234") or bare
        // ("PT-1234"), so match both since nothing in-app writes appointments yet.
        let upcoming = null;
        try {
          const appts = await loadSecureRecord(vaultAKey, 'appointments', 'A');
          if (Array.isArray(appts)) {
            const bareId = activeClientId.replace('client_', '');
            const now = Date.now();
            upcoming = appts
              .filter(a => (a.patientId === activeClientId || a.patientId === bareId))
              .filter(a => new Date(a.startTime).getTime() >= now)
              .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] || null;
          }
        } catch (err) {
          console.warn('No appointments vault found; using generic reminder.', err);
        }
        setNextAppt(upcoming);
        setSmsBody(reminderFor(upcoming));

        // Load this client's intake record (if any).
        setIntakeStatus(null);
        try {
          const intake = await loadSecureRecord(vaultAKey, `intake_${activeClientId}`, 'A');
          if (intake && typeof intake === 'object') {
            setIntakeAnswers(intake.answers || {});
            setIntakeMeta(intake.updatedAt ? { updatedAt: intake.updatedAt } : null);
          } else {
            setIntakeAnswers({});
            setIntakeMeta(null);
          }
        } catch (err) {
          console.warn('No intake record for this client yet.', err);
          setIntakeAnswers({});
          setIntakeMeta(null);
        }
      } catch (err) {
        console.error("Failed to load secure client record", err);
      }
    }
    loadActiveClient();
  }, [vaultAKey, activeClientId]);

  const handleSaveToVault = async () => {
    if (!vaultAKey || !activeClientId) return;
    setIsSaving(true);
    try {
      // Save client profile (schema-validated: rejects a malformed record).
      await saveClientRecord(vaultAKey, activeClientId, clientData, 'A');
      
      // Update & Save directory
      const updatedDir = [...clientDirectory];
      const existing = updatedDir.find(c => c.id === activeClientId);
      if (existing) {
        existing.name = clientData.legalName || 'Unnamed Client';
      } else {
        updatedDir.push({ id: activeClientId, name: clientData.legalName || 'Unnamed Client', status: 'Active' });
      }
      setClientDirectory(updatedDir);
      await saveSecureRecord(vaultAKey, 'client_directory', updatedDir, 'A');
      
      alert('Client securely saved to local IndexedDB Vault.');
    } catch (err) {
      alert('Failed to save to vault: ' + err.message);
    }
    setIsSaving(false);
  };

  const handleCreateNewClient = () => {
    const newId = `client_PT-${Math.floor(Math.random() * 10000)}`;
    setActiveClientId(newId);
    setClientData({ legalName: 'New Client', alias: '', phone: '', emergency: '', smsConsent: false, photo: '', pronouns: [], pronounsSelfDescribe: '' });
    setSmsStatus(null);
    setIntakeAnswers({});
    setIntakeMeta(null);
    setIntakeStatus(null);
    setActiveTab('profile');
    setViewMode('detail');
  };

  // DEV-ONLY: seed a few fake clients so the app has data to work with (photos,
  // transcripts, Amina context). Writes through the normal encrypted save path,
  // so these are real Vault A records. Idempotent: existing ids are skipped.
  // Gated behind import.meta.env.DEV so it never ships in the packaged app.
  const [isSeeding, setIsSeeding] = useState(false);
  const handleSeedSampleClients = async () => {
    if (!vaultAKey) { alert('Unlock the vault first.'); return; }
    setIsSeeding(true);
    const SAMPLES = [
      { id: 'client_PT-1001', legalName: 'Jordan Ellis', alias: 'Jay', phone: '(410) 555-0142', emergency: 'Sister — (410) 555-0188', smsConsent: true, photo: '' },
      { id: 'client_PT-1002', legalName: 'Marcus Rivera', alias: 'Mari', phone: '(443) 555-0117', emergency: 'Case worker — (443) 555-0100', smsConsent: false, photo: '' },
      { id: 'client_PT-1003', legalName: 'Danielle Okafor', alias: 'Dee', phone: '(410) 555-0173', emergency: 'Partner — (410) 555-0190', smsConsent: true, photo: '' },
      { id: 'client_PT-1004', legalName: 'Sam Whitfield', alias: 'Sammy', phone: '(667) 555-0155', emergency: 'Friend — (667) 555-0166', smsConsent: false, photo: '' },
    ];
    try {
      const dir = [...clientDirectory];
      for (const s of SAMPLES) {
        if (dir.find(c => c.id === s.id)) continue; // idempotent
        await saveClientRecord(vaultAKey, s.id, {
          legalName: s.legalName, alias: s.alias, phone: s.phone,
          emergency: s.emergency, smsConsent: s.smsConsent, photo: s.photo,
        }, 'A');
        dir.push({ id: s.id, name: s.legalName, status: 'Active' });
      }
      setClientDirectory(dir);
      await saveSecureRecord(vaultAKey, 'client_directory', dir, 'A');
      alert(`Sample clients ready (${dir.length} total in directory).`);
    } catch (err) {
      alert('Seeding failed: ' + err.message);
    }
    setIsSeeding(false);
  };

  // Client photo. Held on the encrypted client record (clientData.photo) and
  // written to the vault by handleSaveToVault like every other client field —
  // it is PHI, so it never touches localStorage or leaves the device. Guard the
  // size so an oversized image can't bloat the encrypted record.
  const MAX_CLIENT_PHOTO_CHARS = 7 * 1024 * 1024; // ~7MB of base64
  const handleClientPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > MAX_CLIENT_PHOTO_CHARS) {
        alert('That image is too large or not a supported format. Use a JPEG or PNG under 5MB.');
        return;
      }
      setClientData(prev => ({ ...prev, photo: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  // Toggle a pronoun set on/off in clientData.pronouns (a string array). Persists
  // to the vault with the rest of the profile on "Save to Vault".
  const togglePronoun = (p) => {
    setClientData(prev => {
      const current = Array.isArray(prev.pronouns) ? prev.pronouns : [];
      const next = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
      return { ...prev, pronouns: next };
    });
  };

  const handleSaveIntake = async () => {
    if (!vaultAKey || !activeClientId) return;
    setIntakeSaving(true);
    setIntakeStatus(null);
    try {
      const updatedAt = new Date().toISOString();
      await saveSecureRecord(
        vaultAKey,
        `intake_${activeClientId}`,
        { answers: intakeAnswers, updatedAt },
        'A'
      );
      setIntakeMeta({ updatedAt });
      setIntakeStatus({ ok: true, msg: 'Intake saved to vault.' });
    } catch (err) {
      setIntakeStatus({ ok: false, msg: err?.message || 'Failed to save intake.' });
    }
    setIntakeSaving(false);
  };

  const handleSendReminder = async () => {
    if (!clientData.smsConsent) {
      setSmsStatus({ ok: false, msg: 'Client has not consented to SMS. Enable consent and save first.' });
      return;
    }
    const to = (clientData.phone || '').trim();
    if (!to) {
      setSmsStatus({ ok: false, msg: 'No contact number on file for this client.' });
      return;
    }
    if (!smsBody.trim()) {
      setSmsStatus({ ok: false, msg: 'Message body is empty.' });
      return;
    }
    setSmsSending(true);
    setSmsStatus(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const sid = await invoke('send_sms_reminder', { to, body: smsBody });
      setSmsStatus({ ok: true, msg: `Reminder sent (${sid}).` });
    } catch (err) {
      setSmsStatus({ ok: false, msg: typeof err === 'string' ? err : (err?.message || 'Send failed.') });
    }
    setSmsSending(false);
  };

  const openClient = (id) => {
    setActiveClientId(id);
    setActiveTab('profile');
    setViewMode('detail');
  };

  const tabs = [
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'intake', icon: '📋', label: 'Intake' },
    { id: 'health', icon: '⚕️', label: 'Health & Meds' },
    { id: 'housing', icon: '🏠', label: 'Housing' },
    { id: 'canvas', icon: '🎨', label: 'Visual Canvas' }
  ];

  if (viewMode === 'list') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)' }}>Client Directory</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Secure offline registry</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {import.meta.env.DEV && (
              <button
                className="btn-primary"
                onClick={handleSeedSampleClients}
                disabled={isSeeding}
                title="Dev only: create fake sample clients"
                style={{ background: 'var(--charcoal)', color: 'var(--bone)', border: '1px dashed var(--border-color)' }}
              >
                {isSeeding ? 'Seeding…' : '🧪 Seed sample clients'}
              </button>
            )}
            <button className="btn-primary" onClick={handleCreateNewClient} style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>
              + Add New Client
            </button>
          </div>
        </div>

        <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '1rem' }}>Client ID</th>
                <th style={{ padding: '1rem' }}>Legal Name</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clientDirectory.map(client => (
                <tr key={client.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                  <td style={{ padding: '1rem', color: 'var(--gold)' }}>{client.id.replace('client_', '')}</td>
                  <td style={{ padding: '1rem' }}>{client.name}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' }}>
                      {client.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button className="btn-primary" onClick={() => openClient(client.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal)', border: '1px solid var(--border-color)' }}>
                      Open Chart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // DETAIL MODE
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {/* Client Header */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
            ← Back
          </button>
          <div className="avatar" style={{
            width: '56px', height: '56px', fontSize: '1.5rem',
            background: clientData.photo ? `url(${clientData.photo}) center/cover no-repeat` : 'var(--color-secondary)'
          }}>
            {!clientData.photo && (clientData.legalName ? clientData.legalName.substring(0, 2).toUpperCase() : '??')}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--bone)', fontFamily: 'var(--font-serif)' }}>
              {clientData.legalName} <span style={{ fontSize: '0.8rem', background: 'var(--charcoal)', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{activeClientId.replace('client_', '')}</span>
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={handleSaveToVault} disabled={isSaving} style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
            {isSaving ? 'Encrypting...' : 'Save to Vault'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--charcoal-lighter)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ 
              flex: 1, padding: '0.75rem', background: activeTab === tab.id ? 'var(--charcoal)' : 'transparent', 
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', 
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: '0.2s', borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        
        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Client Profile</h2>

            {/* Client photo — stored on the encrypted client record, saved to
                the vault via "Save to Vault". PHI: stays on device. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{
                width: '96px', height: '96px', borderRadius: '50%', flexShrink: 0,
                border: '3px solid var(--gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: clientData.photo ? '0' : '2rem', color: 'var(--gold)',
                fontFamily: 'var(--font-serif)',
                background: clientData.photo ? `url(${clientData.photo}) center/cover no-repeat` : 'var(--charcoal-lighter)'
              }}>
                {!clientData.photo && (clientData.legalName ? clientData.legalName.charAt(0).toUpperCase() : '?')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', background: 'var(--charcoal)', border: '1px solid var(--border-color)', color: 'var(--bone)', padding: '0.5rem 1rem' }}>
                  {clientData.photo ? 'Replace Photo' : 'Upload Client Photo'}
                  <input type="file" accept="image/png, image/jpeg" onChange={handleClientPhotoUpload} style={{ display: 'none' }} />
                </label>
                {clientData.photo && (
                  <button
                    onClick={() => setClientData(prev => ({ ...prev, photo: '' }))}
                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Remove
                  </button>
                )}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  JPEG or PNG. Max 5MB. Encrypted in the vault on save.
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Legal Name</label><input type="text" value={clientData.legalName} onChange={e => setClientData({...clientData, legalName: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chosen Name / Alias</label><input type="text" value={clientData.alias} onChange={e => setClientData({...clientData, alias: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Contact Number</label><input type="text" value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Emergency Contact</label><input type="text" value={clientData.emergency} onChange={e => setClientData({...clientData, emergency: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
            </div>

            {/* Pronouns — multi-select (a client may use more than one) plus a
                free-text self-describe. PHI: saved to Vault A with the profile. */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pronouns</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {PRONOUN_OPTIONS.map(p => {
                  const selected = Array.isArray(clientData.pronouns) && clientData.pronouns.includes(p);
                  return (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.4rem 0.7rem', borderRadius: '6px', border: `1px solid ${selected ? 'var(--gold)' : 'var(--border-color)'}`, background: selected ? 'var(--gold-dim)' : 'var(--charcoal-lighter)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--bone)' }}>
                      <input type="checkbox" checked={selected} onChange={() => togglePronoun(p)} />
                      {p}
                    </label>
                  );
                })}
              </div>
              <input
                type="text"
                value={clientData.pronounsSelfDescribe || ''}
                onChange={e => setClientData({ ...clientData, pronounsSelfDescribe: e.target.value })}
                placeholder="Self-describe (neopronouns, notes)…"
                style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            {/* SMS Appointment Reminder */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Appointment Reminder (SMS)</h3>

              <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: nextAppt ? 'var(--bone)' : 'var(--text-secondary)' }}>
                {nextAppt
                  ? `Next appointment: ${new Date(nextAppt.startTime).toLocaleString()}`
                  : 'No upcoming appointment on file — using a generic reminder.'}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--bone)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!clientData.smsConsent}
                  onChange={e => setClientData({ ...clientData, smsConsent: e.target.checked })}
                />
                Client has given consent to receive appointment reminders by text.
              </label>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Message</label>
                <textarea
                  value={smsBody}
                  onChange={e => setSmsBody(e.target.value)}
                  rows={3}
                  maxLength={640}
                  style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>{smsBody.length}/640 · sent to Twilio, which logs the number and message.</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  className="btn-primary"
                  onClick={handleSendReminder}
                  disabled={smsSending || !clientData.smsConsent}
                  style={{ background: clientData.smsConsent ? 'var(--ember)' : 'var(--charcoal)', color: 'white', fontWeight: 'bold', opacity: (smsSending || !clientData.smsConsent) ? 0.6 : 1 }}
                >
                  {smsSending ? 'Sending…' : 'Send appointment reminder'}
                </button>
                {smsStatus && (
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: smsStatus.ok ? '#4ade80' : '#f87171' }}>
                    {smsStatus.msg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INTAKE */}
        {activeTab === 'intake' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h2 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>Intake / Needs Assessment</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {intakeMeta?.updatedAt ? `Last updated ${new Date(intakeMeta.updatedAt).toLocaleString()}` : 'Not yet completed'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Staff-administered. Health and substance questions are handled separately under Vault B (42-CFR).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {INTAKE_QUESTIONS.map(q => (
                <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>{q.label}</label>

                  {q.type === 'text' && (
                    <textarea
                      value={intakeAnswers[q.id] || ''}
                      onChange={e => setIntakeAnswers({ ...intakeAnswers, [q.id]: e.target.value })}
                      rows={2}
                      style={{ width: '100%', padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                    />
                  )}

                  {q.type === 'select' && (
                    <select
                      value={intakeAnswers[q.id] || ''}
                      onChange={e => setIntakeAnswers({ ...intakeAnswers, [q.id]: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}
                    >
                      <option value="">— select —</option>
                      {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}

                  {q.type === 'yesno' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {['Yes', 'No'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setIntakeAnswers({ ...intakeAnswers, [q.id]: opt })}
                          style={{
                            padding: '0.4rem 1.25rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                            border: '1px solid var(--border-color)',
                            background: intakeAnswers[q.id] === opt ? 'var(--gold)' : 'var(--charcoal-lighter)',
                            color: intakeAnswers[q.id] === opt ? 'var(--charcoal)' : 'var(--text-secondary)',
                            fontWeight: intakeAnswers[q.id] === opt ? 'bold' : 'normal',
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button
                className="btn-primary"
                onClick={handleSaveIntake}
                disabled={intakeSaving}
                style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold', opacity: intakeSaving ? 0.6 : 1 }}
              >
                {intakeSaving ? 'Encrypting…' : 'Save intake to Vault'}
              </button>
              {intakeStatus && (
                <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: intakeStatus.ok ? '#4ade80' : '#f87171' }}>
                  {intakeStatus.msg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* HEALTH */}
        {activeTab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Health (Vault B)</h2>
            <div style={{ background: 'rgba(225, 29, 72, 0.1)', padding: '1rem', borderLeft: '3px solid #e11d48', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>
              This tab is locked behind Vault B 42-CFR protections. Mocked for preview.
            </div>
          </div>
        )}

        {/* HOUSING */}
        {activeTab === 'housing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Housing Tracker</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>Current Status: <strong style={{ color: 'var(--ember)' }}>Pending Vouchers</strong></p>
          </div>
        )}

        {/* VISUAL CANVAS TIMELINE — per-client encrypted board */}
        {activeTab === 'canvas' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2 style={{ color: 'var(--gold)', margin: '0 0 1rem', fontFamily: 'var(--font-serif)' }}>Visual Case Canvas</h2>
            <div style={{ flex: 1 }}>
              <CanvasBoard boardId={`canvas_${activeClientId}`} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
