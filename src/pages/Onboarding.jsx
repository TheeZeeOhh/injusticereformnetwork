import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ensureSaltsInitialized } from '../utils/cryptoEngine';

export const OPERATOR_NAME_KEY = 'sanctuary_operator_name';
export const OPERATOR_ROLE_KEY = 'sanctuary_operator_role';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [operatorName, setOperatorName] = useState('');
  const [operatorRole, setOperatorRole] = useState('Lead Navigator');
  const [saltsReady, setSaltsReady] = useState(false);
  const [ackIncapacity, setAckIncapacity] = useState(false);
  const [ack42cfr, setAck42cfr] = useState(false);

  const complianceComplete = ackIncapacity && ack42cfr;
  const navigate = useNavigate();
  const completeOnboarding = useAuthStore(state => state.completeOnboarding);

  const handleNext = async () => {
    // Entering step 2: actually generate this device's per-install salts.
    if (step === 1) {
      await ensureSaltsInitialized();
      setSaltsReady(true);
      setStep(2);
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Both compliance acknowledgments are required before proceeding.
      if (!complianceComplete) return;
      // Persist the chosen name so Login can pre-fill it. Not sensitive.
      if (operatorName.trim()) {
        localStorage.setItem(OPERATOR_NAME_KEY, operatorName.trim());
      }
      localStorage.setItem(OPERATOR_ROLE_KEY, operatorRole);
      completeOnboarding();
      navigate('/');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '2rem' }}>
      <div className="glass-panel" style={{ maxWidth: '700px', width: '100%', padding: '3rem', position: 'relative', overflow: 'hidden' }}>
        
        {/* Progress Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '3rem' }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{ flex: 1, height: '4px', background: s <= step ? 'var(--gold)' : 'var(--border-color)', borderRadius: '2px', transition: '0.3s' }}></div>
          ))}
        </div>

        {/* Step 1: Welcome & Identity */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.5s' }}>
            <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>Welcome to Sanctuary</h1>
            <p style={{ color: 'var(--bone)', marginBottom: '2rem', fontSize: '1.1rem' }}>
              You are initializing a secure Navigator terminal. Unlike traditional EHRs, Sanctuary operates on a Zero-Trust, local-first architecture. 
            </p>
            <div style={{ background: 'var(--charcoal-lighter)', padding: '1.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Operator Alias / Full Name</label>
                <input type="text" value={operatorName} onChange={e => setOperatorName(e.target.value)} placeholder="Enter your chosen identifier..." style={{ width: '100%', padding: '1rem', fontSize: '1rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Operator Role</label>
                <select value={operatorRole} onChange={e => setOperatorRole(e.target.value)} style={{ width: '100%', padding: '1rem', fontSize: '1rem', background: 'var(--charcoal)', color: 'var(--bone)', border: '1px solid var(--border-color)' }}>
                  <option value="Lead Navigator">Lead Navigator</option>
                  <option value="Field Navigator">Field Navigator</option>
                  <option value="Clinician">Clinician</option>
                  <option value="Legal Counsel">Legal Counsel</option>
                  <option value="Systems Admin">Systems Admin</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Cryptographic Setup */}
        {step === 2 && (
          <div style={{ animation: 'fadeIn 0.5s' }}>
            <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>Cryptographic Setup</h1>
            <p style={{ color: 'var(--bone)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
              This device's unique random salts have been generated. Your actual
              AES-256-GCM vault keys are derived from the passphrase you set on the
              next screen — via PBKDF2 (600,000 iterations) — and are held only in
              memory. No key material is ever written to disk or leaves this device.
            </p>
            <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1rem 1.25rem', borderRadius: '4px', borderLeft: '4px solid var(--ember)', marginBottom: '2rem' }}>
              <p style={{ color: 'var(--bone)', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                <strong>Vault B is separate.</strong> The most sensitive records
                (42 CFR Part 2, HRT) live in Vault B, which uses its <strong>own
                distinct passphrase</strong>. You will set it the first time you
                open Vault B. It is <strong>unrecoverable by design</strong>: there
                is no reset and no escrow, so if you forget it, Vault B data is
                permanently lost.
              </p>
            </div>
            <div style={{ background: 'var(--charcoal-lighter)', padding: '1.5rem', borderRadius: '4px', border: '1px solid var(--gold)', marginBottom: '2rem' }}>
              <div style={{ color: 'var(--gold)', fontSize: '2rem', marginBottom: '1rem', textAlign: 'center' }}>🔐</div>
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--bone)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
                <span style={{ color: '#4ade80' }}>[OK]</span> Per-install salts generated {saltsReady ? '✓' : '…'}<br/>
                <span style={{ color: 'var(--text-secondary)' }}>[PENDING]</span> Vault keys — derived when you set your passphrase<br/>
                <span style={{ color: 'var(--text-secondary)' }}>Cipher:</span> AES-256-GCM · <span style={{ color: 'var(--text-secondary)' }}>KDF:</span> PBKDF2-SHA256 (600k)
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Hardware Lock */}
        {step === 3 && (
          <div style={{ animation: 'fadeIn 0.5s' }}>
            <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>Hardware Dead-Man's Switch</h1>
            <p style={{ color: 'var(--bone)', marginBottom: '2rem', fontSize: '1.1rem' }}>
              Please insert your designated YubiKey or secure USB token. If this token is removed while armed, Sanctuary drops all cryptographic keys from RAM (they become inaccessible and are reclaimed by the runtime).
            </p>
            <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1.5rem', borderRadius: '4px', borderLeft: '4px solid var(--ember)', marginBottom: '2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                <input type="checkbox" style={{ transform: 'scale(1.5)' }} />
                <span style={{ color: 'var(--bone)', fontSize: '0.9rem' }}>I have inserted my USB hardware token and authorize it as the Kill Switch.</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 4: Compliance Gate */}
        {step === 4 && (
          <div style={{ animation: 'fadeIn 0.5s' }}>
            <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>Compliance & Posture</h1>
            <p style={{ color: 'var(--bone)', marginBottom: '2rem', fontSize: '1.1rem' }}>
              Final acknowledgment of operating boundaries under the Injustice Reform Network.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <label style={{ background: 'var(--charcoal-lighter)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', gap: '1rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={ackIncapacity} onChange={e => setAckIncapacity(e.target.checked)} style={{ marginTop: '0.25rem' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--bone)' }}>I acknowledge the <strong>Technical Incapacity Defense</strong>: Data must remain encrypted such that it cannot be produced under subpoena.</span>
              </label>
              <label style={{ background: 'var(--charcoal-lighter)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', gap: '1rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack42cfr} onChange={e => setAck42cfr(e.target.checked)} style={{ marginTop: '0.25rem' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--bone)' }}>I agree to operate strictly within the <strong>42 CFR Part 2</strong> substance abuse confidentiality boundaries.</span>
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
          <button 
            onClick={() => setStep(Math.max(1, step - 1))} 
            style={{ visibility: step === 1 ? 'hidden' : 'visible', background: 'transparent', color: 'var(--text-secondary)', border: 'none', fontSize: '1rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
          >
            ← Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={step === 4 && !complianceComplete}
            className="btn-primary"
            style={{ background: step === 4 ? 'var(--ember)' : 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold', fontSize: '1rem', padding: '0.75rem 2rem', opacity: (step === 4 && !complianceComplete) ? 0.45 : 1, cursor: (step === 4 && !complianceComplete) ? 'not-allowed' : 'pointer' }}
          >
            {step === 4 ? 'SET PASSPHRASE →' : 'CONTINUE →'}
          </button>
        </div>

      </div>
    </div>
  );
}
