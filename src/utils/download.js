// download.js — save bytes to a file that actually works in the Tauri desktop app.
//
// WHY: in the WebKitGTK webview, the usual `URL.createObjectURL(blob)` + an
// anchor `click()` download is SILENTLY DROPPED — the webview has no download
// handler, so nothing happens. This helper detects Tauri and instead pops the
// native save dialog + writes via the Rust `save_file` command. In a plain
// browser (dev) it falls back to the anchor download.

const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

// Best-effort extension → dialog filter, so the save dialog is friendly.
function filtersFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!ext || ext === name.toLowerCase()) return undefined;
  return [{ name: `${ext.toUpperCase()} file`, extensions: [ext] }];
}

/**
 * Save bytes to disk with the given suggested filename.
 * @param {Uint8Array|ArrayBuffer|Blob} data
 * @param {string} filename  suggested name, e.g. "report.pdf"
 * @returns {Promise<boolean>} true if saved, false if the user cancelled
 */
export async function saveBytes(data, filename) {
  // Normalize to a Uint8Array.
  let bytes;
  if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = data;

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await save({ defaultPath: filename, filters: filtersFor(filename) });
    if (!path) return false; // user cancelled
    await invoke('save_file', { path, bytes: Array.from(bytes) });
    return true;
  }

  // Browser fallback: blob + anchor.
  const blob = data instanceof Blob ? data : new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Convenience for text/HTML content. */
export async function saveText(text, filename, mime = 'text/plain') {
  const bytes = new TextEncoder().encode(text);
  return saveBytes(new Blob([bytes], { type: mime }), filename);
}
