import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { useLanguage } from '../i18n/LanguageContext';

// Vault B (BridgeVault) — HRT "No-Interruption" continuity tracking.
// Maryland Trans Shield Act posture: gender-affirming care data is local-first,
// encrypted under the SEPARATE Vault B key, and inaccessible when Vault B is
// panic-closed. Records are keyed 'hrt_<clientRef>'.
export default function HrtTracking() {
  const { t } = useLanguage();
  const { vaultBKey } = useAuthStore();
  const [clientRef, setClientRef] = useState('');
  const [record, setRecord] = useState({
    chosenName: '',
    genderMarkerHistory: '',
    regimen: '',
    refillWindow: '',
    prescriber: '',
    pharmacy: ''
  });
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const vaultOpen = !!vaultBKey;

  // Load an existing HRT record when a client reference is entered.
  useEffect(() => {
    async function load() {
      if (!vaultBKey || !clientRef.trim()) return;
      try {
        const stored = await loadSecureRecord(vaultBKey, `hrt_${clientRef.trim()}`, 'B');
        if (stored) {
          setRecord(stored);
          setStatus(t('hrt.loaded'));
        }
      } catch {
        setStatus(t('hrt.errDecrypt'));
      }
    }
    load();
  }, [vaultBKey, clientRef]);

  const update = (field, value) => setRecord({ ...record, [field]: value });

  const handleSave = async () => {
    if (!vaultBKey) { setStatus(t('hrt.errVaultClosed')); return; }
    if (!clientRef.trim()) { setStatus(t('hrt.errNeedRef')); return; }
    setIsSaving(true);
    try {
      await saveSecureRecord(vaultBKey, `hrt_${clientRef.trim()}`, record, 'B');
      setStatus(t('hrt.saved'));
    } catch (err) {
      setStatus(t('hrt.errSave') + err.message);
    }
    setIsSaving(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>{t('hrt.title')}</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
          {t('hrt.subtitle')}
        </p>
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          {t('hrt.vaultClosedBanner')}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: vaultOpen ? 1 : 0.5, pointerEvents: vaultOpen ? 'auto' : 'none' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('hrt.clientRefId')}</label>
          <input type="text" value={clientRef} onChange={e => setClientRef(e.target.value)} placeholder={t('hrt.clientRefPlaceholder')} style={inputStyle} />
        </div>

        <h2 style={sectionStyle}>{t('hrt.genderSection')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>{t('hrt.aliasLabel')}</label>
            <input type="text" value={record.chosenName} onChange={e => update('chosenName', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('hrt.genderHistory')}</label>
            <input type="text" value={record.genderMarkerHistory} onChange={e => update('genderMarkerHistory', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <h2 style={sectionStyle}>{t('hrt.regimenSection')}</h2>
        <div>
          <label style={labelStyle}>{t('hrt.currentRegimen')}</label>
          <input type="text" value={record.regimen} onChange={e => update('regimen', e.target.value)} placeholder={t('hrt.regimenPlaceholder')} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>{t('hrt.refillWindow')}</label>
            <input type="date" value={record.refillWindow} onChange={e => update('refillWindow', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('hrt.prescriber')}</label>
            <input type="text" value={record.prescriber} onChange={e => update('prescriber', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('hrt.pharmacyContact')}</label>
          <input type="text" value={record.pharmacy} onChange={e => update('pharmacy', e.target.value)} style={inputStyle} />
        </div>

        <button onClick={handleSave} disabled={isSaving || !vaultOpen} className="btn-primary" style={{ background: '#e11d48', color: 'white', fontWeight: 'bold', padding: '0.75rem', alignSelf: 'flex-start' }}>
          {isSaving ? t('hrt.encrypting') : t('hrt.encryptSave')}
        </button>
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px' }}>
          {status}
        </div>
      )}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' };
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' };
const sectionStyle = { color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.1rem' };
