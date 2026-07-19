import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';

// Covers the additions for profile-photo persistence and UI language, both of
// which round-trip through the same non-PHI localStorage blob as the ticker /
// jitsi prefs. These are NOT client PHI and deliberately never touch the vault.

const STORAGE_KEY = 'sanctuary_ui_settings';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// A tiny valid image data URL.
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

beforeEach(() => {
  installLocalStorage();
  // Reset store to defaults for isolation.
  useSettingsStore.setState({
    profile: { photo: '' },
    locale: { lang: 'en' },
    theme: { mode: 'dark' },
  });
});

describe('profile photo persistence', () => {
  it('stores an image data URL and persists it to localStorage', () => {
    const ok = useSettingsStore.getState().setProfilePhoto(IMG);
    expect(ok).toBe(true);
    expect(useSettingsStore.getState().profile.photo).toBe(IMG);

    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(blob.profile.photo).toBe(IMG);
  });

  it('rejects a non-image string without corrupting state', () => {
    useSettingsStore.getState().setProfilePhoto(IMG);
    const ok = useSettingsStore.getState().setProfilePhoto('not-an-image');
    expect(ok).toBe(false);
    // Previous valid photo is untouched.
    expect(useSettingsStore.getState().profile.photo).toBe(IMG);
  });

  it('rejects an oversized data URL', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024);
    const ok = useSettingsStore.getState().setProfilePhoto(huge);
    expect(ok).toBe(false);
    expect(useSettingsStore.getState().profile.photo).toBe('');
  });

  it('clears the photo when passed an empty string', () => {
    useSettingsStore.getState().setProfilePhoto(IMG);
    const ok = useSettingsStore.getState().setProfilePhoto('');
    expect(ok).toBe(true);
    expect(useSettingsStore.getState().profile.photo).toBe('');
    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(blob.profile.photo).toBe('');
  });
});

describe('UI language persistence', () => {
  it('switches to a supported language and persists it', () => {
    useSettingsStore.getState().setLang('es');
    expect(useSettingsStore.getState().locale.lang).toBe('es');
    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(blob.locale.lang).toBe('es');
  });

  it('ignores an unsupported language code', () => {
    useSettingsStore.getState().setLang('fr');
    useSettingsStore.getState().setLang('klingon');
    // Stays on the last valid selection.
    expect(useSettingsStore.getState().locale.lang).toBe('fr');
  });
});

describe('UI theme persistence', () => {
  it('switches to light and persists it', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme.mode).toBe('light');
    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(blob.theme.mode).toBe('light');
  });

  it('ignores an unsupported theme value', () => {
    useSettingsStore.getState().setTheme('light');
    useSettingsStore.getState().setTheme('neon');
    expect(useSettingsStore.getState().theme.mode).toBe('light');
  });
});
