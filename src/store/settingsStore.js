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

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ticker: DEFAULT_TICKER };
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
    };
  } catch {
    return { ticker: DEFAULT_TICKER };
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ticker: state.ticker }));
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
}));
