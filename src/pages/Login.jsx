import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { OPERATOR_NAME_KEY } from './Onboarding';

export default function Login() {
  const { loginWithPassphrase, isDecrypting, error } = useAuthStore();
  // Pre-fill the operator name captured during onboarding, if present.
  const [username, setUsername] = useState(() => localStorage.getItem(OPERATOR_NAME_KEY) || '');
  const [passphrase, setPassphrase] = useState('');
  const [role, setRole] = useState('Lead Navigator');
  const [vaultStatus, setVaultStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (username && passphrase) {
      setVaultStatus('Deriving Dual-Vault Keys via PBKDF2 (600,000 iterations)...');
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>Secure Local-First EHR</p>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: 'rgba(225, 29, 72, 0.1)', borderLeft: '3px solid #e11d48', color: '#fda4af', fontSize: '0.85rem' }}>
            🚨 {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator Role</label>
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator ID</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. dr_richards" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decryption Passphrase</label>
            <input 
              type="password" 
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Requires Master Passphrase" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isDecrypting} style={{ marginTop: '0.5rem', background: 'var(--color-accent)', color: 'white', border: 'none', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            {isDecrypting ? 'Decrypting Vaults...' : 'Decrypt & Authenticate'}
          </button>
        </form>

        {isDecrypting && (
          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#4ade80', fontFamily: 'monospace', marginTop: '1rem', padding: '1rem', background: '#020617', borderRadius: '4px' }}>
            {vaultStatus}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: '20px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textAlign: 'center' }}>
        <strong>Technical Incapacity Defense Active</strong><br/>
        Zero-Knowledge Architecture · Vault Keys held exclusively in RAM
      </div>
    </div>
  );
}
