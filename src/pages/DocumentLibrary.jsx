import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';
import { saveBytes } from '../utils/download';

// Document Library — real, encrypted, offline-first file repository.
//
// Files are stored ENCRYPTED in the local vault (Vault A): each file's bytes +
// metadata live under 'docblob_<id>', and a lightweight index under
// 'document_index' drives the list. Upload, download, search, and delete all
// operate on real vault data — no mock rows.
const INDEX_ID = 'document_index';

function bytesToB64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Best-effort format label from filename extension / MIME type.
function formatLabel(name, mime) {
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  if (ext) return ext;
  if (mime) return mime.split('/').pop().toUpperCase();
  return 'FILE';
}

export default function DocumentLibrary() {
  const { vaultAKey } = useAuthStore();
  const [index, setIndex] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const vaultOpen = !!vaultAKey;

  useEffect(() => {
    async function loadIndex() {
      if (!vaultAKey) return;
      try {
        const idx = await loadSecureRecord(vaultAKey, INDEX_ID, 'A');
        if (idx) setIndex(idx);
      } catch {
        setStatus('Could not decrypt the document index with the current key.');
      }
    }
    loadIndex();
  }, [vaultAKey]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !vaultAKey) return;
    setBusy(true);
    setStatus(`Encrypting and storing ${file.name}…`);
    try {
      const buf = await file.arrayBuffer();
      const id = `DOC-${Date.now()}`;
      await saveSecureRecord(vaultAKey, `docblob_${id}`, {
        b64: bytesToB64(buf),
        mime: file.type || 'application/octet-stream'
      }, 'A');

      const summary = {
        id,
        name: file.name,
        format: formatLabel(file.name, file.type),
        size: file.size,
        date: new Date().toISOString().slice(0, 10)
      };
      const updated = [summary, ...index];
      setIndex(updated);
      await saveSecureRecord(vaultAKey, INDEX_ID, updated, 'A');
      setStatus(`Stored ${file.name} (encrypted).`);
    } catch (err) {
      setStatus('Upload failed: ' + err.message);
    }
    setBusy(false);
  };

  const download = async (item) => {
    if (!vaultAKey) return;
    try {
      const blob = await loadSecureRecord(vaultAKey, `docblob_${item.id}`, 'A');
      if (!blob) { setStatus('Stored file bytes not found.'); return; }
      const bytes = b64ToBytes(blob.b64);
      const saved = await saveBytes(new Blob([bytes], { type: blob.mime }), item.name);
      if (saved) setStatus(`Saved ${item.name}.`);
    } catch (err) {
      setStatus('Download failed: ' + err.message);
    }
  };

  const remove = async (item) => {
    if (!vaultAKey) return;
    try {
      // Overwrite the blob record with an empty marker, then drop from index.
      // (storageEngine has no delete; an empty encrypted record is harmless.)
      await saveSecureRecord(vaultAKey, `docblob_${item.id}`, { deleted: true }, 'A');
      const updated = index.filter((d) => d.id !== item.id);
      setIndex(updated);
      await saveSecureRecord(vaultAKey, INDEX_ID, updated, 'A');
      setStatus(`Removed ${item.name}.`);
    } catch (err) {
      setStatus('Remove failed: ' + err.message);
    }
  };

  const visible = query.trim()
    ? index.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    : index;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Document Library</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Secure, offline-first file repository. Files are encrypted in the local vault.
        </p>
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Vault locked. Log in to store or retrieve documents.
        </div>
      )}

      {/* Action Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '500px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <button onClick={handleUploadClick} disabled={!vaultOpen || busy} className="btn-primary" style={{ padding: '0.75rem 1.5rem', opacity: (!vaultOpen || busy) ? 0.5 : 1 }}>
          {busy ? 'Storing…' : '+ Upload Document'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {/* Document List */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '1rem 0.5rem' }}>Name</th>
              <th style={{ padding: '1rem 0.5rem' }}>Format</th>
              <th style={{ padding: '1rem 0.5rem' }}>Size</th>
              <th style={{ padding: '1rem 0.5rem' }}>Uploaded</th>
              <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((doc) => (
              <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'var(--transition-fast)' }} onMouseOver={e => e.currentTarget.style.background = 'var(--charcoal-lighter)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--bone)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>📄</span>
                  <span style={{ fontWeight: '500' }}>{doc.name}</span>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>
                  <span style={{ background: 'var(--charcoal)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{doc.format}</span>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>{humanSize(doc.size)}</td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>{doc.date}</td>
                <td style={{ padding: '1rem 0.5rem', textAlign: 'right', display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => download(doc)} style={{ background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                    Download
                  </button>
                  <button onClick={() => remove(doc)} style={{ background: 'transparent', color: '#fda4af', border: '1px solid #e11d48', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                {index.length === 0 ? 'No documents stored yet.' : 'No documents match your search.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.75rem', borderRadius: '4px', wordBreak: 'break-word' }}>
          {status}
        </div>
      )}

    </div>
  );
}
