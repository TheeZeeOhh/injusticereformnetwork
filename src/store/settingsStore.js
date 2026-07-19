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

// Operator profile photo. This is the OPERATOR's own avatar — not client PHI —
// so it lives here as a base64 data URL rather than in the encrypted vault.
const DEFAULT_PROFILE = { photo: '' };

// UI language. Non-sensitive preference; persists with the other UI prefs.
const SUPPORTED_LANGS = ['en', 'es', 'fr'];
const DEFAULT_LOCALE = { lang: 'en' };

// UI theme. Dark is the original/default look; light is a token remap.
const SUPPORTED_THEMES = ['dark', 'light'];
const DEFAULT_THEME = { mode: 'dark' };

// Cap the avatar so a huge upload can't blow out the ~5MB localStorage quota.
// The UI advertises "Max 5MB"; a base64 data URL is ~4/3 the raw bytes, so
// allow a little headroom and reject anything larger.
const MAX_PHOTO_CHARS = 7 * 1024 * 1024;

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

// Coerce a persisted photo value into a safe string: only accept an image data
// URL under the size cap, otherwise fall back to empty.
function normalizePhoto(value) {
  if (typeof value !== 'string') return '';
  if (!value.startsWith('data:image/')) return '';
  if (value.length > MAX_PHOTO_CHARS) return '';
  return value;
}

// Coerce a persisted language into a supported code, else the default.
function normalizeLang(value) {
  return SUPPORTED_LANGS.includes(value) ? value : DEFAULT_LOCALE.lang;
}

// Coerce a persisted theme into a supported mode, else the default.
function normalizeTheme(value) {
  return SUPPORTED_THEMES.includes(value) ? value : DEFAULT_THEME.mode;
}

function defaults() {
  return {
    ticker: DEFAULT_TICKER,
    jitsi: DEFAULT_JITSI,
    profile: DEFAULT_PROFILE,
    locale: DEFAULT_LOCALE,
    theme: DEFAULT_THEME,
  };
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
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
      profile: {
        ...DEFAULT_PROFILE,
        photo: normalizePhoto(parsed.profile?.photo),
      },
      locale: {
        ...DEFAULT_LOCALE,
        lang: normalizeLang(parsed.locale?.lang),
      },
      theme: {
        ...DEFAULT_THEME,
        mode: normalizeTheme(parsed.theme?.mode),
      },
    };
  } catch {
    return defaults();
  }
}

function persist(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ticker: state.ticker,
        jitsi: state.jitsi,
        profile: state.profile,
        locale: state.locale,
        theme: state.theme,
      })
    );
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

  // Persist the operator's avatar as a base64 data URL. Rejects non-image or
  // oversized input (returns false) rather than corrupting the stored blob.
  // Pass '' to clear the photo.
  setProfilePhoto: (dataUrl) => {
    if (dataUrl === '') {
      set((s) => ({ profile: { ...s.profile, photo: '' } }));
      persist(get());
      return true;
    }
    const photo = normalizePhoto(dataUrl);
    if (!photo) return false;
    set((s) => ({ profile: { ...s.profile, photo } }));
    persist(get());
    return true;
  },

  // Switch UI language. Ignores unsupported codes (stays on current lang).
  setLang: (lang) => {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    set((s) => ({ locale: { ...s.locale, lang } }));
    persist(get());
  },

  // Switch UI theme (dark/light). Ignores unsupported values.
  setTheme: (mode) => {
    if (!SUPPORTED_THEMES.includes(mode)) return;
    set((s) => ({ theme: { ...s.theme, mode } }));
    persist(get());
  },
}));
