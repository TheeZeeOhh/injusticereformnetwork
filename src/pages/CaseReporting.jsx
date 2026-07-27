import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { useAuthStore } from '../store/authStore';
import { saveBytes } from '../utils/download';
import { loadSecureRecord } from '../utils/storageEngine';
import { appendEntry } from '../utils/auditLog';
import { INTAKE_QUESTIONS } from './intakeQuestions';
import { buildCaseSummaryText } from '../utils/caseReport';

// Automated Case Reporting — compiles ONE client's vault records into a case
// summary and exports a PDF. The PDF is UNENCRYPTED PHI leaving the vault, so
// export is gated behind an explicit warning + confirm. HRT (Vault B) is only
// included when Vault B is unlocked; otherwise the report notes it was omitted.
export default function CaseReporting() {
  const { vaultAKey, vaultBKey } = useAuthStore();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [reportText, setReportText] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    async function loadDir() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClients(dir);
      } catch { /* none yet */ }
    }
    loadDir();
  }, [vaultAKey]);

  const compile = async (id) => {
    setClientId(id);
    setReportText('');
    if (!id || !vaultAKey) return;
    setLoading(true);
    const bareRef = id.replace('client_', '');
    try {
      const client = (await safeLoad(vaultAKey, id, 'A')) || {};
      const intake = await safeLoad(vaultAKey, `intake_${id}`, 'A');
      const notes = (await safeLoad(vaultAKey, `clinical_notes_${id}`, 'A')) || [];
      const transcripts = (await safeLoad(vaultAKey, `transcript_${id}`, 'A')) || [];
      const allAppts = (await safeLoad(vaultAKey, 'appointments', 'A')) || [];
      const appts = (Array.isArray(allAppts) ? allAppts : []).filter(
        (a) => a.patientId === id || a.patientId === bareRef
      );

      // HRT: Vault B, only when unlocked.
      let hrt = null;
      const hrtLocked = !vaultBKey;
      if (vaultBKey) {
        hrt = await safeLoad(vaultBKey, `hrt_${bareRef}`, 'B');
      }

      const text = buildCaseSummaryText({
        client, clientId: id, intake, intakeQuestions: INTAKE_QUESTIONS,
        notes, appts, transcripts, hrt, hrtLocked, now: new Date(),
      });
      setReportText(text);
    } catch {
      setReportText('Failed to compile report (is the vault unlocked?).');
    }
    setLoading(false);
  };

  const doExport = () => {
    setConfirmOpen(false);
    if (!reportText) return;
    const doc = new jsPDF();
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(reportText, 180);
    // Paginate: ~ 60 lines/page at this size.
    const perPage = 60;
    for (let i = 0; i < lines.length; i += perPage) {
      if (i > 0) doc.addPage();
      doc.text(lines.slice(i, i + perPage), 15, 15);
    }
    const ref = clientId.replace('client_', '');
    const date = new Date().toISOString().slice(0, 10);
    // doc.save()'s blob-anchor download is dropped by the Tauri webview.
    saveBytes(new Uint8Array(doc.output('arraybuffer')), `case_summary_${ref}_${date}.pdf`);
    // Audit metadata only — never PHI (matches Settings backup logging).
    appendEntry({ action: 'admin', recordId: 'case_report_export', vaultTag: null });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Automated Case Reporting</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Compile a client&rsquo;s records into a case summary. Export produces an unencrypted PDF.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={clientId}
          onChange={(e) => compile(e.target.value)}
          style={{ padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', minWidth: '240px' }}
        >
          <option value="">— Select a client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>)}
        </select>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!reportText || loading}
          className="btn-primary"
          style={{ background: (!reportText || loading) ? 'var(--charcoal-lighter)' : 'var(--gold)', color: (!reportText || loading) ? 'var(--text-tertiary)' : 'var(--charcoal)', fontWeight: 'bold' }}
        >
          🗂️ Export Case Summary PDF
        </button>
        {!vaultBKey && clientId && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Vault B locked — HRT will be omitted.</span>
        )}
      </div>

      <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Compiling…</div>
        ) : reportText ? (
          <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.55 }}>{reportText}</pre>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Select a client to preview their case summary.</div>
        )}
      </div>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '460px', border: '1px solid var(--ember)' }}>
            <h3 style={{ color: 'var(--ember)', marginTop: 0, fontFamily: 'var(--font-serif)' }}>⚠ Export unencrypted PHI</h3>
            <p style={{ color: 'var(--bone)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              This PDF contains the client&rsquo;s confidential health/legal records in
              plaintext and will leave the encrypted vault as a file on this device.
              Only export if you have a lawful need and will handle it accordingly.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button onClick={() => setConfirmOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={doExport} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>Export anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Load helper that swallows "not found / can't decrypt" into null so one missing
// record type never aborts the whole report.
async function safeLoad(key, id, tag) {
  try { return await loadSecureRecord(key, id, tag); } catch { return null; }
}
