import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { askWifey, isAminaLlmAvailable } from '../utils/aminaEngine';
import { loadSecureRecord } from '../utils/storageEngine';

// Fix Leaflet's default marker icon paths (they break under bundlers otherwise).
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// Per-message provenance badge. The hosted label is deliberately the loudest:
// a navigator must never be misled about a question having left the device.
const SOURCE_LABEL = {
  hosted: { text: 'uplink · sent to hosted model (Anthropic) · not on-device', color: '#fbbf24' },
  crisis: { text: 'crisis support · handled locally', color: '#f87171' },
  escalate: { text: 'escalated to navigator · handled locally', color: '#f87171' },
  llm: { text: 'local AI (Ollama) · on-device', color: 'var(--text-tertiary)' },
  guided: { text: 'guided mode · on-device', color: 'var(--text-tertiary)' }
};

function SourceBadge({ source }) {
  const meta = SOURCE_LABEL[source];
  if (!meta) return null;
  return (
    <div style={{ marginTop: '0.25rem', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: meta.color }}>
      {meta.text}
    </div>
  );
}

// Assistant chat + Baltimore resource map. HYBRID routing (see askWifey):
// client-specific questions stay LOCAL (Ollama or guided, no data leaves the
// device); only generic, referent-free bureaucracy questions may reach the
// hosted model via the Rust `hosted_assistant_ask` command, and only ever as
// a bare question with NO client/resource data attached. Crisis and escalation
// are handled locally and never routed out. The map uses OpenStreetMap tiles
// (network tile fetches — see the caveat note in the UI).
export default function AminaPanel({ resources, onFocusResource, vaultAKey, clients = [] }) {
  const mapped = resources.filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number');
  const [messages, setMessages] = useState([
    { from: 'amina', text: 'Hi, I\u2019m Amina. Tell me what your client needs \u2014 affirming care, housing, legal help, crisis support, harm reduction, or financial relief \u2014 and I\u2019ll point you to trusted Baltimore resources.' }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [llm, setLlm] = useState(null); // null=unknown, true/false=checked
  const endRef = useRef(null);

  // Optional per-client transcript context. PHI: attaching it forces Amina fully
  // local (see askWifey), so the cloud uplink is disabled while context is on.
  const [contextClientId, setContextClientId] = useState('');
  const [clientContext, setClientContext] = useState('');
  const [contextNote, setContextNote] = useState('');

  useEffect(() => { isAminaLlmAvailable().then(setLlm); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load the selected client's saved intake transcripts from Vault A and flatten
  // them into a single context blob. Empty selection clears the context.
  const onSelectContextClient = async (clientId) => {
    setContextClientId(clientId);
    setClientContext('');
    setContextNote('');
    if (!clientId || !vaultAKey) return;
    try {
      const sessions = await loadSecureRecord(vaultAKey, `transcript_${clientId}`, 'A');
      if (!Array.isArray(sessions) || sessions.length === 0) {
        setContextNote('No saved transcripts for this client yet.');
        return;
      }
      const blob = sessions
        .map((s) => (s.lines || []).map((l) => `${l.original || ''} ${l.translated || ''}`.trim()).join('\n'))
        .join('\n---\n')
        .trim();
      setClientContext(blob);
      setContextNote(blob ? '' : 'Saved transcript is empty.');
    } catch {
      setContextNote('Could not load transcripts (is Vault A unlocked?).');
    }
  };

  const contextName = clients.find((c) => c.id === contextClientId)?.name
    || (contextClientId ? contextClientId.replace('client_', '') : '');

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text }]);
    setThinking(true);
    // Passing clientContext forces LOCAL-only routing in askWifey.
    const reply = await askWifey(text, resources, clientContext ? { clientContext } : {});
    setMessages((m) => [...m, { from: 'amina', text: reply.text, resources: reply.resources, source: reply.source }]);
    setThinking(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: '1rem' }}>
      {/* Amina chat */}
      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '360px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontWeight: 'bold' }}>Amina</div>
          <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
            {llm === true ? 'local AI (Ollama)' : llm === false ? 'guided mode' : '…'}
          </div>
        </div>

        {/* Client context picker. Attaching a client's transcript is PHI, so it
            forces Amina fully local and disables the cloud uplink. */}
        <div style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <select
            value={contextClientId}
            onChange={(e) => onSelectContextClient(e.target.value)}
            style={{ width: '100%', padding: '0.35rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}
          >
            <option value="">Context: — none (no client attached) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>Context: {c.name || c.id.replace('client_', '')}</option>
            ))}
          </select>
          {clientContext && (
            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: '#4ade80' }}>
              🔒 Using {contextName}&rsquo;s transcript · local only · cloud uplink disabled
            </div>
          )}
          {contextNote && (
            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{contextNote}</div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.25rem' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ background: m.from === 'user' ? 'var(--gold)' : 'var(--charcoal-lighter)', color: m.from === 'user' ? 'var(--charcoal)' : 'var(--bone)', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                {m.text}
              </div>
              {m.from === 'amina' && <SourceBadge source={m.source} />}
              {m.resources && m.resources.length > 0 && (
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {m.resources.map((r) => (
                    <button key={r.name} onClick={() => onFocusResource?.(r)} style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>
                      <div style={{ color: 'var(--bone)', fontSize: '0.8rem', fontWeight: 'bold' }}>{r.name}</div>
                      <div style={{ color: 'var(--gold)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{r.phone}</div>
                      {r.unverified && <div style={{ color: '#fbbf24', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>⚠ verify before referral</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic' }}>Amina is thinking…</div>}
          <div ref={endRef} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Ask Amina…"
            style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
          />
          <button onClick={send} disabled={thinking} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Send</button>
        </div>
      </div>

      {/* Map */}
      <div className="glass-panel" style={{ padding: '0.5rem', height: '360px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', margin: '0.25rem 0.5rem' }}>
          Map tiles load from OpenStreetMap (network). Pins show fixed-address resources only.
        </div>
        <div style={{ flex: 1, borderRadius: '6px', overflow: 'hidden' }}>
          <MapContainer center={[39.29, -76.61]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mapped.map((r) => (
              <Marker key={r.name} position={[r.lat, r.lng]}>
                <Popup>
                  <strong>{r.name}</strong><br />
                  {r.note}<br />
                  {r.addr}<br />
                  {r.phone}
                  {r.unverified && <><br /><span style={{ color: '#b45309' }}>⚠ verify before referral</span></>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
