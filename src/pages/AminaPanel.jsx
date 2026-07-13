import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { askAmina, isAminaLlmAvailable } from '../utils/aminaEngine';

// Fix Leaflet's default marker icon paths (they break under bundlers otherwise).
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// Amina chat + Baltimore resource map. Amina is LOCAL-ONLY: real LLM via Ollama
// when present, honest guided assistant otherwise. The map uses OpenStreetMap
// tiles (network tile fetches — see the caveat note in the UI).
export default function AminaPanel({ resources, onFocusResource }) {
  const mapped = resources.filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number');
  const [messages, setMessages] = useState([
    { from: 'amina', text: 'Hi, I\u2019m Amina. Tell me what your client needs \u2014 affirming care, housing, legal help, crisis support, harm reduction, or financial relief \u2014 and I\u2019ll point you to trusted Baltimore resources.' }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [llm, setLlm] = useState(null); // null=unknown, true/false=checked
  const endRef = useRef(null);

  useEffect(() => { isAminaLlmAvailable().then(setLlm); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text }]);
    setThinking(true);
    const reply = await askAmina(text, resources);
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
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.25rem' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ background: m.from === 'user' ? 'var(--gold)' : 'var(--charcoal-lighter)', color: m.from === 'user' ? 'var(--charcoal)' : 'var(--bone)', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                {m.text}
              </div>
              {m.resources && m.resources.length > 0 && (
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {m.resources.map((r) => (
                    <button key={r.name} onClick={() => onFocusResource?.(r)} style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>
                      <div style={{ color: 'var(--bone)', fontSize: '0.8rem', fontWeight: 'bold' }}>{r.name}</div>
                      <div style={{ color: 'var(--gold)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{r.phone}</div>
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
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
