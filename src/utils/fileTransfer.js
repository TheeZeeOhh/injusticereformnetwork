// fileTransfer.js
//
// One place that knows how to get bytes in and out of the app.
//
// THE BUG THIS EXISTS TO FIX: every save path did
//   const a = document.createElement('a'); a.download = name; a.click();
// and every load path did
//   <input type="file" hidden /> + inputRef.current.click();
//
// Both are browser-only. Inside the Tauri webview they are silent no-ops:
//   - Linux/WebKitGTK has no download manager unless the host app handles the
//     `download-requested` signal. Tauri does not by default, so `a.click()`
//     resolves to nothing at all — no file, no error, no console warning.
//   - the native file chooser needs `run-file-chooser` handled, likewise not
//     wired by default, so `input.click()` opens nothing.
//
// That is why the buttons "don't work" rather than "fail": there was never an
// error to catch. The USB flow (usbIO.js) already did this correctly via the
// dialog plugin + narrow Rust commands; this module generalises that pattern so
// every other upload/download uses it too.
//
// Browser (npm run dev) keeps the DOM path so development still works — the
// branch is explicit and commented, not an accident.

function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

async function tauriInvoke(cmd, args) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
}

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  throw new Error('saveFile expects a string, ArrayBuffer, or typed array.');
}

/**
 * Save bytes to disk, asking the operator where.
 *
 * @param {string} suggestedName  default filename shown in the dialog
 * @param {string|ArrayBuffer|Uint8Array} data
 * @param {{ mime?: string, filters?: {name:string,extensions:string[]}[] }} opts
 * @returns {Promise<{ saved: boolean, path?: string }>}  saved:false = cancelled
 */
export async function saveFile(suggestedName, data, opts = {}) {
  const bytes = toUint8(data);

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: suggestedName,
      filters: opts.filters,
    });
    // The operator cancelled the dialog. Not an error — say so plainly so the
    // caller can leave the status line alone instead of reporting a failure.
    if (!path) return { saved: false };
    await tauriInvoke('write_export_file', { path, bytes: Array.from(bytes) });
    return { saved: true, path };
  }

  // Browser dev fallback — the original DOM path, which genuinely works here.
  const url = URL.createObjectURL(
    new Blob([bytes], { type: opts.mime || 'application/octet-stream' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a); // Firefox ignores a click on a detached anchor
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { saved: true };
}

/**
 * Ask the operator to pick a file and return its bytes.
 *
 * @param {{ title?: string, filters?: {name:string,extensions:string[]}[], accept?: string }} opts
 * @returns {Promise<{ picked: boolean, name?: string, bytes?: Uint8Array }>}
 */
export async function pickFile(opts = {}) {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      directory: false,
      title: opts.title,
      filters: opts.filters,
    });
    if (typeof path !== 'string') return { picked: false };
    const raw = await tauriInvoke('read_import_file', { path });
    const bytes = toUint8(raw instanceof Array ? Uint8Array.from(raw) : raw);
    const name = path.split(/[\\/]/).pop();
    return { picked: true, name, bytes };
  }

  // Browser dev fallback.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts.accept) input.accept = opts.accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    input.onchange = async () => {
      settled = true;
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve({ picked: false });
      const buf = await file.arrayBuffer();
      resolve({ picked: true, name: file.name, bytes: new Uint8Array(buf) });
    };
    // 'cancel' is not universally supported; the focus fallback keeps the
    // promise from hanging forever if the operator dismisses the chooser.
    input.oncancel = () => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve({ picked: false });
    };
    input.click();
  });
}

/** Convenience for text payloads (backups, JSON exports). */
export async function pickTextFile(opts = {}) {
  const res = await pickFile(opts);
  if (!res.picked) return { picked: false };
  return { picked: true, name: res.name, text: new TextDecoder().decode(res.bytes) };
}

// Identify an image by its MAGIC BYTES rather than its filename extension.
//
// In the browser path the File object carries a `type`, but the Tauri path only
// yields a path plus bytes, so the MIME has to come from somewhere. Sniffing the
// content rather than trusting the name is both the only option that works in
// Tauri and the better one: a client photo ends up inside an encrypted PHI
// record, and "it was called .png" is not evidence that it is a PNG.
//
// Deliberately limited to PNG and JPEG, matching the accept lists the two upload
// controls already advertised. Widening the allowed formats is a policy change,
// not a bug fix, so it is not smuggled in here.
function sniffImageMime(bytes) {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

// Chunked base64. Spreading a whole Uint8Array into String.fromCharCode(...)
// throws RangeError past the engine's argument limit — the same trap already
// fixed in cryptoEngine's toBase64. A multi-megabyte photo hits it easily.
function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Pick an image and return it as a data URL, ready for an <img src> or for
 * storage. Callers keep their OWN size/format policy — this only acquires the
 * bytes and proves they really are an image.
 *
 * @param {{ title?: string }} opts
 * @returns {Promise<{picked:boolean, dataUrl?:string, name?:string, byteLength?:number, reason?:string}>}
 */
export async function pickImageAsDataUrl(opts = {}) {
  const res = await pickFile({
    title: opts.title || 'Select an image',
    accept: 'image/png, image/jpeg',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (!res.picked) return { picked: false };

  const mime = sniffImageMime(res.bytes);
  // Not an image by content. Report it rather than handing back a data URL that
  // would fail the caller's `startsWith('data:image/')` check for murky reasons.
  if (!mime) return { picked: false, reason: 'not-an-image' };

  return {
    picked: true,
    name: res.name,
    byteLength: res.bytes.length,
    dataUrl: `data:${mime};base64,${bytesToBase64(res.bytes)}`,
  };
}
