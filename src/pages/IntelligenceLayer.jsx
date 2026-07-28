import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// BAM (Brief Addiction Monitor) scores are 42 CFR Part 2 SUD data. They are
// PER-CLIENT and live ONLY in the encrypted Vault B, keyed by client. Delta
// detection is deterministic and runs here (client-side) against the client's
// own decrypted history — the score value never leaves the device and never
// touches the operational server or a plaintext log.
const BAM_DELTA_THRESHOLD = 0.15; // 15% variance flags for triage
export const bamRecordId = (clientId) => `bam_history_${clientId}`;

/**
 * Append a BAM score to a client's history and compute the triage delta.
 * Pure/deterministic and side-effect-free on inputs, so it is unit-testable
 * without mounting React. `history` is the client's prior array of
 * { score, timestamp }.
 * @returns {{ history: {score:number,timestamp:string}[], flagged: boolean, deltaPct: number|null }}
 */
export function appendBamScore(history, score, now = new Date()) {
  const prior = Array.isArray(history) ? history : [];
  const entry = { score, timestamp: now.toISOString() };
  const next = [...prior, entry];
  let flagged = false;
  let deltaPct = null;
  if (prior.length > 0) {
    const last = prior[prior.length - 1].score;
    if (last !== 0) {
      const delta = Math.abs((score - last) / last);
      deltaPct = delta * 100;
      flagged = delta >= BAM_DELTA_THRESHOLD;
    }
  }
  return { history: next, flagged, deltaPct };
}

export default function IntelligenceLayer() {
  const { vaultAKey, vaultBKey } = useAuthStore();
  const vaultBOpen = !!vaultBKey;

  const [emberFundBalance, setEmberFundBalance] = useState(0);
  const [revenueInput, setRevenueInput] = useState('');

  const [crisisCount, setCrisisCount] = useState(0);

  // Per-client BAM state. bamClients is the {id,name} directory (from Vault A);
  // bamHistory is the SELECTED client's decrypted score history (from Vault B).
  const [bamClients, setBamClients] = useState([]);
  const [bamClientId, setBamClientId] = useState('');
  const [bamHistory, setBamHistory] = useState([]);
  const [bamInput, setBamInput] = useState('');
  const [bamStatus, setBamStatus] = useState('');

  const [alerts, setAlerts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  const addLog = (category, details) => {
    setAuditLogs(prev => [{ id: Date.now() + Math.random(), category, details, timestamp: new Date() }, ...prev].slice(0, 10));
  };

  const addAlert = (msg, type = 'warning') => {
    setAlerts(prev => [{ id: Date.now(), msg, type }, ...prev].slice(0, 5));
  };

  // Load the client directory (names only) from Vault A to populate the picker.
  useEffect(() => {
    if (!vaultAKey) { setBamClients([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (!cancelled) setBamClients(Array.isArray(dir) ? dir : []);
      } catch { if (!cancelled) setBamClients([]); }
    })();
    return () => { cancelled = true; };
  }, [vaultAKey]);

  // Load the selected client's BAM history from Vault B (only when B is open).
  useEffect(() => {
    if (!vaultBKey || !bamClientId) { setBamHistory([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const hist = await loadSecureRecord(vaultBKey, bamRecordId(bamClientId), 'B');
        if (!cancelled) setBamHistory(Array.isArray(hist) ? hist : []);
      } catch { if (!cancelled) setBamHistory([]); }
    })();
    return () => { cancelled = true; };
  }, [vaultBKey, bamClientId]);

  const triggerPolicyScan = () => {
    setIsScanning(true);
    addLog('POLICY', 'Initiated local deterministic scan of CFR updates.');
    setTimeout(() => {
      setIsScanning(false);
      addAlert('🛡️ [Policy Sentinel] 2026 Civil Monetary Penalty adjustments detected. All templates require compliance verification.', 'warning');
      addLog('POLICY', 'Scan complete. CMP adjustments flagged.');
    }, 1200);
  };

  const logRevenue = () => {
    const val = parseFloat(revenueInput);
    if (!isNaN(val) && val > 0) {
      setEmberFundBalance(prev => prev + val);
      addLog('FINANCE', `Swept $${val.toFixed(2)} to Sovereignty Fund.`);
      setRevenueInput('');
    }
  };

  const simulateCrisis = () => {
    const newCount = crisisCount + 1;
    setCrisisCount(newCount);
    addLog('CRISIS', `BWC Module: Crisis event #${newCount} logged.`);
    
    if (newCount >= 3) {
      addAlert('🚨 [Predictive Interrupter] High-Tension Alert: Repeated crisis pattern detected! Emergency triage recommended.', 'danger');
      setCrisisCount(0); // reset for demo
    }
  };

  const logBamScore = async () => {
    const score = parseFloat(bamInput);
    if (isNaN(score)) return;
    if (!vaultBKey) { setBamStatus('Unlock Vault B to record a BAM score (42 CFR Part 2).'); return; }
    if (!bamClientId) { setBamStatus('Select a client first — BAM scores are per-client.'); return; }

    const { history: next, flagged, deltaPct } = appendBamScore(bamHistory, score);
    try {
      // Persist the client's history ONLY to encrypted Vault B. The score never
      // goes to the server or a plaintext log.
      await saveSecureRecord(vaultBKey, bamRecordId(bamClientId), next, 'B');
      setBamHistory(next);
      setBamInput('');
      setBamStatus('');
      if (flagged) {
        addAlert(`🧠 [Clinical Co-Pilot] Alert: ${deltaPct.toFixed(1)}% variance detected in this client\u2019s assessment. Flagged for triage.`, 'danger');
      }
      // Audit log is metadata-only: NEVER the score value (that is Part 2 PHI).
      addLog('CLINICAL', 'BAM score recorded to Vault B (value withheld from log).');
    } catch {
      setBamStatus('Vault B write failed — score not saved.');
    }
  };


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Intelligence Layer</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            Deterministic offline rule engines and situational awareness.
          </p>
        </div>
        <span style={{ background: 'var(--charcoal-lighter)', border: '1px solid #4ade80', color: '#4ade80', padding: '0.4rem 1rem', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          DAEMON MANAGER: ONLINE
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Daemons Control */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Daemons & Controls</h2>
          
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-mono)' }}>🛡️ Policy Sentinel</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Scans offline regulatory database for compliance drifts.</p>
            <button onClick={triggerPolicyScan} disabled={isScanning} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>
              {isScanning ? 'Scanning...' : 'Trigger Manual Scan'}
            </button>
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-mono)' }}>🔥 Ember Fund Tracker</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Diverts operational revenue to autonomous sovereignty accounts.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" placeholder="Revenue Amount" value={revenueInput} onChange={e => setRevenueInput(e.target.value)} style={{ padding: '0.4rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', width: '120px' }} />
              <button onClick={logRevenue} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>Sweep Revenue</button>
            </div>
            <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--ember)', fontFamily: 'var(--font-mono)' }}>Sovereignty Fund: ${emberFundBalance.toFixed(2)}</p>
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-mono)' }}>🚨 Predictive Interrupter (BWC)</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Monitors incident velocity. Logs: {crisisCount}/3 for alert threshold.</p>
            <button onClick={simulateCrisis} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: '#e53e3e', color: 'white' }}>Simulate Crisis Event</button>
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-mono)' }}>🧠 Clinical Co-Pilot</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Per-client BAM tracking. 42 CFR Part 2 — stored only in encrypted Vault B. Flags any {'>'}15% delta in sequential scores.
            </p>
            {!vaultBOpen ? (
              <div style={{ fontSize: '0.75rem', color: '#fda4af', fontFamily: 'var(--font-mono)' }}>
                🔒 Vault B closed — BAM scores (42 CFR Part 2) are hidden. Unlock Vault B to view or record them.
              </div>
            ) : (
              <>
                <select
                  value={bamClientId}
                  onChange={e => setBamClientId(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', marginBottom: '0.5rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                >
                  <option value="">— select client —</option>
                  {bamClients.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" placeholder="BAM Score" value={bamInput} onChange={e => setBamInput(e.target.value)} disabled={!bamClientId} style={{ padding: '0.4rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', width: '120px' }} />
                  <button onClick={logBamScore} disabled={!bamClientId} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>Log Score</button>
                </div>
                {bamStatus && (
                  <p style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#fda4af', fontFamily: 'var(--font-mono)' }}>{bamStatus}</p>
                )}
                {bamHistory.length > 0 && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    This client&rsquo;s scores: {bamHistory.map(h => h.score).join(', ')}
                  </p>
                )}
              </>
            )}
          </div>

          <div style={{ opacity: 0.6, border: '1px dashed var(--ember)', padding: '1rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--ember)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-mono)' }}>🤖 AI-Powered Insights (DISABLED)</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              <strong>LOCKED BY POLICY:</strong> Explicit exclusion of aggregate client behavior analytics. Flagged as a surveillance vector. Sanctuary relies on deterministic rule engines, not black-box LLM analytics on client PHI.
            </p>
          </div>
        </div>

        {/* Live Data & Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: '0 0 1rem 0', fontFamily: 'var(--font-serif)' }}>System Alerts</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {alerts.map((alert) => (
                <div key={alert.id} style={{ background: alert.type === 'danger' ? 'rgba(229, 62, 62, 0.1)' : 'rgba(217, 164, 65, 0.1)', borderLeft: `4px solid ${alert.type === 'danger' ? '#e53e3e' : 'var(--gold)'}`, padding: '1rem', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--bone)' }}>
                  {alert.msg}
                </div>
              ))}
              {alerts.length === 0 && <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>No active threats detected.</p>}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
            <h2 style={{ color: 'var(--bone)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: '0 0 1rem 0', fontFamily: 'var(--font-serif)' }}>Recent Audit Logs</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {auditLogs.map(log => (
                <li key={log.id} style={{ padding: '0.75rem', background: 'var(--charcoal)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--gold)', marginRight: '0.5rem' }}>[{log.category}]</span> 
                  <span style={{ color: 'var(--bone)' }}>{log.details}</span>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginTop: '0.25rem' }}>{log.timestamp.toLocaleTimeString()}</div>
                </li>
              ))}
              {auditLogs.length === 0 && <li style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>No recent activity.</li>}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
