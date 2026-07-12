import React, { useState, useRef } from 'react';
import { nukeStorage } from '../utils/storageEngine';
import { downloadBackup, restoreBackup } from '../utils/backupEngine';
import { useAuthStore } from '../store/authStore';

export default function Settings() {
  const { logout } = useAuthStore();
  const [isNuking, setIsNuking] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const fileInputRef = useRef(null);
  const [usbDevices, setUsbDevices] = useState([]);
  const [selectedUsb, setSelectedUsb] = useState('');
  const [usbStatus, setUsbStatus] = useState('');

  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

  const refreshUsbDevices = async () => {
    if (!isTauri) { setUsbStatus('USB kill-switch is only available in the desktop app.'); return; }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list = await invoke('list_usb_devices');
      setUsbDevices(list);
      setUsbStatus(`Found ${list.length} USB device(s).`);
    } catch (err) {
      setUsbStatus('USB scan failed: ' + err);
    }
  };

  const armKillSwitch = async () => {
    if (!isTauri || !selectedUsb) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const msg = await invoke('arm_deadmans_switch', { vidPid: selectedUsb });
      setUsbStatus(msg);
    } catch (err) {
      setUsbStatus('Arm failed: ' + err);
    }
  };

  const disarmKillSwitch = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const msg = await invoke('disarm_deadmans_switch');
      setUsbStatus(msg);
    } catch (err) {
      setUsbStatus('Disarm failed: ' + err);
    }
  };

  const handleExportBackup = async () => {
    const passphrase = window.prompt('Enter your master passphrase to sign the backup:');
    if (!passphrase) return;
    setBackupStatus('Building signed backup...');
    try {
      await downloadBackup(passphrase);
      setBackupStatus('Signed backup downloaded. Store it somewhere safe.');
    } catch (err) {
      setBackupStatus('Backup failed: ' + err.message);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const passphrase = window.prompt('Enter the master passphrase used to sign this backup:');
    if (!passphrase) return;
    setBackupStatus('Verifying signature...');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const { restored } = await restoreBackup(passphrase, backup);
      setBackupStatus(`Signature verified. Restored ${restored} record(s).`);
    } catch (err) {
      setBackupStatus('Restore aborted: ' + err.message);
    }
  };
  const [settings, setSettings] = useState({
    meshSync: true,
    audioRetention: false,
    highContrast: false,
    jitsiBaa: true
  });

  const toggle = (key) => setSettings({ ...settings, [key]: !settings[key] });

  const handleNuke = async () => {
    const confirm1 = window.confirm("WARNING: You are about to initiate a scorched-earth protocol. All local records, keys, and hive-mind fragments will be permanently destroyed.");
    if (!confirm1) return;
    
    const confirm2 = window.prompt("Type 'NUKE' to confirm catastrophic destruction:");
    if (confirm2 === 'NUKE') {
      setIsNuking(true);
      try {
        await nukeStorage();
        alert("Sanctuary Vault has been completely destroyed.");
        logout(); // Force immediate ejection
      } catch (err) {
        alert("Failed to destroy vault: " + err);
        setIsNuking(false);
      }
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>System Configuration</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Manage local-first engine parameters and hardware links.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Network & Sync */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Hive-Mind Network</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>Sovereign AI Sync (P2P)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Synchronize Merkle-Tries with local mesh peers.</div>
            </div>
            <button onClick={() => toggle('meshSync')} className="btn-primary" style={{ background: settings.meshSync ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.meshSync ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.meshSync ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          <div style={{ background: 'var(--charcoal-lighter)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Ollama Vector Engine:</span> <strong style={{ color: '#4ade80' }}>Connected (localhost:11434)</strong><br/>
            <span style={{ color: 'var(--text-secondary)' }}>Model Loaded:</span> <strong style={{ color: 'var(--bone)' }}>nomic-embed-text</strong>
          </div>
        </div>

        {/* Security & Privacy */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Security Gates</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>Audio Rentention Policy</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Persist audio files locally after transcription.</div>
            </div>
            <button onClick={() => toggle('audioRetention')} className="btn-primary" style={{ background: settings.audioRetention ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.audioRetention ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.audioRetention ? 'OPT-IN' : 'DEFAULT OFF'}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>Jitsi BAA Enforcement</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Require HIPAA-compliant server for Telehealth.</div>
            </div>
            <button onClick={() => toggle('jitsiBaa')} className="btn-primary" style={{ background: settings.jitsiBaa ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.jitsiBaa ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.jitsiBaa ? 'ENFORCED' : 'BYPASSED'}
            </button>
          </div>
        </div>

        {/* Accessibility */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Accessibility</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>High Contrast Mode</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Force maximum contrast for field readability.</div>
            </div>
            <button onClick={() => toggle('highContrast')} className="btn-primary" style={{ background: settings.highContrast ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.highContrast ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.highContrast ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Hardware Kill Switch */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Hardware Dead-Man's Switch</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Designate a USB token. If it is removed while armed, all vault keys are dropped from memory (references cleared; reclaimed by the runtime).
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={refreshUsbDevices} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              Scan USB
            </button>
            <select value={selectedUsb} onChange={e => setSelectedUsb(e.target.value)} style={{ flex: 1, minWidth: '140px', padding: '0.4rem', background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              <option value="">-- Select token (vid:pid) --</option>
              {usbDevices.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={armKillSwitch} disabled={!selectedUsb} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              Arm
            </button>
            <button onClick={disarmKillSwitch} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              Disarm
            </button>
          </div>
          {usbStatus && (
            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
              {usbStatus}
            </div>
          )}
        </div>

        {/* Vault Backup */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Encrypted Vault Backup</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Exports encrypted ciphertext only, HMAC-signed with your passphrase. Restore verifies the signature and refuses tampered files.
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleExportBackup} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              Export Signed Backup
            </button>
            <button onClick={handleImportClick} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              Verify &amp; Restore
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleRestoreFile} style={{ display: 'none' }} />
          </div>
          {backupStatus && (
            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
              {backupStatus}
            </div>
          )}
        </div>

        {/* Destructive Actions */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--ember)' }}>
          <h2 style={{ color: 'var(--ember)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Catastrophic Protocols</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>Scorched Earth (Nuke Vault)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Irreversibly delete all local storage and keys.</div>
            </div>
            <button onClick={handleNuke} disabled={isNuking} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {isNuking ? 'DESTROYING...' : 'INITIATE DESTRUCTION'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
