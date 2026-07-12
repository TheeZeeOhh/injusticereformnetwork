import React, { useState, useEffect } from 'react';

export default function IntelligenceLayer() {
  const [emberFundBalance, setEmberFundBalance] = useState(0);
  const [revenueInput, setRevenueInput] = useState('');
  
  const [crisisCount, setCrisisCount] = useState(0);
  const [bamScores, setBamScores] = useState([]);
  const [bamInput, setBamInput] = useState('');
  
  const [alerts, setAlerts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  const addLog = (category, details) => {
    setAuditLogs(prev => [{ id: Date.now() + Math.random(), category, details, timestamp: new Date() }, ...prev].slice(0, 10));
  };

  const addAlert = (msg, type = 'warning') => {
    setAlerts(prev => [{ id: Date.now(), msg, type }, ...prev].slice(0, 5));
  };

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

  const logBamScore = () => {
    const score = parseFloat(bamInput);
    if (!isNaN(score)) {
      setBamScores(prev => {
        const newScores = [...prev, score];
        if (newScores.length > 1) {
          const lastScore = newScores[newScores.length - 2];
          const delta = Math.abs((score - lastScore) / lastScore);
          if (delta >= 0.15) {
            addAlert(`🧠 [Clinical Co-Pilot] Alert: ${(delta * 100).toFixed(1)}% variance detected in clinical assessment. Record flagged for immediate triage!`, 'danger');
          }
        }
        return newScores;
      });
      addLog('CLINICAL', `Logged new BAM score: ${score}`);
      setBamInput('');
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
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Deterministic lookups. Flags any {'>'}15% delta in sequential scores.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" placeholder="BAM Score" value={bamInput} onChange={e => setBamInput(e.target.value)} style={{ padding: '0.4rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', width: '120px' }} />
              <button onClick={logBamScore} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>Log Score</button>
            </div>
            {bamScores.length > 0 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Previous Scores: {bamScores.join(', ')}</p>
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
