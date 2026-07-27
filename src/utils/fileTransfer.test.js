import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The Tauri modules are optional peer deps at runtime; stub them so the Tauri
// branch is exercised without a desktop shell.
const invokeMock = vi.fn();
const saveMock = vi.fn();
const openMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invokeMock(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...a) => saveMock(...a),
  open: (...a) => openMock(...a),
}));

const { saveFile, pickFile, pickTextFile, pickImageAsDataUrl } = await import('./fileTransfer.js');

describe('fileTransfer — Tauri branch (the one that was broken)', () => {
  beforeEach(() => {
    globalThis.window = globalThis;
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockReset();
    saveMock.mockReset();
    openMock.mockReset();
  });
  afterEach(() => { delete window.__TAURI_INTERNALS__; });

  it('saveFile routes through the native dialog and the Rust command', async () => {
    saveMock.mockResolvedValue('/home/zee/export.json');
    invokeMock.mockResolvedValue(undefined);

    const res = await saveFile('export.json', '{"a":1}', { mime: 'application/json' });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('write_export_file', expect.objectContaining({
      path: '/home/zee/export.json',
    }));
    expect(res).toEqual({ saved: true, path: '/home/zee/export.json' });
  });

  it('a cancelled save dialog reports saved:false, not a fake success', async () => {
    saveMock.mockResolvedValue(null);
    const res = await saveFile('export.json', 'x');
    expect(res.saved).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('saveFile encodes strings to bytes before handing them to Rust', async () => {
    saveMock.mockResolvedValue('/tmp/f.txt');
    invokeMock.mockResolvedValue(undefined);
    await saveFile('f.txt', 'hi');
    const { bytes } = invokeMock.mock.calls[0][1];
    expect(Array.from(bytes)).toEqual([104, 105]);
  });

  it('pickFile reads the chosen path and returns bytes + basename', async () => {
    openMock.mockResolvedValue('/home/zee/docs/order.pdf');
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const res = await pickFile({ title: 'pick' });

    expect(invokeMock).toHaveBeenCalledWith('read_import_file', { path: '/home/zee/docs/order.pdf' });
    expect(res.picked).toBe(true);
    expect(res.name).toBe('order.pdf');
    expect(Array.from(res.bytes)).toEqual([1, 2, 3]);
  });

  it('a cancelled open dialog reports picked:false', async () => {
    openMock.mockResolvedValue(null);
    const res = await pickFile();
    expect(res.picked).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('pickFile tolerates a number-array IPC response as well as raw bytes', async () => {
    openMock.mockResolvedValue('/tmp/a.bin');
    invokeMock.mockResolvedValue([9, 8, 7]);
    const res = await pickFile();
    expect(Array.from(res.bytes)).toEqual([9, 8, 7]);
  });

  it('pickTextFile decodes to a string', async () => {
    openMock.mockResolvedValue('/tmp/backup.json');
    invokeMock.mockResolvedValue(new TextEncoder().encode('{"ok":true}'));
    const res = await pickTextFile();
    expect(res.picked).toBe(true);
    expect(JSON.parse(res.text)).toEqual({ ok: true });
  });

  it('rejects payloads that are not text or bytes', async () => {
    saveMock.mockResolvedValue('/tmp/x');
    await expect(saveFile('x', { not: 'bytes' })).rejects.toThrow(/string, ArrayBuffer, or typed array/);
  });
});

describe('fileTransfer — pickImageAsDataUrl', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

  beforeEach(() => {
    globalThis.window = globalThis;
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockReset();
    openMock.mockReset();
  });
  afterEach(() => { delete window.__TAURI_INTERNALS__; });

  it('identifies a PNG by magic bytes, not by filename', async () => {
    openMock.mockResolvedValue('/tmp/actually-a-png.jpg'); // lying extension
    invokeMock.mockResolvedValue(PNG);
    const res = await pickImageAsDataUrl();
    expect(res.picked).toBe(true);
    expect(res.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(res.byteLength).toBe(PNG.length);
  });

  it('identifies a JPEG by magic bytes', async () => {
    openMock.mockResolvedValue('/tmp/x.jpeg');
    invokeMock.mockResolvedValue(JPEG);
    const res = await pickImageAsDataUrl();
    expect(res.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('rejects a non-image even when it is named .png', async () => {
    openMock.mockResolvedValue('/tmp/malicious.png');
    invokeMock.mockResolvedValue(new TextEncoder().encode('%PDF-1.7 not an image'));
    const res = await pickImageAsDataUrl();
    expect(res.picked).toBe(false);
    expect(res.reason).toBe('not-an-image');
  });

  it('reports cancellation without a reason code', async () => {
    openMock.mockResolvedValue(null);
    const res = await pickImageAsDataUrl();
    expect(res.picked).toBe(false);
    expect(res.reason).toBeUndefined();
  });

  it('base64-encodes a multi-megabyte image without a RangeError', async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG.subarray(0, 8), 0);
    openMock.mockResolvedValue('/tmp/big.png');
    invokeMock.mockResolvedValue(big);
    const res = await pickImageAsDataUrl();
    expect(res.picked).toBe(true);
    expect(res.dataUrl.length).toBeGreaterThan(8 * 1024 * 1024);
  });

  it('round-trips the bytes through base64 intact', async () => {
    openMock.mockResolvedValue('/tmp/x.png');
    invokeMock.mockResolvedValue(PNG);
    const res = await pickImageAsDataUrl();
    const b64 = res.dataUrl.split(',')[1];
    const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(back)).toEqual(Array.from(PNG));
  });
});
