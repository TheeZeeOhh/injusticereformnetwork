import React, { useState } from 'react';

// Glossary — plain-language definitions of the terms used throughout Sanctuary.
const GLOSSARY = [
  ['42 CFR Part 2', 'The federal regulation protecting confidentiality of substance-use-disorder (SUD) treatment records. Stricter than HIPAA. In Sanctuary, Part 2 data lives in Vault B.'],
  ['AAD (identity binding)', 'Additional Authenticated Data — extra context (vault tag + record id) mixed into encryption so a record cannot be silently moved or decrypted under the wrong vault.'],
  ['AES-256-GCM', 'The authenticated encryption used for every record. "Authenticated" means tampering is detected on decrypt.'],
  ['BAA', 'Business Associate Agreement — a HIPAA contract. Telehealth requires acknowledging one before a call starts.'],
  ['BAM', 'Brief Addiction Monitor — a numeric SUD assessment score, tracked per-client in Vault B (42 CFR Part 2).'],
  ['Dead-man\u2019s switch', 'A hardware safeguard: removing the armed USB token instantly wipes session keys from memory.'],
  ['HRT', 'Hormone Replacement Therapy (gender-affirming care). Sensitive — stored in Vault B.'],
  ['k-anonymity', 'A privacy rule for aggregate numbers: a count is shown only if the group is large enough (\u22655) that no individual can be singled out. Smaller cells are suppressed.'],
  ['MAT / MOUD', 'Medication-Assisted Treatment / Medications for Opioid Use Disorder (buprenorphine, methadone, naltrexone\u2026) — the same class; MOUD is the current preferred term. Auto-routes to Vault B.'],
  ['PBKDF2', 'The key-stretching function that turns your passphrase into an encryption key (600,000 iterations makes brute-forcing slow).'],
  ['PHI', 'Protected Health Information — any client health data. PHI never leaves the device unencrypted.'],
  ['Quarantine (dual-LLM)', 'A prompt-injection defense: untrusted document text is reduced to structured fields before any AI sees it, so a malicious document cannot hijack the assistant.'],
  ['Technical Incapacity Defense', 'The core design: the operator is technically unable to produce readable client PHI under subpoena, because keys live only in RAM and vaults are unrecoverable.'],
  ['Vault A / Vault B', 'Two independently-encrypted stores. A = general records; B = sensitive (42 CFR Part 2 / HRT / MOUD). Separate passphrases; B is unrecoverable by design.'],
  ['Whisper', 'The on-device speech-to-text model (runs locally via WebAssembly). Audio never leaves the device.'],
];

// Extra topics beyond the original sections, so the manual covers the whole app.
const EXTRA = [
  ['assistant', '🧠', 'The Assistant (Amina / Wifey)', [
    'Amina is the LOCAL navigator assistant (on-device via Ollama, or a guided fallback) — it helps find the right Baltimore/Maryland resource, and client context stays on the device.',
    'For a GENERIC, person-free question, the assistant may consult "Wifey," which can reach a hosted model — but ONLY as a bare question with no client or record data attached.',
    'Attaching a client transcript forces the whole exchange LOCAL; it can never reach the hosted model. Crisis and escalation are always handled locally.',
    'Grounding gate: the assistant will not state a deadline, fee, or filing date as fact unless it is in your source document. Unverified figures are flagged — never rely on an AI-stated legal deadline without confirming it.',
  ]],
  ['sensitive', '🏳️\u200d⚧️', 'Sensitive Records (Vault B)', [
    'HRT Continuity and the Consent Manager (42 CFR Part 2 consents) live in Vault B.',
    'Medication Management: typing a MAT/MOUD medication auto-flags the record sensitive and routes it to Vault B.',
    'Vault B has its own passphrase, is unrecoverable by design (no reset/escrow), and is never cross-keyed with Vault A. Keep it closed unless actively in use.',
  ]],
  ['operations', '📅', 'Operations', [
    'Schedule & On-Call roster, Shift Swaps, Staffing Pipeline, Credentials Monitor — operational (non-PHI) data stored in Vault A.',
    'Intelligence Layer: on-device deterministic rule engines (policy scan, crisis-velocity interrupter, per-client BAM in Vault B). No black-box analytics on client PHI.',
    'Some panels use a small local backend (127.0.0.1) that holds NO PHI. If a panel looks empty, that backend may not be running.',
  ]],
];

export default function UserManual() {
  const [activeSection, setActiveSection] = useState('intro');

  const sections = [
    { id: 'intro', title: '1. Introduction to Sanctuary', icon: '🏰' },
    { id: 'clients', title: '2. Client Management', icon: '👥' },
    { id: 'audio', title: '3. Audio Intake', icon: '🎙️' },
    { id: 'assistant', title: '4. The Assistant', icon: '🧠' },
    { id: 'sensitive', title: '5. Sensitive Records', icon: '🏳️\u200d⚧️' },
    { id: 'security', title: '6. Security & Vaults', icon: '🛡️' },
    { id: 'backups', title: '7. Backups & Recovery', icon: '💾' },
    { id: 'logistics', title: '8. Vouchers & Transit', icon: '🎫' },
    { id: 'legal', title: '9. Legal Tools (FOIA & Attorneys)', icon: '⚖️' },
    { id: 'evidence', title: '10. Evidence & Canvas', icon: '🔐' },
    { id: 'operations', title: '11. Operations', icon: '📅' },
    { id: 'nuke', title: '12. Emergency Protocols', icon: '🚨' },
    { id: 'glossary', title: '13. Glossary', icon: '📖' }
  ];

  // Build a self-contained, printable HTML file of the whole manual for download.
  const downloadManual = () => {
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const secText = {
      intro: 'Sanctuary is a local-first, client-side-encrypted health & legal records app for the Injustice Reform Network. Built on a Technical Incapacity Defense: you are technically unable to produce unencrypted client data under subpoena, because decryption keys live in RAM and vanish on power-down or when the USB dead-man\u2019s switch is pulled. CRITICAL: never write down your vault passphrase — if lost, the data is gone, with no reset or recovery.',
      clients: 'Clients use a dual-vault architecture. Vault A: general demographics/contact, unlocked at login. Vault B (42 CFR Part 2): clinical diagnoses, HRT, SUD records — requires a separate cryptographic unlock. Add a client, fill the profile, "Save to Vault" to encrypt locally.',
      audio: 'Audio Intake requires the 42 CFR/BAA consent gate before recording. Transcription runs fully on-device (Whisper via WebAssembly) — no audio leaves the device. The ~145MB model downloads once from a public CDN on first use, then runs offline. Transcripts are not persisted by default.',
      security: 'Local-only: no cloud sync, no P2P. AES-256-GCM at rest; keys derived via PBKDF2-SHA256 (600,000 iterations) over per-install salts. Keys live in RAM only, never on disk. Salts stored in the OS keychain. Closing Vault B drops its key from memory while Vault A continues. Anti-exfiltration (no right-click/copy/select/drag) is on by default; a Systems Admin who also unlocks Vault B can lift it. No software stops a phone camera or an OS screenshot on Linux — minimize time PHI is on screen.',
      backups: 'A forgotten passphrase means unrecoverable data — back up regularly. Export a signed, encrypted backup (ciphertext only, HMAC-signed). Verify & Restore recomputes the signature and refuses tampered files or wrong passphrases. Sanctuary-to-Go moves records to another machine via an encrypted USB bundle (use records_only mode).',
      logistics: 'Transportation Hub dispatches volunteer drivers. Voucher Program authorizes stipends within the Sovereignty Fund budget. Stipends and Referrals track per-client material support.',
      legal: 'FOIA Generator drafts public-records requests and produces a real PDF. Attorney Directory is a vetted, encrypted (Vault A) rolodex with a Pro Bono flag. Case Reporting compiles reports. Visual Canvas is an encrypted note board for case timelines.',
      evidence: 'Evidence Vault stores files with a real SHA-256 hash for chain of custody: Verify re-hashes and compares; Download decrypts byte-for-byte. Large videos may hit storage limits.',
      nuke: 'Two responses to compromise: (1) Lock the keys — log out or pull the USB token; on-disk records remain but are unreadable ciphertext. (2) Scorched Earth (Settings > Catastrophic Protocols) deletes the local database via the storage API — it does NOT low-level-overwrite the disk, so the real guarantee is #1: keep your passphrase secret.',
    };
    const body = sections.filter((s) => s.id !== 'glossary').map((s) => {
      const extra = EXTRA.find((e) => e[0] === s.id);
      const text = extra ? extra[3].map((p) => `<p>${esc(p)}</p>`).join('') : `<p>${esc(secText[s.id] || '')}</p>`;
      return `<section><h2>${esc(s.title)}</h2>${text}</section>`;
    }).join('');
    const gloss = GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sanctuary User Manual v0.1.0</title>
<style>body{font-family:Georgia,serif;max-width:820px;margin:2rem auto;padding:0 1.25rem;color:#1a1a1a;line-height:1.55}
h1{font-size:2rem;border-bottom:3px solid #c9a24b;padding-bottom:.4rem}
h2{margin-top:2rem;color:#8a5a00;border-bottom:1px solid #ddd;padding-bottom:.2rem}
dt{font-weight:bold;margin-top:.7rem}dd{margin:0 0 .3rem 1.2rem}.meta{color:#666;font-size:.9rem}
@media print{body{margin:0;max-width:none}}</style></head><body>
<h1>Sanctuary User Manual</h1>
<p class="meta">Version 0.1.0 · Updated 2026-07-26 · Injustice Reform Network</p>
${body}<h2>📖 Glossary</h2><dl>${gloss}</dl>
<hr/><p class="meta">Generated from the app. Save or print to PDF for offline reference.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Sanctuary-User-Manual-v0.1.0.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Sanctuary User Manual</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            v0.1.0 · updated 2026-07-26 · comprehensive operational guide for IRN Navigators.
          </p>
        </div>
        <button className="btn-primary" onClick={downloadManual} style={{ padding: '0.5rem 1.1rem', whiteSpace: 'nowrap' }}>
          ⬇ Download manual (.html)
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem', flex: 1, overflow: 'hidden' }}>
        
        {/* Navigation Sidebar */}
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
          {sections.map(sec => (
            <button 
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              style={{
                textAlign: 'left',
                padding: '0.75rem 1rem',
                background: activeSection === sec.id ? 'var(--charcoal)' : 'transparent',
                color: activeSection === sec.id ? 'var(--gold)' : 'var(--bone)',
                border: 'none',
                borderLeft: activeSection === sec.id ? '3px solid var(--gold)' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                transition: '0.2s',
                borderRadius: '0 4px 4px 0'
              }}
            >
              {sec.icon} {sec.title}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="glass-panel" style={{ padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--bone)', lineHeight: '1.6' }}>
          
          {activeSection === 'intro' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Introduction to Sanctuary v7.0</h2>
              <p>Welcome to Sanctuary. This is not a standard Electronic Health Record (EHR) system. Sanctuary is a zero-trust, offline-first operating system designed specifically for the Injustice Reform Network (IRN).</p>
              <p>Because IRN Navigators work with highly marginalized populations—including TGEPOC and re-entry clients—this system is built on a "Technical Incapacity Defense." This means the system is architected in such a way that you are technically incapable of producing unencrypted client data under a subpoena, because the decryption keys are stored in volatile RAM and vanish the moment the system is powered down or a USB dead-man's switch is pulled.</p>
              <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1rem', borderLeft: '3px solid var(--ember)', marginTop: '1rem' }}>
                <strong style={{ color: 'var(--ember)' }}>CRITICAL RULE:</strong> Never write down your vault passphrase. If you lose it, the data is gone — there is no reset or recovery.
              </div>
            </>
          )}

          {activeSection === 'clients' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Client Management (Dual Vaults)</h2>
              <p>The Clients module operates on a strict Dual-Vault architecture:</p>
              <ul>
                <li style={{ marginBottom: '0.5rem' }}><strong>Vault A (General Intake):</strong> Stores basic demographic and contact information. Unlocked with your standard login.</li>
                <li><strong>Vault B (42 CFR Part 2):</strong> A secondary, heavily encrypted vault that stores clinical diagnoses, HRT regimens, and psychiatric substance abuse records. Requires a secondary cryptographic unlock and is legally shielded by federal 42 CFR protections.</li>
              </ul>
              <p>To add a client, navigate to <strong>Clients</strong>, click "+ Add New Client", fill out their profile, and click "Save to Vault" to encrypt the record locally into IndexedDB.</p>
            </>
          )}

          {activeSection === 'audio' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Audio Intake & Translation</h2>
              <p>Before recording, you MUST check the 42 CFR / BAA Consent Gate — the "Start Session" button stays locked until you do. The module is designed so that transcripts are never persisted: the session is discarded when you leave the page, satisfying the zero-audio-retention posture.</p>
              <p>Transcription runs fully on-device using OpenAI Whisper via WebAssembly — no audio is ever sent to Google, Amazon, or OpenAI's servers. Each segment is shown side-by-side: the original spoken language and an English translation (Whisper performs both).</p>
              <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1rem', borderLeft: '3px solid var(--ember)', marginTop: '0.5rem' }}>
                <strong style={{ color: 'var(--ember)' }}>FIRST-RUN NOTE:</strong> The speech model (~145&nbsp;MB) downloads once from a public CDN on your first session, then runs entirely offline and cached thereafter. That first download is the only moment the module touches the network. Transcription is not instantaneous — expect a short delay per segment.
              </div>
            </>
          )}

          {activeSection === 'security' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Security &amp; Vaults</h2>
              <p>Sanctuary is <strong>local-only</strong>. Client data is never transmitted off the device — there is no cloud sync and no peer-to-peer network. Everything below runs on this machine.</p>
              <ul>
                <li style={{ marginBottom: '0.5rem' }}><strong>Encryption at rest:</strong> Every record is encrypted with AES-256-GCM before being written to the local IndexedDB store. The authentication tag means tampered ciphertext will fail to decrypt.</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Key derivation:</strong> Your Vault A and Vault B keys are derived from your passphrase using PBKDF2-SHA256 with 600,000 iterations, over random per-install salts.</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Keys live in RAM only:</strong> Derived keys are held in memory and never written to disk. Logging out, closing the app, or pulling the USB token drops them from memory (they become inaccessible and are reclaimed by the runtime).</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Salts in the OS keychain:</strong> Inside the desktop app, the per-install salts are stored in the operating system credential store, not in browser storage.</li>
                <li><strong>BridgeVault closure:</strong> The "Close Vault B" control in the header drops the Vault B key from memory, locking sensitive 42 CFR records while general (Vault A) operations continue. Re-authenticate to reopen.</li>
              </ul>
            </>
          )}

          {activeSection === 'backups' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Backups &amp; Recovery</h2>
              <p>Because keys never leave this device and are derived from your passphrase, <strong>a forgotten passphrase means the data is unrecoverable.</strong> Back up regularly.</p>
              <ul>
                <li style={{ marginBottom: '0.5rem' }}><strong>Export:</strong> In <strong>Settings &gt; Encrypted Vault Backup</strong>, click "Export Signed Backup" and enter your passphrase. The file contains only encrypted ciphertext — no readable client data — and is signed with an HMAC so tampering is detectable.</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Restore:</strong> "Verify &amp; Restore" recomputes the signature first. If the file was altered, or the passphrase is wrong, the restore is refused and nothing is written.</li>
                <li><strong>Portable:</strong> Backups include the salts needed to re-derive keys, so a backup made on one device can be restored on another using the same passphrase.</li>
              </ul>
            </>
          )}

          {activeSection === 'logistics' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Vouchers & Transportation</h2>
              <p>IRN relies heavily on mutual aid logistics. You can manage these in two modules:</p>
              <ul>
                <li style={{ marginBottom: '0.5rem' }}><strong>Transportation Hub:</strong> Dispatch volunteer drivers to get clients to court hearings or clinics.</li>
                <li><strong>Voucher Program:</strong> Authorize financial stipends for emergency housing, transit, or groceries. The system strictly enforces the global Sovereignty Fund budget limit to prevent overdrafts.</li>
              </ul>
            </>
          )}

          {activeSection === 'legal' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Legal Tools</h2>
              <p><strong>FOIA Generator.</strong> Draft a Freedom of Information Act / public-records request. Pick the target agency, enter the client name, incident date, and (optionally) an officer badge number. The right-hand panel shows a live preview of the letter; "Generate Request Document" produces a <strong>real PDF</strong> matching that preview, saved to your device via your browser's download. Client name and incident date are required before a PDF will generate.</p>
              <p><strong>Attorney Directory.</strong> A vetted, offline rolodex of defense, immigration, civil-rights, family, and housing attorneys. Add an attorney with their firm, contact info, and a <strong>Pro Bono Available</strong> flag; search by name or specialty; remove entries you no longer need. The directory is stored <strong>encrypted in your vault</strong> (Vault A), so it persists across sessions and is included in backups.</p>
            </>
          )}

          {activeSection === 'evidence' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Evidence Vault &amp; Visual Canvas</h2>
              <p><strong>Evidence Vault.</strong> Upload files (photos, signed leases, bodycam clips, PDFs). On upload, Sanctuary computes a <strong>real SHA-256 hash</strong> of the file's actual bytes and stores the encrypted file plus that hash in your vault. This is your chain of custody:</p>
              <ul>
                <li style={{ marginBottom: '0.5rem' }}><strong>Verify:</strong> re-reads the stored file, re-computes its SHA-256, and compares it to the hash recorded at intake. A match proves the file has not been altered; a mismatch flags it <span style={{ color: '#fda4af' }}>✗ FAILED</span>.</li>
                <li><strong>Download:</strong> decrypts the original file back out of the vault, byte-for-byte.</li>
              </ul>
              <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1rem', borderLeft: '3px solid var(--ember)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                <strong style={{ color: 'var(--ember)' }}>SIZE NOTE:</strong> Files are stored inside the encrypted local database. This is ideal for photos and documents; very large videos (hundreds of MB or more) may be slow or hit browser storage limits.
              </div>
              <p><strong>Visual Canvas.</strong> An offline note board for mapping case timelines and evidence threads. Click "+ Add Note" to drop a sticky note, drag it to arrange, edit its text inline, and delete with the ✕. The board is saved <strong>encrypted to your vault</strong> and reloads when you return. (This is a note board, not a full drawing tool — there is no freehand drawing or shapes.)</p>
            </>
          )}

          {activeSection === 'nuke' && (
            <>
              <h2 style={{ color: 'var(--ember)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Emergency Protocols</h2>
              <p>If a Navigator is detained or a device is compromised, there are two responses:</p>
              <p><strong>1. Lock the keys (fast, reversible).</strong> Log out, or — if armed — pull the designated USB token. This immediately drops the encryption keys from RAM. The on-disk records remain, but they are AES-256-GCM ciphertext and cannot be read without re-deriving the keys from your passphrase. This is the primary defense: without the passphrase, the data is unreadable.</p>
              <p><strong>2. Scorched Earth (destructive).</strong> In <strong>Settings &gt; Catastrophic Protocols</strong>, "Initiate Destruction" (with typed confirmation) runs <code>nukeStorage()</code>, which deletes the local IndexedDB database.</p>
              <div style={{ background: 'rgba(226, 85, 43, 0.1)', padding: '1rem', borderLeft: '3px solid var(--ember)', marginTop: '0.5rem' }}>
                <strong style={{ color: 'var(--ember)' }}>IMPORTANT — how the wipe actually works:</strong> "Scorched Earth" deletes the database via the browser/OS storage API. It does <strong>not</strong> perform a low-level cryptographic overwrite of the physical disk, and forensic recovery of deleted storage may be possible. The strongest guarantee is #1: the data was never stored in plaintext, so keeping your passphrase secret keeps the records unreadable regardless of what remains on disk.
              </div>
            </>
          )}

          {EXTRA.map(([id, icon, title, paras]) => activeSection === id && (
            <React.Fragment key={id}>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>{icon} {title}</h2>
              {paras.map((p, i) => <p key={i}>{p}</p>)}
            </React.Fragment>
          ))}

          {activeSection === 'glossary' && (
            <>
              <h2 style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>📖 Glossary</h2>
              <dl style={{ margin: 0 }}>
                {GLOSSARY.map(([term, def]) => (
                  <div key={term} style={{ marginBottom: '0.9rem' }}>
                    <dt style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{term}</dt>
                    <dd style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{def}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
