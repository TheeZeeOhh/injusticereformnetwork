import React, { useState, useEffect, useRef } from 'react';

// Compact clock for the sidebar (under the Sanctuary title). Purely local — a
// running clock + date, no network, no leak.
export function SidebarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ textAlign: 'center', padding: '0.5rem 0 0.75rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.25rem' }}>
      <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--bone)', opacity: 0.8, lineHeight: 1.1 }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
        {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
}

// Sanctuary Radio — the same station set as the public Reading Room. Streams are
// third-party (audio in only; no client data ever sent). The desktop CSP must
// allow these hosts in media-src for playback (see tauri.conf.json).
const STATIONS = [
  { name: '92Q Jams — Baltimore', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WERQFM_SC' },
  { name: 'Magic 95.9 — Baltimore', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WWINFMAAC_SC' },
  { name: 'Seven Inch Soul', url: 'https://ice1.somafm.com/7soul-128-mp3' },
  { name: 'Heavyweight Reggae', url: 'https://ice1.somafm.com/reggae-128-mp3' },
  { name: 'Groove Salad (chill)', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'Fluid (instr. hip-hop)', url: 'https://ice1.somafm.com/fluid-128-mp3' },
  { name: 'Lush (vocal chill)', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'Radio Paradise — World', url: 'https://stream.radioparadise.com/world-etc-128' },
  { name: 'KEXP (indie/eclectic)', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'BBC World Service', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR (news)', url: 'https://npr-ice.streamguys1.com/live.mp3' },
  { name: 'Sonic Universe (jazz)', url: 'https://ice1.somafm.com/sonicuniverse-128-mp3' },
  { name: 'Bossa Beyond', url: 'https://ice1.somafm.com/bossa-128-mp3' },
  { name: 'Left Coast 70s', url: 'https://ice1.somafm.com/seventies-128-mp3' },
  { name: 'Underground 80s', url: 'https://ice1.somafm.com/u80s-128-mp3' },
  { name: 'Suburbs of Goa', url: 'https://ice1.somafm.com/suburbsofgoa-128-mp3' },
  { name: 'Beat Blender', url: 'https://ice1.somafm.com/beatblender-128-mp3' },
  { name: 'Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3' },
  { name: 'Radio Paradise — Mellow', url: 'https://stream.radioparadise.com/mellow-128' },
  { name: 'Radio Paradise — Rock', url: 'https://stream.radioparadise.com/rock-128' },
  { name: 'Radio Paradise — Global', url: 'https://stream.radioparadise.com/global-128' },
  { name: 'WWOZ New Orleans', url: 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3' },
];
const RKEY = 'sanctuary_sidebar_radio';

export function SidebarRadio() {
  const audioRef = useRef(null);
  const [station, setStation] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(RKEY) || '{}'); return typeof s.station === 'number' ? s.station : 0; } catch { return 0; }
  });
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  const [vol, setVol] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(RKEY) || '{}'); return typeof s.vol === 'number' ? s.vol : 0.8; } catch { return 0.8; }
  });

  useEffect(() => {
    try { localStorage.setItem(RKEY, JSON.stringify({ station, vol })); } catch { /* ignore */ }
  }, [station, vol]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      setErr(false);
      a.src = STATIONS[station].url;
      const p = a.play();
      if (p && p.catch) p.catch(() => { setErr(true); setPlaying(false); });
    } else {
      a.pause();
    }
  };

  const changeStation = (i) => {
    setStation(i);
    const a = audioRef.current;
    if (a && !a.paused) { a.src = STATIONS[i].url; a.play().catch(() => setErr(true)); }
  };

  return (
    <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={toggle} aria-label="Play / pause radio" title="Play / pause"
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', flex: 'none',
            background: 'var(--gold)', color: '#241a10', fontSize: 13, display: 'grid', placeItems: 'center' }}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.55rem', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {playing ? '♪ Sanctuary Radio' : 'Sanctuary Radio'}
          </div>
          <div style={{ fontSize: '0.68rem', color: err ? '#c0603a' : 'var(--bone)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {err ? 'Station unavailable' : STATIONS[station].name}
          </div>
        </div>
      </div>
      <select value={station} onChange={(e) => changeStation(+e.target.value)} aria-label="Choose station"
        style={{ width: '100%', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--muted, var(--text-secondary))', borderRadius: 8, fontSize: '0.68rem', padding: '0.3rem 0.4rem', fontFamily: 'var(--font-mono)' }}>
        {STATIONS.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
      </select>
      <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="Volume"
        style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
      <audio ref={audioRef} preload="none"
        onPlaying={() => { setPlaying(true); setErr(false); }}
        onPause={() => setPlaying(false)}
        onError={() => { if (audioRef.current?.src) { setErr(true); setPlaying(false); } }} />
    </div>
  );
}
