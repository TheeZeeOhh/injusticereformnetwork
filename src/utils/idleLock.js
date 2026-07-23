// idleLock.js
//
// Inactivity auto-lock (HIPAA §164.312(a)(2)(iii) automatic logoff). After a
// period of no operator activity, the vault is locked: keys are dropped from RAM
// via the app's existing logout(), so a caseworker who walks away from an
// unlocked machine does not leave PHI accessible. This complements the USB
// dead-man's switch (which requires an armed token) with a software fallback that
// is always on.
//
// The core is a pure, testable timer manager (no React, injectable clock). The
// React binding is a thin wrapper (see useIdleLock) that attaches activity
// listeners and calls onIdle -> logout.

export const DEFAULT_IDLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create an idle timer. `onIdle` fires once when `idleMs` elapses with no
 * bump(). Call bump() on any activity to reset. Injectable timer functions make
 * it deterministically testable.
 *
 * @param {() => void} onIdle
 * @param {{ idleMs?: number, setTimer?: Function, clearTimer?: Function }} [opts]
 */
export function createIdleTimer(onIdle, opts = {}) {
  const idleMs = Number.isFinite(opts.idleMs) && opts.idleMs > 0 ? opts.idleMs : DEFAULT_IDLE_MS;
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;

  let handle = null;
  let stopped = false;
  let fired = false;

  function bump() {
    if (stopped) return;
    if (handle != null) clearTimer(handle);
    fired = false;
    handle = setTimer(() => {
      if (stopped || fired) return;
      fired = true;
      onIdle();
    }, idleMs);
  }

  function stop() {
    stopped = true;
    if (handle != null) { clearTimer(handle); handle = null; }
  }

  // start armed
  bump();

  return {
    bump,
    stop,
    get idleMs() { return idleMs; },
    _fired: () => fired,
  };
}
