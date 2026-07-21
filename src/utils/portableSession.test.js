import { describe, it, expect, vi } from 'vitest';
import { beginPortableSession, endPortableSession, WIPE_POLICIES } from './portableSession';

// A signed-bundle stand-in. createBackup/verifyBackup are injected, so we don't
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
    verifyBackup: vi.fn(async () => true), // bundle verifies restorable by default
    ...overrides,
  };
}

// destructive ejects now require explicit confirmation; helper keeps tests terse
const CONFIRM = { confirmed: true };

function makeIO(overrides = {}) {
  let onUsb = overrides.initialBundle ?? null;
  const io = {
    readBundle: vi.fn(async () => onUsb),
    writeBundle: vi.fn(async (b) => { onUsb = b; }),
    readBack: vi.fn(async () => onUsb),
    // FIX 3: clearSalts is a spy so tests can assert the eject NEVER calls it.
    clearSalts: vi.fn(async () => {}),
    _peek: () => onUsb,
    ...overrides,
  };
  return io;
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
    const deps = makeDeps();
    deps.nukeStorage = vi.fn(async () => { order.push('wipe'); return true; });
    io.writeBundle = vi.fn(async () => { order.push('write'); });
    io.readBack = vi.fn(async (b) => b); // echo the bundle we tried to write
    await endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM });
    expect(order).toEqual(['write', 'wipe']);
  });

  it('does NOT wipe if the USB write cannot be confirmed', async () => {
    const io = makeIO();
    io.readBack = vi.fn(async () => null); // durability confirm fails
    const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM }))
      .rejects.toThrow(/could not be confirmed|NOT wiped/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();     // host untouched
  });

  it('does NOT wipe if the confirmed bundle mismatches (truncated write)', async () => {
    const io = makeIO();
    const deps = makeDeps({ createBackup: vi.fn(async () => bundleOf(['r1', 'r2', 'r3'], 'sigA')) });
    io.readBack = vi.fn(async () => bundleOf(['r1'], 'sigA')); // fewer records back
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM }))
      .rejects.toThrow(/could not be confirmed|NOT wiped/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();
  });
});

describe('endPortableSession — wipe policies', () => {
  it("'records' wipes local storage", async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM });
    expect(deps.nukeStorage).toHaveBeenCalledOnce();
    expect(r.wiped).toBe('records');
  });

  it("'none' writes the bundle but performs no wipe", async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'none' });
    expect(io.writeBundle).toHaveBeenCalledOnce();
    expect(deps.nukeStorage).not.toHaveBeenCalled();
    expect(r.wiped).toBe('none');
  });

  it("default policy is 'records'", async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, CONFIRM);
    expect(r.wiped).toBe('records');
  });

  it('rejects an unknown wipe policy', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'yolo' })).rejects.toThrow(/invalid wipePolicy/);
  });
});

describe('FIX 3 — portable eject NEVER touches the resident keychain', () => {
  it('a records wipe does NOT call clearSalts', async () => {
    const io = makeIO(); const deps = makeDeps();
    await endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM });
    expect(io.clearSalts).not.toHaveBeenCalled();
  });

  it('records_and_salts is no longer a valid policy (removed)', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records_and_salts', ...CONFIRM }))
      .rejects.toThrow(/invalid wipePolicy/);
    expect(io.clearSalts).not.toHaveBeenCalled();
  });

  it('WIPE_POLICIES contains no salt-clearing option', () => {
    expect(WIPE_POLICIES).toEqual(['records', 'none']);
    expect(WIPE_POLICIES).not.toContain('records_and_salts');
  });
});

describe('guards', () => {
  it('requires a passphrase on both ends', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(beginPortableSession('', io, deps)).rejects.toThrow(/passphrase/);
    await expect(endPortableSession('', io, deps)).rejects.toThrow(/passphrase/);
  });
});

describe('FIX 1 — destructive wipe requires explicit confirmation', () => {
  it("'records' WITHOUT confirmed throws and does NOT wipe", async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records' }))
      .rejects.toThrow(/requires explicit confirmation/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();
  });
  it("'none' (write-only) does NOT require confirmation", async () => {
    const io = makeIO(); const deps = makeDeps();
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'none' });
    expect(r.wiped).toBe('none');
  });
  it('confirmed must be exactly true (truthy string is not enough)', async () => {
    const io = makeIO(); const deps = makeDeps();
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records', confirmed: 'yes' }))
      .rejects.toThrow(/requires explicit confirmation/i);
  });
});

describe('FIX 2 — restore-verify before wipe', () => {
  it('does NOT wipe if the bundle fails restore verification (bad sig / wrong pw)', async () => {
    const io = makeIO();
    const deps = makeDeps({ verifyBackup: vi.fn(async () => false) }); // bundle does NOT verify
    await expect(endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM }))
      .rejects.toThrow(/failed restore verification|NOT wiped/i);
    expect(deps.nukeStorage).not.toHaveBeenCalled();  // host intact
  });
  it('DOES wipe when the bundle verifies restorable', async () => {
    const io = makeIO();
    const deps = makeDeps({ verifyBackup: vi.fn(async () => true) });
    const r = await endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM });
    expect(r.wiped).toBe('records');
    expect(deps.verifyBackup).toHaveBeenCalled();      // verify was actually run
    expect(deps.nukeStorage).toHaveBeenCalledOnce();
  });
  it('verify runs on the READ-BACK bundle (what is actually on the USB)', async () => {
    const io = makeIO();
    const written = bundleOf(['r1', 'r2']);
    io.readBack = vi.fn(async () => written);
    const deps = makeDeps({ createBackup: vi.fn(async () => written), verifyBackup: vi.fn(async () => true) });
    await endPortableSession('pw', io, deps, { wipePolicy: 'records', ...CONFIRM });
    expect(deps.verifyBackup).toHaveBeenCalledWith('pw', written);
  });
});
