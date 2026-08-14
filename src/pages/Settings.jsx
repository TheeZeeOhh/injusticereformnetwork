import React, { useState, useRef, useEffect } from 'react';
import { nukeStorage } from '../utils/storageEngine';
import { downloadBackup, restoreBackup } from '../utils/backupEngine';
import { getEntries, verifyChain, appendEntry } from '../utils/auditLog';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLanguage } from '../i18n/LanguageContext';
import { pickTextFile } from '../utils/fileTransfer';
import { enrollDuressPassphrase, clearDuressPassphrase, duressEnrolled } from '../utils/cryptoEngine';
import { passphraseRejectionReason } from '../utils/passphrasePolicy';

export default function Settings() {
  const { logout } = useAuthStore();
  const { lang, setLang, t } = useLanguage();
  const theme = useSettingsStore(s => s.theme.mode);
  const setTheme = useSettingsStore(s => s.setTheme);
  const ticker = useSettingsStore(s => s.ticker);
  const setTickerEnabled = useSettingsStore(s => s.setTickerEnabled);
  const setTickerSpeed = useSettingsStore(s => s.setTickerSpeed);
  const setTickerMessages = useSettingsStore(s => s.setTickerMessages);
  const resetTicker = useSettingsStore(s => s.resetTicker);
  const jitsiDomain = useSettingsStore(s => s.jitsi.domain);
  const setJitsiDomain = useSettingsStore(s => s.setJitsiDomain);
  // Local raw input so typing dots/hyphens isn't filtered mid-entry; committed
  // (normalized) to the store on blur.
  const [jitsiInput, setJitsiInput] = useState(jitsiDomain);
  const [isNuking, setIsNuking] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [usbDevices, setUsbDevices] = useState([]);
  const [selectedUsb, setSelectedUsb] = useState('');
  const [usbStatus, setUsbStatus] = useState('');
  const [duressInput, setDuressInput] = useState('');
  const [duressStatus, setDuressStatus] = useState('');
  const [duressSet, setDuressSet] = useState(() => {
    try { return duressEnrolled(); } catch { return false; }
  });

  const registerDuress = async () => {
    if (!duressInput) { setDuressStatus('Enter a duress passphrase.'); return; }
    const reason = passphraseRejectionReason(duressInput);
    if (reason) { setDuressStatus(reason); return; }
    try {
      await enrollDuressPassphrase(duressInput);
      setDuressInput('');
      setDuressSet(true);
      setDuressStatus('Duress passphrase set. Entering it at login triggers the wipe.');
    } catch (err) {
      setDuressStatus(err.message);
    }
  };

  const removeDuress = () => {
    clearDuressPassphrase();
    setDuressSet(false);
    setDuressStatus('Duress passphrase removed.');
  };

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
      appendEntry({ action: 'admin', recordId: 'killswitch_arm', vaultTag: null });
      // Arming also persists this token as the insertion trigger: re-inserting it
      // later (even before unlock) offers to bring Sanctuary up to the unlock screen.
      setUsbStatus(msg + ' This token will also prompt to start Sanctuary when re-inserted.');
    } catch (err) {
      setUsbStatus('Arm failed: ' + err);
    }
  };

  const disarmKillSwitch = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const msg = await invoke('disarm_deadmans_switch');
      appendEntry({ action: 'admin', recordId: 'killswitch_disarm', vaultTag: null });
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
      appendEntry({ action: 'admin', recordId: 'backup_export', vaultTag: null });
      setBackupStatus('Signed backup downloaded. Store it somewhere safe.');
    } catch (err) {
      setBackupStatus('Backup failed: ' + err.message);
    }
  };

  // Native picker — the hidden <input type="file"> never opened a chooser in
  // the Tauri webview (finding B1), so Restore silently did nothing.
  const handleImportClick = async () => {
    const picked = await pickTextFile({
      title: 'Select a Sanctuary backup file',
      accept: 'application/json',
      filters: [{ name: 'Sanctuary backup', extensions: ['json'] }],
    });
    if (!picked.picked) return;
    const passphrase = window.prompt('Enter the master passphrase used to sign this backup:');
    if (!passphrase) return;
    setBackupStatus('Verifying signature...');
    try {
      const backup = JSON.parse(picked.text);
      const { restored } = await restoreBackup(passphrase, backup);
      appendEntry({ action: 'admin', recordId: `backup_restore:${restored}`, vaultTag: null });
      setBackupStatus(`Signature verified. Restored ${restored} record(s).`);
    } catch (err) {
      setBackupStatus('Restore aborted: ' + err.message);
    }
  };
  const [settings, setSettings] = useState({
    meshSync: true,
    audioRetention: false,
    highContrast: false
  });

  const toggle = (key) => setSettings({ ...settings, [key]: !settings[key] });

  // Ticker message editing (operates on the persisted settings store).
  const updateTickerMessage = (i, value) => {
    const next = [...ticker.messages];
    next[i] = value;
    setTickerMessages(next);
  };
  const removeTickerMessage = (i) => setTickerMessages(ticker.messages.filter((_, idx) => idx !== i));
  const addTickerMessage = () => setTickerMessages([...ticker.messages, 'New alert']);

  // Tamper-evident audit log viewer.
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditVerify, setAuditVerify] = useState(null);
  const { vaultAKey, vaultBKey, isAuthenticated } = useAuthStore();
  const [selfTestReport, setSelfTestReport] = useState(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);

  // Ninjabot — defensive watch over the audit chain + integrity signals.
  const [ninjaReport, setNinjaReport] = useState(null);
  const [ninjaRunning, setNinjaRunning] = useState(false);

  const handleNinjabot = async () => {
    setNinjaRunning(true);
    setNinjaReport(null);
    try {
      const { runNinjabot } = await import('../utils/ninjabot');
      setNinjaReport(await runNinjabot());
    } catch (err) {
      setNinjaReport({ status: 'critical', findings: [{ id: 'error', severity: 'critical', title: 'Ninjabot error', detail: String(err && err.message ? err.message : err) }] });
    }
    setNinjaRunning(false);
  };

  // "Prove It" — run the read-only security self-test over live app state.
  const handleSelfTest = async () => {
    setSelfTestRunning(true);
    setSelfTestReport(null);
    try {
      const { runSelfTest } = await import('../utils/selfTest');
      const report = await runSelfTest({ vaultAKey, vaultBKey, isAuthenticated });
      setSelfTestReport(report);
    } catch (err) {
      setSelfTestReport({ ok: false, checks: [{ id: 'error', label: 'Self-test', status: 'fail', detail: String(err && err.message ? err.message : err) }] });
    }
    setSelfTestRunning(false);
  };

  const refreshAudit = async () => {
    try {
      const entries = await getEntries();
      // Show the most recent first, cap the rendered list.
      setAuditEntries(entries.slice(-100).reverse());
    } catch {
      setAuditEntries([]);
    }
  };

  useEffect(() => { refreshAudit(); }, []);

  const handleVerifyAudit = async () => {
    setAuditVerify(null);
    try {
      const result = await verifyChain();
      setAuditVerify(result);
      await refreshAudit();
    } catch (err) {
      setAuditVerify({ ok: false, error: err.message });
    }
  };

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
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>{t('settings.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          {t('settings.description')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

        {/* Language */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.language')}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{t('settings.languageHelp')}</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['en', 'es', 'fr'].map((c) => (
              <button
                key={c}
                onClick={() => setLang(c)}
                aria-pressed={lang === c}
                className="btn-primary"
                style={{ flex: 1, padding: '0.5rem', background: lang === c ? 'var(--gold)' : 'var(--charcoal-lighter)', color: lang === c ? 'var(--charcoal)' : 'var(--text-secondary)', fontWeight: lang === c ? 'bold' : 'normal' }}
              >
                {t(`lang.${c}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('theme.label')}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{t('theme.help')}</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['dark', 'light'].map((m) => (
              <button
                key={m}
                onClick={() => setTheme(m)}
                aria-pressed={theme === m}
                className="btn-primary"
                style={{ flex: 1, padding: '0.5rem', background: theme === m ? 'var(--gold)' : 'var(--charcoal-lighter)', color: theme === m ? 'var(--charcoal)' : 'var(--text-secondary)', fontWeight: theme === m ? 'bold' : 'normal' }}
              >
                {t(`theme.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Network & Sync */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.networkHeading')}</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.syncTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.syncDesc')}</div>
            </div>
            <button onClick={() => toggle('meshSync')} className="btn-primary" style={{ background: settings.meshSync ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.meshSync ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.meshSync ? t('settings.enabled') : t('settings.disabled')}
            </button>
          </div>

          <div style={{ background: 'var(--charcoal-lighter)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{t('settings.ollamaEngine')}</span> <strong style={{ color: '#4ade80' }}>{t('settings.ollamaConnected')}</strong><br/>
            <span style={{ color: 'var(--text-secondary)' }}>{t('settings.modelLoaded')}</span> <strong style={{ color: 'var(--bone)' }}>nomic-embed-text</strong>
          </div>
        </div>

        {/* $SOUL Token Module — admin-only entry point. Settings is already gated to
            Systems Admin at the route level (App.jsx ProtectedRoute). The $SOUL console
            is a SEPARATE, isolated module (soul-token/) that never runs inside this
            PHI-vault app; this is only a link out to it. */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>⛓️ $SOUL Token Module</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            The $SOUL token console runs as a <strong style={{ color: 'var(--bone)' }}>separate, isolated module</strong> — never inside this records app.
            It signs with your browser wallet (MetaMask); no private key ever enters Sanctuary. Currently targets the <strong style={{ color: 'var(--gold)' }}>Sepolia testnet</strong>.
          </div>
          <div style={{ background: '#020617', borderLeft: '3px solid var(--gold)', padding: '0.75rem', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Open <strong style={{ color: 'var(--bone)' }}>soul-token/index.html</strong> in a wallet-enabled browser, or run the deploy tooling from the <strong style={{ color: 'var(--bone)' }}>soul-token/</strong> directory. See <strong style={{ color: 'var(--bone)' }}>soul-token/README.md</strong>.
          </div>
          <button
            onClick={() => { try { window.open('/soul-token/index.html', '_blank', 'noopener'); } catch { /* opening handled by host */ } }}
            className="btn-primary"
            style={{ background: 'var(--gold)', color: '#000', fontWeight: 'bold', padding: '0.6rem 1rem', alignSelf: 'flex-start' }}
          >
            Open $SOUL Console ↗
          </button>
        </div>

        {/* Security & Privacy */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.securityGates')}</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.audioRetentionTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.audioRetentionDesc')}</div>
            </div>
            <button onClick={() => toggle('audioRetention')} className="btn-primary" style={{ background: settings.audioRetention ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.audioRetention ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.audioRetention ? t('settings.optIn') : t('settings.defaultOff')}
            </button>
          </div>

          <div>
            <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>{t('settings.jitsiBaaTitle')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: '#020617', borderLeft: '3px solid var(--gold)', padding: '0.75rem', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              {t('settings.jitsiBaaDesc1')}<strong style={{ color: 'var(--bone)' }}>{t('settings.alwaysOn')}</strong>{t('settings.jitsiBaaDesc2')}
              <strong style={{ color: 'var(--bone)' }}>{t('settings.only')}</strong>{t('settings.jitsiBaaDesc3')}
            </div>
          </div>
        </div>

        {/* Accessibility */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.accessibilityHeading')}</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.highContrastTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.highContrastDesc')}</div>
            </div>
            <button onClick={() => toggle('highContrast')} className="btn-primary" style={{ background: settings.highContrast ? '#4ade80' : 'var(--charcoal-lighter)', color: settings.highContrast ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {settings.highContrast ? t('settings.on') : t('settings.off')}
            </button>
          </div>
        </div>

        {/* Status Ticker */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.statusTickerHeading')}</h2>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.showTickerTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.showTickerDesc')}</div>
            </div>
            <button onClick={() => setTickerEnabled(!ticker.enabled)} className="btn-primary" style={{ background: ticker.enabled ? '#4ade80' : 'var(--charcoal-lighter)', color: ticker.enabled ? '#0f172a' : 'var(--text-secondary)', padding: '0.4rem 1rem' }}>
              {ticker.enabled ? t('settings.on') : t('settings.off')}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.scrollSpeedTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.scrollSpeedDesc')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input type="range" min="5" max="60" step="1" value={ticker.speed} onChange={e => setTickerSpeed(e.target.value)} style={{ accentColor: 'var(--gold)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--bone)', fontSize: '0.85rem', minWidth: '2.5rem', textAlign: 'right' }}>{ticker.speed}s</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{t('settings.messagesTitle')}</div>
            {ticker.messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={msg}
                  onChange={e => updateTickerMessage(i, e.target.value)}
                  style={{ flex: 1, padding: '0.5rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
                <button onClick={() => removeTickerMessage(i)} title="Remove" style={{ background: 'var(--charcoal-lighter)', color: 'var(--ember)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.4rem 0.7rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  ✕
                </button>
              </div>
            ))}
            {ticker.messages.length === 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {t('settings.noMessagesDesc')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={addTickerMessage} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {t('settings.addMessage')}
            </button>
            <button onClick={resetTicker} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              {t('settings.resetDefault')}
            </button>
          </div>
        </div>

        {/* Telehealth (self-hosted Jitsi) */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.telehealthHeading')}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {t('settings.telehealthDesc')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{t('settings.jitsiLabel')}</label>
            <input
              type="text"
              value={jitsiInput}
              onChange={e => setJitsiInput(e.target.value)}
              onBlur={() => setJitsiDomain(jitsiInput)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setJitsiDomain(jitsiInput); e.target.blur(); } }}
              placeholder="meet.yourorg.org"
              style={{ padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: jitsiDomain ? '#4ade80' : '#f87171' }}>
            {jitsiDomain
              ? `${t('settings.telehealthConnected')}${jitsiDomain}`
              : t('settings.telehealthDisabled')}
          </div>
        </div>

        {/* Hardware Kill Switch */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.killSwitchHeading')}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {t('settings.killSwitchDesc')}
          </div>
          <button onClick={refreshUsbDevices} className="btn-primary" style={{ alignSelf: 'flex-start', background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
            {t('settings.scanUsb')}
          </button>

          {/* Device picker: a styled button list, not a native <select>. Native
              <option> elements render invisibly in the GTK/webkit webview, so
              this list is used instead. Click a device to select it as the token. */}
          {usbDevices.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t('settings.selectTokenLabel')}</div>
              {usbDevices.map(d => {
                const sel = selectedUsb === d;
                return (
                  <button key={d} onClick={() => setSelectedUsb(d)} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', cursor: 'pointer', background: sel ? 'var(--gold)' : 'var(--charcoal-lighter)', color: sel ? 'var(--charcoal)' : 'var(--bone)', border: sel ? '1px solid var(--gold)' : '1px solid var(--border-color)' }}>
                    {sel ? '● ' : '○ '}{d}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {t('settings.noDevicesPrefix')}<strong>{t('settings.scanUsb')}</strong>.
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={armKillSwitch} disabled={!selectedUsb} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold', opacity: selectedUsb ? 1 : 0.5, cursor: selectedUsb ? 'pointer' : 'not-allowed' }}>
              {t('settings.arm')}{selectedUsb ? ` (${selectedUsb})` : ''}
            </button>
            <button onClick={disarmKillSwitch} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              {t('settings.disarm')}
            </button>
          </div>
          {usbStatus && (
            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
              {usbStatus}
            </div>
          )}
        </div>

        {/* Duress Passphrase */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--ember)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Duress Passphrase</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            A second passphrase that, entered at the login screen, silently triggers the panic wipe instead of unlocking — for use under coercion. On IRN OS it irreversibly destroys the disk-encryption keys and powers off; elsewhere it drops in-memory keys. It must differ from every real vault passphrase. Status: <strong>{duressSet ? 'SET' : 'not set'}</strong>.
          </div>
          <input
            type="password"
            value={duressInput}
            onChange={(e) => setDuressInput(e.target.value)}
            placeholder="Duress passphrase"
            style={{ padding: '0.5rem 0.75rem', borderRadius: '4px', background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
          />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={registerDuress} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {duressSet ? 'Replace duress passphrase' : 'Set duress passphrase'}
            </button>
            {duressSet && (
              <button onClick={removeDuress} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
                Remove
              </button>
            )}
          </div>
          {duressStatus && (
            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
              {duressStatus}
            </div>
          )}
        </div>

        {/* Vault Backup */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.backupHeading')}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {t('settings.backupDesc')}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleExportBackup} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {t('settings.exportBackup')}
            </button>
            <button onClick={handleImportClick} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
              {t('settings.verifyRestore')}
            </button>
          </div>
          {backupStatus && (
            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
              {backupStatus}
            </div>
          )}
        </div>

        {/* Ninjabot — defensive watch (read-only, on-device, advisory) */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <div>
              <h2 style={{ color: 'var(--bone)', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('ninjabot.heading')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', margin: '0.25rem 0 0' }}>{t('ninjabot.subtitle')}</p>
            </div>
            <button onClick={handleNinjabot} disabled={ninjaRunning} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {ninjaRunning ? t('ninjabot.running') : t('ninjabot.run')}
            </button>
          </div>

          {ninjaReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: ninjaReport.status === 'critical' ? '#f87171' : ninjaReport.status === 'warn' ? '#fbbf24' : '#4ade80' }}>
                {t('ninjabot.status.' + ninjaReport.status)}
              </div>
              {ninjaReport.findings.map((f, i) => {
                const color = f.severity === 'critical' ? '#f87171' : f.severity === 'warn' ? '#fbbf24' : '#4ade80';
                const icon = f.severity === 'critical' ? '⚠' : f.severity === 'warn' ? '!' : '✓';
                return (
                  <div key={f.id + i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', padding: '0.6rem 0.75rem', borderRadius: '4px', background: '#020617', borderLeft: `3px solid ${color}` }}>
                    <span style={{ color, fontWeight: 'bold', fontSize: '1rem', lineHeight: 1.2 }}>{icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ color: 'var(--bone)' }}>{f.title}</span>
                      <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{f.detail}</span>
                    </span>
                  </div>
                );
              })}
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', margin: '0.25rem 0 0', opacity: 0.7 }}>{t('ninjabot.footnote')}</p>
            </div>
          )}
        </div>

        {/* "Prove It" — live security self-test (Technical Incapacity Defense) */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <div>
              <h2 style={{ color: 'var(--bone)', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('selftest.heading')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', margin: '0.25rem 0 0' }}>{t('selftest.subtitle')}</p>
            </div>
            <button onClick={handleSelfTest} disabled={selfTestRunning} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {selfTestRunning ? t('selftest.running') : t('selftest.run')}
            </button>
          </div>

          {selfTestReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: selfTestReport.ok ? '#4ade80' : '#f87171' }}>
                {selfTestReport.ok ? t('selftest.allPass') : t('selftest.someFail')}
              </div>
              {selfTestReport.checks.map((c) => {
                const color = c.status === 'pass' ? '#4ade80' : c.status === 'fail' ? '#f87171' : c.status === 'warn' ? '#fbbf24' : 'var(--text-secondary)';
                const icon = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : c.status === 'warn' ? '!' : '–';
                return (
                  <div key={c.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', padding: '0.6rem 0.75rem', borderRadius: '4px', background: '#020617' }}>
                    <span style={{ color, fontWeight: 'bold', fontSize: '1rem', lineHeight: 1.2 }}>{icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ color: 'var(--bone)' }}>{t('selftest.check.' + c.id)}</span>
                      <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{c.detail}</span>
                    </span>
                    <span style={{ color, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>{t('selftest.status.' + c.status)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tamper-Evident Audit Log */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h2 style={{ color: 'var(--bone)', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.auditLogHeading')}</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={refreshAudit} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', color: 'var(--bone)', border: '1px solid var(--border-color)', padding: '0.4rem 1rem' }}>
                {t('settings.refresh')}
              </button>
              <button onClick={handleVerifyAudit} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
                {t('settings.verifyIntegrity')}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {t('settings.auditLogDesc')}
          </div>

          {auditVerify && (
            <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', padding: '0.75rem', borderRadius: '4px', background: '#020617', color: auditVerify.ok ? '#4ade80' : '#f87171' }}>
              {auditVerify.error
                ? `${t('settings.verifyError')}${auditVerify.error}`
                : auditVerify.ok
                  ? `${t('settings.chainIntactPrefix')}${auditVerify.count}${auditVerify.count === 1 ? t('settings.entryVerified') : t('settings.entriesVerified')}`
                  : `${t('settings.tamperingDetectedPrefix')}${auditVerify.brokenAtSeq}.`}
            </div>
          )}

          <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
            {auditEntries.length === 0 ? (
              <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {t('settings.noAuditEntries')}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--charcoal)' }}>
                    <th style={{ padding: '0.5rem' }}>{t('settings.timeCol')}</th>
                    <th style={{ padding: '0.5rem' }}>{t('settings.actionCol')}</th>
                    <th style={{ padding: '0.5rem' }}>{t('settings.vaultCol')}</th>
                    <th style={{ padding: '0.5rem' }}>{t('settings.recordCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e.seq} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{new Date(e.ts).toLocaleString()}</td>
                      <td style={{ padding: '0.5rem', color: e.locked ? 'var(--text-tertiary)' : e.action === 'delete' ? 'var(--ember)' : e.action === 'admin' ? '#a78bfa' : e.action === 'write' ? 'var(--gold)' : 'var(--bone)' }}>{e.locked ? t('settings.sealed') : e.action}</td>
                      <td style={{ padding: '0.5rem' }}>{e.locked ? '—' : (e.vaultTag || '—')}</td>
                      <td style={{ padding: '0.5rem', wordBreak: 'break-all', color: e.locked ? 'var(--text-tertiary)' : 'inherit' }}>{e.locked ? t('settings.unreadable') : e.recordId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Destructive Actions */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--ember)' }}>
          <h2 style={{ color: 'var(--ember)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('settings.catastrophicHeading')}</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>{t('settings.nukeTitle')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('settings.nukeDesc')}</div>
            </div>
            <button onClick={handleNuke} disabled={isNuking} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', padding: '0.4rem 1rem', fontWeight: 'bold' }}>
              {isNuking ? t('settings.destroying') : t('settings.initiateDestruction')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
