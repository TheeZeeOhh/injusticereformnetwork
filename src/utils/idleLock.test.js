import { describe, it, expect, vi } from 'vitest';
import { createIdleTimer, DEFAULT_IDLE_MS } from './idleLock';

// Deterministic fake clock: capture the scheduled callback so we can fire it.
function fakeClock() {
  let cb = null; let delay = null;
  return {
    setTimer: (fn, ms) => { cb = fn; delay = ms; return 1; },
    clearTimer: () => { cb = null; },
    fire: () => { if (cb) cb(); },
    get delay() { return delay; },
    get armed() { return cb !== null; },
  };
}

describe('createIdleTimer', () => {
  it('fires onIdle after the idle period with no activity', () => {
    const onIdle = vi.fn();
    const clk = fakeClock();
    createIdleTimer(onIdle, { idleMs: 1000, setTimer: clk.setTimer, clearTimer: clk.clearTimer });
    expect(clk.delay).toBe(1000);
    expect(onIdle).not.toHaveBeenCalled();
    clk.fire();
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('bump() resets the timer (activity prevents lock)', () => {
    const onIdle = vi.fn();
    const clk = fakeClock();
    const t = createIdleTimer(onIdle, { idleMs: 1000, setTimer: clk.setTimer, clearTimer: clk.clearTimer });
    t.bump();          // activity
    t.bump();          // more activity
    expect(onIdle).not.toHaveBeenCalled();
    clk.fire();        // now the (latest) timer elapses
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('stop() disarms — no lock after stop even if the timer fires', () => {
    const onIdle = vi.fn();
    const clk = fakeClock();
    const t = createIdleTimer(onIdle, { idleMs: 1000, setTimer: clk.setTimer, clearTimer: clk.clearTimer });
    t.stop();
    clk.fire();        // stale fire
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('fires onIdle at most once', () => {
    const onIdle = vi.fn();
    const clk = fakeClock();
    createIdleTimer(onIdle, { idleMs: 1000, setTimer: clk.setTimer, clearTimer: clk.clearTimer });
    clk.fire();
    clk.fire();        // second fire should be ignored
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('bump after firing does not re-fire without a fresh timer elapse', () => {
    const onIdle = vi.fn();
    const clk = fakeClock();
    const t = createIdleTimer(onIdle, { idleMs: 1000, setTimer: clk.setTimer, clearTimer: clk.clearTimer });
    clk.fire();                       // locked (1 call)
    expect(onIdle).toHaveBeenCalledOnce();
    t.bump();                         // re-arms
    expect(onIdle).toHaveBeenCalledOnce(); // not yet again
    clk.fire();                       // elapses again
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('defaults to 5 minutes when no idleMs given', () => {
    const t = createIdleTimer(() => {}, { setTimer: () => 1, clearTimer: () => {} });
    expect(t.idleMs).toBe(DEFAULT_IDLE_MS);
    expect(DEFAULT_IDLE_MS).toBe(300000);
  });

  it('ignores non-positive idleMs and uses the default', () => {
    const t = createIdleTimer(() => {}, { idleMs: 0, setTimer: () => 1, clearTimer: () => {} });
    expect(t.idleMs).toBe(DEFAULT_IDLE_MS);
  });
});
