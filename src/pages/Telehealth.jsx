import React, { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { buildClientJoinUrl, randomRoomName } from './telehealthShare';

export default function Telehealth() {
  const [inCall, setInCall] = useState(false);
  const [baaAccepted, setBaaAccepted] = useState(false);
  const [roomName, setRoomName] = useState('Sanctuary-Intake-492');
  const [copied, setCopied] = useState(false);
  const jitsiDomain = useSettingsStore(s => s.jitsi.domain);

  // No public fallback: a call can only start against a configured self-hosted
  // server AND after the BAA acknowledgement.
  const canStart = !!jitsiDomain && baaAccepted;

  const jitsiContainerStyle = { display: inCall ? 'block' : 'none', width: '100%', height: '100%', minHeight: '600px', border: 'none', borderRadius: '8px' };

  const startJitsiCall = () => {
    if (!jitsiDomain) {
      alert('No telehealth server configured. Set your self-hosted Jitsi domain in Settings → Telehealth Server before starting a call.');
      return;
    }
    if (!baaAccepted) {
      alert('BAA Gate: You must verify Business Associate Agreement compliance before initializing telehealth.');
      return;
    }
    setInCall(true);
  };

  const endJitsiCall = () => setInCall(false);

  // Build the room URL from the configured host only. roomName is
  // percent-encoded so it cannot alter the path/origin.
  const callUrl = jitsiDomain
    ? `https://${jitsiDomain}/${encodeURIComponent(roomName)}#config.prejoinPageEnabled=false&config.disableDeepLinking=true`
    : '';

  // Clean link to SHARE with a client (no config fragment). Carries no PHI —
  // only the self-hosted host and the (ideally randomized) room token.
  const clientJoinUrl = buildClientJoinUrl(jitsiDomain, roomName);

  const copyClientLink = async () => {
    if (!clientJoinUrl) return;
    try {
      await navigator.clipboard.writeText(clientJoinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (non-secure context). The link is shown
      // as selectable text below as a fallback, so the operator can copy manually.
      setCopied(false);
    }
  };

  const randomizeRoom = () => { setRoomName(randomRoomName()); setCopied(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>

      {/* Settings & BAA Gate Header */}
      {!inCall && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontFamily: 'system-ui' }}>Secure Telehealth</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Routes only to your self-hosted Jitsi server — no public fallback.
            </p>
          </div>

          {!jitsiDomain && (
            <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              ⚠ No telehealth server configured. Set your self-hosted Jitsi domain in <strong>Settings → Telehealth Server</strong>. Calls are disabled until then — this app will never route a session through the public meet.jit.si.
            </div>
          )}

          <div style={{ background: 'rgba(235, 87, 87, 0.1)', padding: '1.5rem', borderLeft: '4px solid var(--color-accent)', borderRadius: '4px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>BAA Enforcement Gate</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.5' }}>
              This session routes to your configured self-hosted Jitsi server. Whether it is end-to-end encrypted and telemetry-free depends on that server's configuration — this app enforces only that no public/unconfigured server is used.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: '#0f172a', padding: '1rem', borderRadius: '4px' }}>
              <input
                type="checkbox"
                checked={baaAccepted}
                onChange={() => setBaaAccepted(!baaAccepted)}
                style={{ transform: 'scale(1.2)' }}
              />
              <span style={{ fontSize: '0.9rem', color: baaAccepted ? '#4ade80' : 'var(--text-tertiary)', fontWeight: 'bold' }}>
                I acknowledge and enforce the BAA Telehealth boundaries.
              </span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Room ID</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={roomName}
                onChange={e => { setRoomName(e.target.value); setCopied(false); }}
                style={{ flex: 1, padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#1e293b', color: 'white', fontSize: '1.2rem', fontFamily: 'monospace', textAlign: 'center', letterSpacing: '2px' }}
              />
              <button
                onClick={randomizeRoom}
                title="Generate an unguessable room token (recommended for links shared with clients)"
                style={{ padding: '0 1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#1e293b', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                🎲
              </button>
            </div>

            {/* Client join link — shareable, no PHI, no config fragment. */}
            {jitsiDomain ? (
              <div style={{ marginTop: '0.75rem', background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Client join link
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={clientJoinUrl}
                    onFocus={e => e.target.select()}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#020617', color: 'var(--text-tertiary)', fontSize: '0.8rem', fontFamily: 'monospace' }}
                  />
                  <button
                    onClick={copyClientLink}
                    style={{ padding: '0.6rem 1rem', borderRadius: '4px', border: 'none', background: copied ? '#4ade80' : 'var(--vault-a)', color: copied ? '#022c22' : 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  >
                    {copied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  Send this to the client to join from their own device. The room name is the only access control — use 🎲 to randomize it for a private session.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textAlign: 'center' }}>
                Configure a Telehealth server in Settings to generate a client link.
              </div>
            )}
          </div>

          <button
            onClick={startJitsiCall}
            disabled={!canStart}
            title={!jitsiDomain ? 'Set a self-hosted Jitsi domain in Settings first' : (!baaAccepted ? 'Acknowledge the BAA gate first' : '')}
            className="btn-primary"
            style={{ padding: '1.25rem', fontSize: '1.1rem', background: canStart ? 'var(--vault-a)' : '#334155', cursor: canStart ? 'pointer' : 'not-allowed', transition: '0.3s' }}
          >
            🎙️ Initialize Secure Room
          </button>
        </div>
      )}

      {/* The Jitsi Iframe / Active Call UI */}
      {inCall && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#020617', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#0f172a', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></div>
              <span style={{ color: 'white', fontWeight: 'bold', fontFamily: 'monospace' }}>LIVE: {roomName}</span>
              <span style={{ background: '#334155', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{jitsiDomain}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {/* Grab the client join link mid-call — e.g. for someone joining
                  late. Same clean, fragment-free link as the pre-call box. */}
              <button
                onClick={copyClientLink}
                title="Copy the client join link to share with someone joining late"
                style={{ background: copied ? '#4ade80' : '#334155', color: copied ? '#022c22' : 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button onClick={endJitsiCall} style={{ background: '#e11d48', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                Leave Room
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <iframe
              title="Telehealth call"
              allow="camera; microphone; display-capture; autoplay; clipboard-write"
              src={callUrl}
              style={jitsiContainerStyle}
            ></iframe>

            <div style={{ position: 'absolute', bottom: '20px', left: '20px', display: 'flex', gap: '1rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.7)', padding: '0.5rem 1rem', borderRadius: '4px', color: '#4ade80', fontSize: '0.75rem', fontFamily: 'monospace', backdropFilter: 'blur(4px)' }}>
                ✓ Self-hosted: {jitsiDomain}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
