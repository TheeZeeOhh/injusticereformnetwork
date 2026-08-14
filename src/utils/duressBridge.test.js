import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Tauri core module so we can assert the wipe command is invoked.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn(() => Promise.resolve('ok')) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { triggerDuressWipe } from './duressBridge';

describe('triggerDuressWipe (duressBridge)', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    delete globalThis.window.__TAURI_INTERNALS__;
  });
  afterEach(() => {
    delete globalThis.window.__TAURI_INTERNALS__;
  });

  it('is a no-op off Tauri (no invoke)', async () => {
    await triggerDuressWipe();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes the Rust wipe command on Tauri', async () => {
    globalThis.window.__TAURI_INTERNALS__ = {};
    await triggerDuressWipe();
    expect(invokeMock).toHaveBeenCalledWith('trigger_duress_wipe');
  });

  it('never throws even if the command rejects', async () => {
    globalThis.window.__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValueOnce(new Error('not IRN OS'));
    await expect(triggerDuressWipe()).resolves.toBeUndefined();
  });
});
