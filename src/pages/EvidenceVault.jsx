import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Evidence Vault — real chain-of-custody attachment manager.
//
// Every uploaded file gets a REAL SHA-256 hash computed via crypto.subtle over
// its actual bytes. The file bytes + metadata + hash are stored ENCRYPTED in
// the local vault (Vault A). "Verify" re-hashes the stored bytes and compares
// to the recorded hash, proving the file has not been altered since intake.
const INDEX_ID = 'evidence_index';

// SHA-256 of an ArrayBuffer -> lowercase hex string.
async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

export default function EvidenceVault() {
  const { vaultAKey } = useAuthStore();
  const [index, setIndex] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const vaultOpen = !!vaultAKey;

  useEffect(() => {
    async function loadIndex() {
      if (!vaultAKey) return;
      try {
        const idx = await loadSecureRecord(vaultAKey, INDEX_ID);
        if (idx) setIndex(idx);
      } catch {
        setStatus('Could not decrypt the evidence index with the current key.');
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
    setStatus(`Hashing and encrypting ${file.name}…`);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf); // REAL SHA-256 over the actual bytes

      const id = `EV-${Date.now()}`;
      // Store the encrypted file bytes as its own vault record.
      await saveSecureRecord(vaultAKey, `evidence_blob_${id}`, {
        b64: bytesToB64(buf),
        mime: file.type || 'application/octet-stream'
      });

      const summary = {
        id,
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
        hash,
        date: new Date().toISOString().slice(0, 10),
        verified: true // hash recorded at intake == current bytes by definition
      };
      const updated = [summary, ...index];
      setIndex(updated);
      await saveSecureRecord(vaultAKey, INDEX_ID, updated);
      setStatus(`Sealed ${file.name} · SHA-256 ${hash.slice(0, 12)}…`);
    } catch (err) {
      setStatus('Upload failed: ' + err.message);
    }
    setBusy(false);
  };

  // Re-hash the stored bytes and compare to the recorded hash.
  const verify = async (item) => {
    if (!vaultAKey) return;
    setStatus(`Verifying ${item.name}…`);
    try {
      const blob = await loadSecureRecord(vaultAKey, `evidence_blob_${item.id}`);
      if (!blob) { setStatus('Stored file bytes not found — integrity FAILED.'); return; }
      const bytes = b64ToBytes(blob.b64);
      const recomputed = await sha256Hex(bytes.buffer);
      const ok = recomputed === item.hash;
      const updated = index.map((x) => x.id === item.id ? { ...x, verified: ok } : x);
      setIndex(updated);
      await saveSecureRecord(vaultAKey, INDEX_ID, updated);
      setStatus(ok
        ? `✓ ${item.name} integrity VERIFIED — hash matches intake.`
        : `✗ ${item.name} integrity FAILED — bytes do not match recorded hash!`);
    } catch (err) {
      setStatus('Verify error: ' + err.message);
    }
  };

  // Download the decrypted file back out of the vault.
  const download = async (item) => {
    if (!vaultAKey) return;
    try {
      const blob = await loadSecureRecord(vaultAKey, `evidence_blob_${item.id}`);
      if (!blob) { setStatus('Stored file bytes not found.'); return; }
      const bytes = b64ToBytes(blob.b64);
      const url = URL.createObjectURL(new Blob([bytes], { type: blob.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus('Download failed: ' + err.message);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Evidence Vault</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            Encrypted attachment store with real SHA-256 chain-of-custody verification.
          </p>
        </div>
        <button onClick={handleUploadClick} disabled={!vaultOpen || busy} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold', opacity: (!vaultOpen || busy) ? 0.5 : 1 }}>
          {busy ? 'Sealing…' : '+ Secure Upload'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Vault locked. Log in to store or verify evidence.
        </div>
      )}

      <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>ID</th>
              <th style={{ padding: '1rem' }}>File Name</th>
              <th style={{ padding: '1rem' }}>Size</th>
              <th style={{ padding: '1rem' }}>SHA-256</th>
              <th style={{ padding: '1rem' }}>Uploaded</th>
              <th style={{ padding: '1rem' }}>Integrity</th>
              <th style={{ padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {index.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                <td style={{ padding: '1rem', color: 'var(--gold)' }}>{f.id}</td>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{f.name}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{humanSize(f.size)}</td>
                <td style={{ padding: '1rem', color: 'var(--ember)', fontSize: '0.75rem' }} title={f.hash}>{f.hash.slice(0, 16)}…</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{f.date}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ color: f.verified ? '#4ade80' : '#fda4af' }}>{f.verified ? '✓ intact' : '✗ FAILED'}</span>
                </td>
                <td style={{ padding: '1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => verify(f)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--bone)', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Verify</button>
                  <button onClick={() => download(f)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--bone)', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Download</button>
                </td>
              </tr>
            ))}
            {index.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No evidence sealed yet.</td></tr>
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
