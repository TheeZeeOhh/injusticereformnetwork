import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { DEFAULT_TEMPLATES, NOTE_SERVICE_TYPES, extractPlaceholders, fillTemplate } from './noteTemplateDefaults';

// Clinical Note Templates Library.
//
// Templates (built-in + custom) are blank forms with [Placeholder] variables —
// non-PHI. A COMPLETED note (a template filled with a client's data) IS PHI and
// is encrypted per client in Vault A under clinical_notes_<clientId>. Custom
// templates persist in Vault A too (index + per-template records).
const CUSTOM_INDEX_ID = 'note_templates_index';

const inputStyle = {
  width: '100%', padding: '0.6rem', background: 'var(--charcoal-lighter)',
  border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px',
  fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
};

export default function NoteTemplatesLibrary() {
  const { vaultAKey } = useAuthStore();
  const [customTemplates, setCustomTemplates] = useState([]); // full custom templates
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  const [view, setView] = useState('list'); // 'list' | 'preview' | 'edit' | 'fill'
  const [active, setActive] = useState(null); // the template in focus

  // Edit/create form state.
  const [form, setForm] = useState({ name: '', serviceType: NOTE_SERVICE_TYPES[0], body: '' });

  // Fill state.
  const [fillClientId, setFillClientId] = useState('');
  const [fillValues, setFillValues] = useState({});
  const [savedCount, setSavedCount] = useState(null);
  const [status, setStatus] = useState(null); // { ok, msg }

  // Load custom templates + client directory from Vault A.
  useEffect(() => {
    async function load() {
      if (!vaultAKey) return;
      try {
        const idx = await loadSecureRecord(vaultAKey, CUSTOM_INDEX_ID, 'A');
        if (Array.isArray(idx)) {
          const full = [];
          for (const meta of idx) {
            try {
              const t = await loadSecureRecord(vaultAKey, `note_template_${meta.id}`, 'A');
              if (t) full.push({ ...t, id: meta.id, custom: true });
            } catch { /* skip unreadable */ }
          }
          setCustomTemplates(full);
        }
      } catch { /* no custom templates yet */ }
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch { /* no clients yet */ }
    }
    load();
  }, [vaultAKey]);

  const allTemplates = [
    ...DEFAULT_TEMPLATES.map(t => ({ ...t, custom: false })),
    ...customTemplates,
  ];

  const visible = allTemplates.filter(t =>
    (filter === 'All' || t.serviceType === filter) &&
    (!query || t.name.toLowerCase().includes(query.toLowerCase()))
  );

  // Persist the custom-template list back to the vault (index + each record).
  const persistCustom = async (list) => {
    setCustomTemplates(list);
    const index = list.map(t => ({ id: t.id, name: t.name, serviceType: t.serviceType }));
    await saveSecureRecord(vaultAKey, CUSTOM_INDEX_ID, index, 'A');
  };

  const openPreview = (t) => { setActive(t); setView('preview'); };

  const startCreate = () => {
    setActive(null);
    setForm({ name: '', serviceType: NOTE_SERVICE_TYPES[0], body: '' });
    setView('edit');
  };

  const startEdit = (t) => {
    setActive(t);
    setForm({ name: t.name, serviceType: t.serviceType, body: t.body });
    setView('edit');
  };

  const duplicate = (t) => {
    setActive(null);
    setForm({ name: `${t.name} (copy)`, serviceType: t.serviceType, body: t.body });
    setView('edit');
  };

  const saveTemplate = async () => {
    if (!vaultAKey) { setStatus({ ok: false, msg: 'Unlock the vault first.' }); return; }
    if (!form.name.trim() || !form.body.trim()) { setStatus({ ok: false, msg: 'Name and body are required.' }); return; }
    const id = active?.custom ? active.id : `ctpl_${Date.now()}`;
    const record = { name: form.name.trim(), serviceType: form.serviceType, body: form.body };
    try {
      await saveSecureRecord(vaultAKey, `note_template_${id}`, record, 'A');
      const others = customTemplates.filter(t => t.id !== id);
      await persistCustom([...others, { ...record, id, custom: true }]);
      setStatus({ ok: true, msg: 'Template saved.' });
      setView('list');
    } catch (err) {
      setStatus({ ok: false, msg: err?.message || 'Save failed.' });
    }
  };

  const deleteTemplate = async (t) => {
    if (!vaultAKey || !t.custom) return;
    const list = customTemplates.filter(x => x.id !== t.id);
    await persistCustom(list);
    // Best-effort: overwrite the template record as tombstoned.
    try { await saveSecureRecord(vaultAKey, `note_template_${t.id}`, { deleted: true }, 'A'); } catch { /* ignore */ }
  };

  // ---- Fill flow ----
  const startFill = async (t) => {
    setActive(t);
    setFillValues({});
    setFillClientId('');
    setSavedCount(null);
    setStatus(null);
    setView('fill');
  };

  const onPickFillClient = async (clientId) => {
    setFillClientId(clientId);
    setSavedCount(null);
    if (!clientId || !vaultAKey) return;
    try {
      const notes = await loadSecureRecord(vaultAKey, `clinical_notes_${clientId}`, 'A');
      setSavedCount(Array.isArray(notes) ? notes.length : 0);
    } catch { setSavedCount(0); }
  };

  const saveCompletedNote = async () => {
    setStatus(null);
    if (!vaultAKey) { setStatus({ ok: false, msg: 'Vault is locked.' }); return; }
    if (!fillClientId) { setStatus({ ok: false, msg: 'Select a client.' }); return; }
    const filledBody = fillTemplate(active.body, fillValues);
    try {
      const recordId = `clinical_notes_${fillClientId}`;
      let notes = [];
      try {
        const existing = await loadSecureRecord(vaultAKey, recordId, 'A');
        if (Array.isArray(existing)) notes = existing;
      } catch { /* first note */ }
      notes.push({
        id: `note_${Date.now()}`,
        templateName: active.name,
        serviceType: active.serviceType,
        filledBody,
        values: fillValues,
        savedAt: new Date().toISOString(),
      });
      await saveSecureRecord(vaultAKey, recordId, notes, 'A');
      setSavedCount(notes.length);
      setStatus({ ok: true, msg: `Note saved to client's encrypted record (${notes.length} on file).` });
    } catch (err) {
      setStatus({ ok: false, msg: err?.message || 'Save failed.' });
    }
  };

  const heading = (
    <div>
      <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Clinical Note Templates</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
        Reusable clinical templates. Completed notes are encrypted per client in the vault.
      </p>
    </div>
  );

  // ---------- LIST ----------
  if (view === 'list') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {heading}
          <button className="btn-primary" onClick={startCreate} style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>+ New Template</button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="All">All service types</option>
            {NOTE_SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates…" style={{ ...inputStyle, flex: 1, minWidth: '200px' }} />
        </div>

        {status && <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: status.ok ? '#4ade80' : '#fda4af' }}>{status.msg}</div>}

        <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontFamily: 'var(--font-mono)' }}>No templates match.</div>
          ) : visible.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ color: 'var(--bone)', fontFamily: 'var(--font-serif)', fontWeight: 'bold' }}>{t.name}</span>
                <span style={{ marginLeft: '0.75rem', fontSize: '0.7rem', color: 'var(--gold)', background: 'var(--gold-dim)', padding: '2px 8px', borderRadius: '10px', fontFamily: 'var(--font-mono)' }}>{t.serviceType}</span>
                {t.custom && <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>custom</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => openPreview(t)} style={ghostBtn}>Preview</button>
                <button onClick={() => duplicate(t)} style={ghostBtn}>Duplicate</button>
                {t.custom && <button onClick={() => startEdit(t)} style={ghostBtn}>Edit</button>}
                {t.custom && <button onClick={() => deleteTemplate(t)} style={{ ...ghostBtn, color: '#fda4af' }}>Delete</button>}
                <button onClick={() => startFill(t)} className="btn-primary" style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem', background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>Use</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- PREVIEW ----------
  if (view === 'preview' && active) {
    const vars = extractPlaceholders(active.body);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {heading}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>{active.name}</h2>
            <button onClick={() => setView('list')} style={ghostBtn}>← Back</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6 }}>{active.body}</pre>
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Variables: </span>
            {vars.map(v => <span key={v} style={{ fontSize: '0.72rem', color: 'var(--ember)', background: 'var(--charcoal-lighter)', padding: '2px 8px', borderRadius: '10px', margin: '0 0.25rem', fontFamily: 'var(--font-mono)' }}>[{v}]</span>)}
          </div>
        </div>
      </div>
    );
  }

  // ---------- EDIT / CREATE ----------
  if (view === 'edit') {
    const vars = extractPlaceholders(form.body);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {heading}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>{active?.custom ? 'Edit Template' : 'New Template'}</h2>
            <button onClick={() => setView('list')} style={ghostBtn}>← Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Template name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Service type</label>
              <select value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} style={inputStyle}>
                {NOTE_SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Body — wrap variables in [square brackets]</label>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={14} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Detected variables: </span>
            {vars.length === 0 ? <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>none</span> :
              vars.map(v => <span key={v} style={{ fontSize: '0.72rem', color: 'var(--ember)', background: 'var(--charcoal-lighter)', padding: '2px 8px', borderRadius: '10px', margin: '0 0.25rem', fontFamily: 'var(--font-mono)' }}>[{v}]</span>)}
          </div>
          {status && <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: status.ok ? '#4ade80' : '#fda4af' }}>{status.msg}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveTemplate} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>Save Template</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- FILL ----------
  if (view === 'fill' && active) {
    const vars = extractPlaceholders(active.body);
    const preview = fillTemplate(active.body, fillValues);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {heading}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', overflow: 'hidden' }}>
          {/* Inputs */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.1rem' }}>{active.name}</h2>
              <button onClick={() => setView('list')} style={ghostBtn}>← Back</button>
            </div>
            <div>
              <label style={labelStyle}>Client (note is encrypted to their record)</label>
              <select value={fillClientId} onChange={e => onPickFillClient(e.target.value)} style={inputStyle}>
                <option value="">— Select a client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>)}
              </select>
              {savedCount != null && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>{savedCount} note(s) already on file.</div>}
            </div>
            {vars.map(v => (
              <div key={v}>
                <label style={labelStyle}>{v}</label>
                <input value={fillValues[v] || ''} onChange={e => setFillValues({ ...fillValues, [v]: e.target.value })} style={inputStyle} />
              </div>
            ))}
            {status && <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: status.ok ? '#4ade80' : '#fda4af' }}>{status.msg}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={saveCompletedNote}
                disabled={!fillClientId || !vaultAKey}
                className="btn-primary"
                style={{ background: (!fillClientId || !vaultAKey) ? 'var(--charcoal-lighter)' : 'var(--gold)', color: (!fillClientId || !vaultAKey) ? 'var(--text-tertiary)' : 'var(--charcoal)', fontWeight: 'bold' }}
              >
                💾 Save Completed Note
              </button>
            </div>
          </div>
          {/* Live preview */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>Live preview</div>
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6 }}>{preview}</pre>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
  padding: '0.35rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
};
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' };
