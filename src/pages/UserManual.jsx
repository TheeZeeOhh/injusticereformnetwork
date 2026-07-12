import React, { useState } from 'react';

export default function UserManual() {
  const [activeSection, setActiveSection] = useState('intro');

  const sections = [
    { id: 'intro', title: '1. Introduction to Sanctuary', icon: '🏰' },
    { id: 'clients', title: '2. Client Management', icon: '👥' },
    { id: 'audio', title: '3. Audio Intake', icon: '🎙️' },
    { id: 'security', title: '4. Security & Vaults', icon: '🛡️' },
    { id: 'backups', title: '5. Backups & Recovery', icon: '💾' },
    { id: 'logistics', title: '6. Vouchers & Transit', icon: '🎫' },
    { id: 'legal', title: '7. Legal Tools (FOIA & Attorneys)', icon: '⚖️' },
    { id: 'evidence', title: '8. Evidence & Canvas', icon: '🔐' },
    { id: 'nuke', title: '9. Emergency Protocols', icon: '🚨' }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Sanctuary User Manual</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Comprehensive operational guide for IRN Navigators.
        </p>
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
                <li style={{ marginBottom: '0.5rem' }}><strong>Keys live in RAM only:</strong> Derived keys are held in memory and never written to disk. Logging out, closing the app, or pulling the USB token wipes them.</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Salts in the OS keychain:</strong> Inside the desktop app, the per-install salts are stored in the operating system credential store, not in browser storage.</li>
                <li><strong>BridgeVault closure:</strong> The "Close Vault B" control in the header instantly drops the Vault B key from memory, locking sensitive 42 CFR records while general (Vault A) operations continue. Re-authenticate to reopen.</li>
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

        </div>
      </div>
    </div>
  );
}
