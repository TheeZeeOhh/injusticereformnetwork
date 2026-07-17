import { create } from 'zustand';

// Non-sensitive UI preferences. These are NOT PHI and carry no vault key, so
// they persist in localStorage rather than the encrypted IndexedDB vault.
const STORAGE_KEY = 'sanctuary_ui_settings';

// The original hardcoded ticker messages, now the editable default.
const DEFAULT_TICKER = {
  enabled: true,
  speed: 20, // seconds for one full scroll cycle; lower = faster
  messages: [
    '🚨 [Predictive Interrupter] High-Tension Alert: Crisis detected!',
    '🛡️ [Policy Sentinel] 2026 Civil Monetary Penalty adjustments detected.',
    '🧠 [Clinical Co-Pilot] Clinical Alert: Record flagged for triage!',
    '🔥 [Ember Fund] New revenue swept to Sovereignty Fund.',
  ],
};

// Self-hosted Jitsi telehealth. Empty by default ON PURPOSE: there is no public
// fallback. If no domain is configured, Telehealth refuses to start a call
// rather than silently routing PHI through meet.jit.si (which is not BAA-covered
// and runs analytics).
const DEFAULT_JITSI = { domain: '' };

// Normalize operator input to a bare host (no scheme, path, or trailing slash),
// so the iframe origin is exactly the configured server and cannot be steered
// elsewhere. Returns '' for anything that isn't a plausible hostname.
export function normalizeJitsiDomain(input) {
  let v = (input || '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, ''); // drop scheme
  v = v.split('/')[0]; // drop any path
  v = v.replace(/\/+$/, ''); // drop trailing slashes
  // Host chars only: letters, digits, dot, hyphen, optional :port.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(v)) return '';
  return v.toLowerCase();
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ticker: DEFAULT_TICKER, jitsi: DEFAULT_JITSI };
    const parsed = JSON.parse(raw);
    // Merge so newly-added defaults survive an older persisted blob.
    return {
      ticker: {
        ...DEFAULT_TICKER,
        ...(parsed.ticker || {}),
        messages: Array.isArray(parsed.ticker?.messages)
          ? parsed.ticker.messages
          : DEFAULT_TICKER.messages,
      },
      jitsi: {
        ...DEFAULT_JITSI,
        domain: normalizeJitsiDomain(parsed.jitsi?.domain),
      },
    };
  } catch {
    return { ticker: DEFAULT_TICKER, jitsi: DEFAULT_JITSI };
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ticker: state.ticker, jitsi: state.jitsi }));
  } catch (err) {
    console.warn('Failed to persist UI settings:', err);
  }
}

export const useSettingsStore = create((set, get) => ({
  ...loadPersisted(),

  setTickerEnabled: (enabled) => {
    set((s) => ({ ticker: { ...s.ticker, enabled } }));
    persist(get());
  },

  setTickerSpeed: (speed) => {
    // Clamp to a sane range so the marquee can't be frozen or seizure-fast.
    const clamped = Math.min(120, Math.max(5, Number(speed) || DEFAULT_TICKER.speed));
    set((s) => ({ ticker: { ...s.ticker, speed: clamped } }));
    persist(get());
  },

  setTickerMessages: (messages) => {
    set((s) => ({ ticker: { ...s.ticker, messages } }));
    persist(get());
  },

  resetTicker: () => {
    set({ ticker: DEFAULT_TICKER });
    persist(get());
  },

  // Set the self-hosted Jitsi domain (normalized to a bare host). Passing an
  // invalid value clears it, which disables telehealth rather than routing
  // anywhere unsafe.
  setJitsiDomain: (domain) => {
    set((s) => ({ jitsi: { ...s.jitsi, domain: normalizeJitsiDomain(domain) } }));
    persist(get());
  },
}));
