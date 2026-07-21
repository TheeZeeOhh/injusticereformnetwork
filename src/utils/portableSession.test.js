import { describe, it, expect, vi } from 'vitest';
import { beginPortableSession, endPortableSession, WIPE_POLICIES } from './portableSession';

// A signed-bundle stand-in. restoreBackup/createBackup are injected, so we don't
// need real crypto here — we test the ORCHESTRATION and its safety ordering.
const bundleOf = (ids, hmac = 'sig') => ({
  version: 4, salts: '{"saltA":"x","saltB":"y"}',
  records: ids.map((id) => ({ id, data: 'zzz' })), hmac,
});

function makeDeps(overrides = {}) {
  return {
    restoreBackup: vi.fn(async () => ({ restored: 3 })),
    createBackup: vi.fn(async () => bundleOf(['r1', 'r2'])),
    nukeStorage: vi.fn(async () => true),
    ...overrides,
  };
}
function makeIO(overrides = {}) {
  let onUsb = overrides.initialBundle ?? null;
  return {
    readBundle: vi.fn(async () => onUsb),
    writeBundle: vi.fn(async (b) => { onUsb = b; }),
    readBack: vi.fn(async () => onUsb),
    clearSalts: vi.fn(async () => {}),
    _peek: () => onUsb,
    ...overrides,
  };
}

describe('beginPortableSession', () => {
  it('fresh USB (no bundle) starts clean, restores nothing', async () => {
    const io = makeIO({ initialBundle: null });
    const deps = makeDeps();
    const r = await beginPortableSession('pw', io, deps);
    expect(r).toEqual({ started: true, restored: 0, fresh: true });
    expect(deps.restoreBackup).not.toHaveBeenCalled();
  });

  it('existing bundle is restored (HMAC verified inside restoreBackup)', async () => {
    const io = makeIO({ initialBundle: bundleOf(['a', 'b', 'c']) });
    const deps = makeDeps();
    const r = await beginPortableSession('pw', io, deps);
    expect(r.fresh).toBe(false);
    expect(r.restored).toBe(3);
    expect(deps.restoreBackup).toHaveBeenCalledWith('pw', expect.objectContaining({ hmac: 'sig' }));
  });

  it('a failed verification (restoreBackup throws) propagates and does NOT wipe', async () => {
    const io = makeIO({ initialBundle: bundleOf(['a']) });
    const deps = makeDeps({ restoreBackup: vi.fn(async () => { throw new Error('sig fail'); }) });
    await expect(beginPortableSession('pw', io, deps)).rejects.toThrow(/sig fail/);
    expect(deps.nukeStorage).not.toHaveBeenCalled();
  });
});

describe('endPortableSession — write-then-wipe ordering (THE safety invariant)', () => {
  it('writes USB bundle BEFORE wiping host', async () => {
    const order = [];
    const io = makeIO();
    io.writeBundle = vi.fn(async (b) => { order.push('write'); io._set?.(b); });
    const deps = makeDeps();
    deps.nukeStorage = vi.fn(async () => { order.push('wipe'); return true; });
    // readBack must see the written bundle for the confirm to pass
    io.writeBundle = vi.fn(async () => { order.push('write'); });
    io.readBack = vi.fn(async (b) => b); // echo the bundle we tried to write
    await endPortableSession('pw', io, deps, { wipePolicy: 'records_only' });
    expect(order).toEqual(['write', 'wipe']);
  });

  it('does NOT wipe if the USB write cannot be confirmed', async () => {
    const io = makeIO();
    io.readBack = vi.fn(async () => null); // durability confirm fails
    const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records_and_salts' }))
      .rejects.toThrow(/could not be confirmed|NOT wiped/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();     // host untouched
    expect(io.clearSalts).not.toHaveBeenCalled();
  });

  it('does NOT wipe if the confirmed bundle mismatches (truncated write)', async () => {
    const io = makeIO();
    const deps = makeDeps({ createBackup: vi.fn(async () => bundleOf(['r1', 'r2', 'r3'], 'sigA')) });
    io.readBack = vi.fn(async () => bundleOf(['r1'], 'sigA')); // fewer records back
    await expect(endPortableSession('pw', io, deps)).rejects.toThrow(/could not be confirmed|NOT wiped/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();
  });
});

describe('endPortableSession — wipe policies', () => {
  it('records_and_salts wipes storage AND clears keychain salts', async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'records_and_salts' });
    expect(deps.nukeStorage).toHaveBeenCalledOnce();
    expect(io.clearSalts).toHaveBeenCalledOnce();
    expect(r.wiped).toBe('records_and_salts');
  });

  it('records_only wipes storage but keeps salts', async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'records_only' });
    expect(deps.nukeStorage).toHaveBeenCalledOnce();
    expect(io.clearSalts).not.toHaveBeenCalled();
    expect(r.wiped).toBe('records_only');
  });

  it('none writes the bundle but performs no wipe', async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'none' });
    expect(io.writeBundle).toHaveBeenCalledOnce();
    expect(deps.nukeStorage).not.toHaveBeenCalled();
    expect(r.wiped).toBe('none');
  });

  it('default policy is the strongest (records_and_salts)', async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps);
    expect(r.wiped).toBe('records_and_salts');
  });

  it('records_and_salts without a clearSalts impl fails loudly (no silent skip)', async () => {
    const io = makeIO({ clearSalts: undefined }); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records_and_salts' }))
      .rejects.toThrow(/requires io.clearSalts/);
  });

  it('rejects an unknown wipe policy', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'yolo' })).rejects.toThrow(/invalid wipePolicy/);
  });
});

describe('guards', () => {
  it('requires a passphrase on both ends', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(beginPortableSession('', io, deps)).rejects.toThrow(/passphrase/);
    await expect(endPortableSession('', io, deps)).rejects.toThrow(/passphrase/);
  });
  it('WIPE_POLICIES is the documented set', () => {
    expect(WIPE_POLICIES).toEqual(['records_and_salts', 'records_only', 'none']);
  });
});
