import React, { useState } from 'react';
import { pickUsbDirectory, makeUsbIO } from '../utils/usbIO';
import { beginPortableSession, endPortableSession, WIPE_POLICIES } from '../utils/portableSession';
import { restoreBackup, createBackup, verifyBackup } from '../utils/backupEngine';
import { nukeStorage } from '../utils/storageEngine';

// "Sanctuary-to-Go": run a portable session off a USB stick. Restore-on-unlock,
// export-and-wipe-on-eject. The heavy lifting is in portableSession (logic),
// usbIO (Tauri fs/dialog), and the backup engine (encryption). This screen only
// wires them to the operator: pick the USB, begin, then end (export + host wipe).
//
// The passphrase is entered here transiently and used only to derive the backup
// HMAC key for this operation — it is NEVER cached (the auth store deliberately
// does not hold the passphrase; keys live in RAM, not the passphrase itself).
// The bundle written to USB is client-side-encrypted + HMAC-signed; on eject the
// host is wiped per the chosen policy so no readable artifact remains.
export default function PortableSession() {
  const [passphrase, setPassphrase] = useState('');
  const [usbDir, setUsbDir] = useState('');
  const [wipePolicy, setWipePolicy] = useState('records'); // wipe records; never touches resident keychain (Fix 3)
  const [status, setStatus] = useState(null); // { ok, msg }
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false); // a session is currently open
  const [confirmWipe, setConfirmWipe] = useState(false); // FIX 1: explicit destructive-wipe consent

  // verifyBackup wires FIX 2 (restore-verify before wipe) into the eject path.
  const deps = { restoreBackup, createBackup, nukeStorage, verifyBackup };

  const choose = async () => {
    setStatus(null);
    try {
      const dir = await pickUsbDirectory();
      if (!dir) { setStatus({ ok: false, msg: 'No drive selected.' }); return; }
      setUsbDir(dir);
      setStatus({ ok: true, msg: `Selected: ${dir}` });
    } catch (e) {
      setStatus({ ok: false, msg: `Could not open picker: ${e?.message || e}` });
    }
  };

  const begin = async () => {
    if (!usbDir) { setStatus({ ok: false, msg: 'Choose the USB drive first.' }); return; }
    if (!passphrase) { setStatus({ ok: false, msg: 'Unlock a vault first (passphrase needed).' }); return; }
    setBusy(true); setStatus(null);
    try {
      const io = makeUsbIO(usbDir);
      const r = await beginPortableSession(passphrase, io, deps);
      setActive(true);
      setStatus({ ok: true, msg: r.fresh
        ? 'Fresh USB — new portable vault started.'
        : `Restored ${r.restored} record(s) from the USB.` });
    } catch (e) {
      setStatus({ ok: false, msg: `Begin failed: ${e?.message || e}` });
    }
    setBusy(false);
  };

  const end = async () => {
    if (!usbDir || !passphrase) { setStatus({ ok: false, msg: 'No active session.' }); return; }
    const destructive = wipePolicy !== 'none';
    // FIX 1: block a destructive eject unless the operator checked the consent box.
    if (destructive && !confirmWipe) {
      setStatus({ ok: false, msg: `This will WIPE local data (${wipePolicy}). Check the confirmation box first.` });
      return;
    }
    setBusy(true); setStatus(null);
    try {
      const io = makeUsbIO(usbDir);
      const r = await endPortableSession(passphrase, io, deps, { wipePolicy, confirmed: destructive ? true : undefined });
      setActive(false);
      setConfirmWipe(false);
      setStatus({ ok: true, msg: `Ejected. Bundle written to USB; host wiped (${r.wiped}). Safe to remove the drive.` });
    } catch (e) {
      // The orchestrator refuses to wipe if the USB write can't be confirmed, so
      // a failure here means the host data is INTACT — surface that reassurance.
      setStatus({ ok: false, msg: `Eject aborted: ${e?.message || e}. Host data left intact.` });
    }
    setBusy(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1>Sanctuary-to-Go (Portable USB)</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
        Work from a USB stick on any machine. Records are restored from the drive
        when you begin and written back (encrypted + signed) when you eject. On
        eject the host is wiped so nothing readable is left behind.
      </p>

      <label style={{ display: 'block', margin: '16px 0' }}>
        Vault passphrase (used once, never stored):{' '}
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={busy}
          autoComplete="off"
          style={{ marginLeft: 8 }}
        />
      </label>

      <div style={{ margin: '20px 0' }}>
        <button onClick={choose} disabled={busy}>Choose USB drive…</button>
        {usbDir && <span style={{ marginLeft: 12, fontSize: '0.85rem' }}>{usbDir}</span>}
      </div>

      <label style={{ display: 'block', margin: '12px 0' }}>
        Wipe policy on eject:{' '}
        <select value={wipePolicy} onChange={(e) => setWipePolicy(e.target.value)} disabled={busy}>
          {WIPE_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      {wipePolicy !== 'none' && (
        <label style={{ display: 'block', margin: '12px 0', color: 'var(--danger, crimson)', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={confirmWipe}
            onChange={(e) => setConfirmWipe(e.target.checked)}
            disabled={busy}
            style={{ marginRight: 8 }}
          />
          I understand ejecting will WIPE local data ({wipePolicy}) after the bundle is written &amp; verified on the USB.
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
        <button onClick={begin} disabled={busy || active || !usbDir}>Begin session</button>
        <button onClick={end} disabled={busy || !active || (wipePolicy !== 'none' && !confirmWipe)}>Eject &amp; wipe host</button>
      </div>

      {status && (
        <p style={{ color: status.ok ? 'var(--accent-1, green)' : 'var(--danger, crimson)', fontSize: '0.9rem' }}>
          {status.msg}
        </p>
      )}
    </div>
  );
}
