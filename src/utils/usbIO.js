// usbIO.js
//
// Builds the injected I/O object that portableSession expects, backed by the
// REAL Tauri layer:
//   - the native folder picker (tauri-plugin-dialog) to choose the USB mount,
//   - the narrow Rust commands read_usb_bundle / write_usb_bundle for file I/O
//     (the webview itself has NO general filesystem access).
//
// FIX 3: this NO LONGER wires cryptoEngine.clearSalts. A portable eject must never
// clear the resident machine's keychain salts (that would orphan the machine's own
// vault). Portable-session keys come from the bundle's salts held in RAM.
//
// The bundle written to / read from the USB is already client-side-encrypted and
// HMAC-signed by backupEngine before it reaches Rust, so nothing here handles
// plaintext PHI or keys.

// Prompt the operator to choose the USB mount directory. Returns the absolute
// path string, or null if they cancelled.
export async function pickUsbDirectory() {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const dir = await open({
    directory: true,
    multiple: false,
    title: 'Select the USB drive for Sanctuary-to-Go',
  });
  // open() returns a string (single) or null when cancelled.
  return typeof dir === 'string' ? dir : null;
}

/**
 * Build the portableSession I/O object bound to a chosen USB directory.
 * @param {string} dir  absolute path to the USB mount (from pickUsbDirectory)
 * @returns {import('./portableSession').PortableIO}
 */
export function makeUsbIO(dir) {
  if (!dir || typeof dir !== 'string') {
    throw new Error('makeUsbIO requires a USB directory path');
  }
  const invoke = async (cmd, args) => {
    const { invoke: inv } = await import('@tauri-apps/api/core');
    return inv(cmd, args);
  };
  return {
    // read_usb_bundle returns the JSON string or null (fresh stick). Parse to the
    // bundle object portableSession/restoreBackup expect.
    readBundle: async () => {
      const json = await invoke('read_usb_bundle', { dir });
      return json ? JSON.parse(json) : null;
    },
    // write_usb_bundle does an atomic temp+rename write on the Rust side.
    writeBundle: async (bundle) => {
      await invoke('write_usb_bundle', { dir, bundleJson: JSON.stringify(bundle) });
    },
    // Durability confirm: read the just-written bundle back off the USB so
    // endPortableSession can verify it before wiping the host.
    readBack: async () => {
      const json = await invoke('read_usb_bundle', { dir });
      return json ? JSON.parse(json) : null;
    },
    // FIX 3: intentionally NO clearSalts — a portable eject never touches the
    // resident keychain (that orphaned the machine's own vault). See portableSession.
  };
}
