import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { vaultExists } from '../utils/cryptoEngine';
import { evaluatePassphrase } from '../utils/passphrasePolicy';
import { OPERATOR_NAME_KEY } from './Onboarding';
import { useLanguage } from '../i18n/LanguageContext';

const METER_COLORS = ['#e11d48', '#f97316', '#eab308', '#84cc16', '#4ade80'];

export default function Login() {
  const { t } = useLanguage();
  const { loginWithPassphrase, isDecrypting, error } = useAuthStore();
  // Pre-fill the operator name captured during onboarding, if present.
  const [username, setUsername] = useState(() => localStorage.getItem(OPERATOR_NAME_KEY) || '');
  const [passphrase, setPassphrase] = useState('');
  const [role, setRole] = useState('Lead Navigator');
  const [vaultStatus, setVaultStatus] = useState('');

  // First-ever login on this device enrolls the passphrase, so we show a live
  // strength meter and enforce the policy (finding H3). Returning users (a vault
  // already exists) just authenticate against their existing passphrase.
  const isEnrolling = !vaultExists();
  const strength = isEnrolling && passphrase
    ? evaluatePassphrase(passphrase, { userInputs: [username] })
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (username && passphrase) {
      setVaultStatus('Deriving Vault A key via PBKDF2 (600,000 iterations)...');
      await loginWithPassphrase(username, passphrase, role);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color-main)', backgroundImage: 'radial-gradient(ellipse at bottom, #15151f 0%, #0a0a0f 100%)' }}>
      
      {/* Clinician Interface - Glassmorphism UI */}
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderTop: '4px solid var(--color-accent)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="sidebar-logo-icon" style={{ margin: '0 auto 1rem', width: '48px', height: '48px', boxShadow: '0 0 15px rgba(226, 85, 43, 0.4)' }}></div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Sanctuary</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>{t('login.tagline')}</p>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: 'rgba(225, 29, 72, 0.1)', borderLeft: '3px solid #e11d48', color: '#fda4af', fontSize: '0.85rem' }}>
            🚨 {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('login.operatorRole')}</label>
            <select 
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
            >
              <option value="Lead Navigator">Lead Navigator</option>
              <option value="Field Navigator">Field Navigator</option>
              <option value="Clinician">Clinician</option>
              <option value="Legal Counsel">Legal Counsel</option>
              <option value="Systems Admin">Systems Admin</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('login.operatorId')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('login.operatorIdPlaceholder')}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('login.passphraseLabel')}</label>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder={t('login.passphrasePlaceholder')}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
              required
            />
            {strength && (
              <div style={{ marginTop: '0.6rem' }}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '0.35rem' }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= strength.score ? METER_COLORS[strength.score] : 'var(--border-color)', transition: '0.2s' }} />
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: strength.acceptable ? '#4ade80' : '#fda4af' }}>
                  {strength.acceptable
                    ? `Strength: ${strength.label} ✓`
                    : (strength.reason || `Strength: ${strength.label}`)}
                </div>
                {!strength.acceptable && strength.suggestions[0] && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                    {strength.suggestions[0]}
                  </div>
                )}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={isDecrypting || (isEnrolling && strength && !strength.acceptable)} style={{ marginTop: '0.5rem', background: 'var(--color-accent)', color: 'white', border: 'none', fontWeight: 'bold', letterSpacing: '0.05em', opacity: (isEnrolling && strength && !strength.acceptable) ? 0.5 : 1 }}>
            {isDecrypting ? t('login.openingVault') : (isEnrolling ? t('login.setPassphrase') : t('login.decryptAuth'))}
          </button>
        </form>

        {isDecrypting && (
          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#4ade80', fontFamily: 'monospace', marginTop: '1rem', padding: '1rem', background: '#020617', borderRadius: '4px' }}>
            {vaultStatus}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: '20px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textAlign: 'center' }}>
        <strong>{t('login.footerTitle')}</strong><br/>
        {t('login.footerSubtitle')}
      </div>
    </div>
  );
}
