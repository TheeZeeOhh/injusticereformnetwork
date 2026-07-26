import React, { useState, useEffect, useCallback } from 'react';

// Weather widget — privacy-respecting by design.
//
// PRIVACY POSTURE: this app is local-first and its threat model is that nothing
// leaks about the operator or clients. So this widget does NOT auto-geolocate
// (no GPS, no IP-based lookup). The operator types a city; that operator-chosen,
// coarse location is the only thing that ever leaves the device, and only to the
// allowlisted Open-Meteo host (added to the CSP). No API key, no tracking cookies.
// The chosen city is remembered in localStorage (non-PHI) for convenience.

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CITY_KEY = 'sanctuary_weather_city_v1';

// WMO weather code -> { emoji, label }. Covers the common codes.
const WMO = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Dense drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌨️', 'Freezing rain'], 67: ['🌨️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Rain showers'], 81: ['🌧️', 'Rain showers'], 82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm + hail'], 99: ['⛈️', 'Thunderstorm + hail'],
};
const wmo = (code) => WMO[code] || ['🌡️', 'Unknown'];

export default function WeatherWidget() {
  const [city, setCity] = useState(() => localStorage.getItem(CITY_KEY) || '');
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);     // { name, temp, code, high, low, wind, humidity, updated }
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);      // expanded search box
  const [now, setNow] = useState(() => new Date()); // live digital clock
  const [calOpen, setCalOpen] = useState(false);    // month calendar toggle
  // Month the calendar is viewing (defaults to the current month).
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // Tick the clock every second. Purely local — no network, no leak.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchWeather = useCallback(async (place) => {
    if (!place || !place.trim()) return;
    setStatus('loading'); setError('');
    try {
      // 1. Geocode the operator-typed city (no device coordinates ever sent).
      const gRes = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(place.trim())}&count=1`);
      if (!gRes.ok) throw new Error('geocode failed');
      const gJson = await gRes.json();
      const loc = gJson?.results?.[0];
      if (!loc) throw new Error('City not found');

      // 2. Fetch current + daily forecast for those coordinates.
      const params = new URLSearchParams({
        latitude: loc.latitude, longitude: loc.longitude,
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min',
        temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'auto',
      });
      const fRes = await fetch(`${FORECAST_URL}?${params}`);
      if (!fRes.ok) throw new Error('forecast failed');
      const f = await fRes.json();
      const cur = f.current || {};
      setData({
        name: `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}`,
        temp: Math.round(cur.temperature_2m),
        code: cur.weather_code,
        high: Math.round(f.daily?.temperature_2m_max?.[0]),
        low: Math.round(f.daily?.temperature_2m_min?.[0]),
        wind: Math.round(cur.wind_speed_10m),
        humidity: cur.relative_humidity_2m,
        updated: new Date(),
      });
      setStatus('idle');
      localStorage.setItem(CITY_KEY, place.trim());
      setCity(place.trim());
    } catch (e) {
      setStatus('error');
      setError(e?.message || 'Weather unavailable');
    }
  }, []);

  // Load remembered city on mount; refresh every 30 min while mounted.
  useEffect(() => {
    if (city) fetchWeather(city);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!city) return undefined;
    const id = setInterval(() => fetchWeather(city), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [city, fetchWeather]);

  const submit = (e) => {
    e.preventDefault();
    if (input.trim()) { fetchWeather(input); setInput(''); setOpen(false); }
  };

  const [emoji, label] = data ? wmo(data.code) : ['🌡️', ''];

  // Build a month grid (weeks x 7). Local-only; no network. `null` = padding cell.
  const buildCalendar = (y, m) => {
    const first = new Date(y, m, 1).getDay();          // 0=Sun
    const days = new Date(y, m + 1, 0).getDate();      // days in month
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };
  const cal = buildCalendar(calMonth.y, calMonth.m);
  const isToday = (d) => d && calMonth.y === now.getFullYear() && calMonth.m === now.getMonth() && d === now.getDate();
  const monthLabel = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const shiftMonth = (delta) => setCalMonth(({ y, m }) => {
    const nm = m + delta; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
  });

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 900,
      background: 'var(--bg-color-surface)', color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 14, padding: '12px 14px', minWidth: 190, maxWidth: 260,
      fontFamily: 'system-ui, sans-serif', fontSize: '0.85rem',
      boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(6px)',
    }}>
      {/* Digital clock — always shown, purely local (no network) */}
      <div style={{ textAlign: 'center', marginBottom: 10, paddingBottom: 8,
        borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '1.55rem',
          fontWeight: 700, letterSpacing: '1px', lineHeight: 1.1, opacity: 0.8 }}>
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <button
          onClick={() => { setCalOpen((v) => !v); setCalMonth({ y: now.getFullYear(), m: now.getMonth() }); }}
          title="Toggle calendar"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
            fontSize: '0.72rem', opacity: 0.7, marginTop: 2, fontFamily: 'inherit', padding: 0 }}
        >
          {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ▾
        </button>
      </div>

      {calOpen && (
        <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button onClick={() => shiftMonth(-1)} title="Previous month" style={iconBtn}>‹</button>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} title="Next month" style={iconBtn}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 700, padding: '2px 0' }}>{d}</div>
            ))}
            {cal.map((d, i) => (
              <div key={i} style={{
                fontSize: '0.7rem', padding: '3px 0', borderRadius: 5, lineHeight: 1.2,
                background: isToday(d) ? 'var(--ember)' : 'transparent',
                color: isToday(d) ? '#fff' : 'inherit',
                fontWeight: isToday(d) ? 700 : 400,
                opacity: d ? 1 : 0,
              }}>{d || ''}</div>
            ))}
          </div>
        </div>
      )}

      {status === 'loading' && <div style={{ opacity: 0.7 }}>Loading weather…</div>}

      {status === 'error' && (
        <div>
          <div style={{ color: 'var(--red)', marginBottom: 6 }}>⚠ {error}</div>
          <button onClick={() => setOpen(true)} style={btn}>Set city</button>
        </div>
      )}

      {status === 'idle' && !data && !open && (
        <button onClick={() => setOpen(true)} style={{ ...btn, width: '100%' }}>🌡️ Set your city for weather</button>
      )}

      {status === 'idle' && data && !open && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>{emoji}</span>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{data.temp}°F</div>
              <div style={{ opacity: 0.8, fontSize: '0.78rem' }}>{label}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, opacity: 0.85, fontSize: '0.78rem' }}>
            <div style={{ fontWeight: 600 }}>{data.name}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
              <span>↑{data.high}° ↓{data.low}°</span>
              <span>💨 {data.wind}mph</span>
              <span>💧 {data.humidity}%</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ opacity: 0.45, fontSize: '0.68rem' }}>
              {data.updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>
              <button onClick={() => fetchWeather(city)} title="Refresh" style={iconBtn}>↻</button>
              <button onClick={() => setOpen(true)} title="Change city" style={iconBtn}>✎</button>
            </span>
          </div>
        </div>
      )}

      {open && (
        <form onSubmit={submit}>
          <div style={{ fontSize: '0.72rem', opacity: 0.7, marginBottom: 6 }}>
            Type a city (no auto-location — privacy by design):
          </div>
          <input
            autoFocus value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Baltimore"
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'var(--charcoal-lighter)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="submit" style={{ ...btn, flex: 1 }}>Get weather</button>
            {data && <button type="button" onClick={() => setOpen(false)} style={btn}>Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}

const btn = {
  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--ember)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
};
const iconBtn = {
  padding: '2px 6px', marginLeft: 4, borderRadius: 6, border: 'none',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.9rem', opacity: 0.7,
};
