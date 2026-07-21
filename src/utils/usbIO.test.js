import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri core invoke so we can assert the adapter calls the right
// commands with the right args, without a running Tauri runtime.
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invokeMock(...a) }));
// clearSalts is exercised elsewhere; stub it here to assert it's wired.
const clearSaltsMock = vi.fn();
vi.mock('./cryptoEngine', () => ({ clearSalts: (...a) => clearSaltsMock(...a) }));

import { makeUsbIO } from './usbIO';

describe('makeUsbIO adapter -> Rust commands', () => {
  beforeEach(() => { invokeMock.mockReset(); clearSaltsMock.mockReset(); });

  it('requires a directory path', () => {
    expect(() => makeUsbIO('')).toThrow(/USB directory/);
    expect(() => makeUsbIO(null)).toThrow(/USB directory/);
  });

  it('readBundle calls read_usb_bundle and parses JSON', async () => {
    const bundle = { version: 4, records: [{ id: 'r1' }], hmac: 'sig' };
    invokeMock.mockResolvedValueOnce(JSON.stringify(bundle));
    const io = makeUsbIO('/run/media/user/STICK');
    const out = await io.readBundle();
    expect(invokeMock).toHaveBeenCalledWith('read_usb_bundle', { dir: '/run/media/user/STICK' });
    expect(out).toEqual(bundle);
  });

  it('readBundle returns null for a fresh stick (no bundle)', async () => {
    invokeMock.mockResolvedValueOnce(null);
    const io = makeUsbIO('/mnt/usb');
    expect(await io.readBundle()).toBeNull();
  });

  it('writeBundle calls write_usb_bundle with serialized JSON', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const io = makeUsbIO('/mnt/usb');
    const bundle = { version: 4, records: [], hmac: 'sig' };
    await io.writeBundle(bundle);
    expect(invokeMock).toHaveBeenCalledWith('write_usb_bundle', {
      dir: '/mnt/usb',
      bundleJson: JSON.stringify(bundle),
    });
  });

  it('readBack re-reads the bundle (durability confirm)', async () => {
    const bundle = { version: 4, records: [{ id: 'a' }], hmac: 'sig' };
    invokeMock.mockResolvedValueOnce(JSON.stringify(bundle));
    const io = makeUsbIO('/mnt/usb');
    expect(await io.readBack()).toEqual(bundle);
    expect(invokeMock).toHaveBeenCalledWith('read_usb_bundle', { dir: '/mnt/usb' });
  });

  it('clearSalts delegates to cryptoEngine.clearSalts', async () => {
    const io = makeUsbIO('/mnt/usb');
    await io.clearSalts();
    expect(clearSaltsMock).toHaveBeenCalledOnce();
  });

  it('write then read-back round-trips the same bundle object', async () => {
    const bundle = { version: 4, records: [{ id: 'x' }, { id: 'y' }], hmac: 'sig-xy' };
    const io = makeUsbIO('/mnt/usb');
    invokeMock.mockResolvedValueOnce(undefined);               // write
    invokeMock.mockResolvedValueOnce(JSON.stringify(bundle));  // read back
    await io.writeBundle(bundle);
    expect(await io.readBack()).toEqual(bundle);
  });
});
