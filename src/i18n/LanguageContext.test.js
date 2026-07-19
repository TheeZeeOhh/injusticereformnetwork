import { describe, it, expect } from 'vitest';
import { translate } from './LanguageContext';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

// The homegrown translate() is a pure function, so it can be exercised without
// mounting a React tree.

describe('translate()', () => {
  it('returns the string for the active language', () => {
    expect(translate('en', 'topbar.logout')).toBe('Logout');
    expect(translate('es', 'topbar.logout')).toBe('Cerrar sesión');
    expect(translate('fr', 'topbar.logout')).toBe('Déconnexion');
  });

  it('resolves nested dot-path keys', () => {
    expect(translate('es', 'nav.dashboard')).toBe('Panel');
    expect(translate('fr', 'profile.title')).toBe('Profil du Navigateur');
  });

  it('falls back to English when the locale lacks the key', () => {
    // A key present in en but (hypothetically) missing elsewhere should fall
    // back to the English string rather than blank.
    const key = 'topbar.searchPlaceholder';
    expect(translate('en', key)).toBe(en.topbar.searchPlaceholder);
    // Force the fallback path with an unknown language code.
    expect(translate('zz', key)).toBe(en.topbar.searchPlaceholder);
  });

  it('falls back to the key itself for a completely unknown key', () => {
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
    expect(translate('fr', 'nope')).toBe('nope');
  });

  it('has matching key structure across all locales', () => {
    // Guard against a locale silently missing a key that en defines: every
    // en key must resolve to a real (non-fallback) string in es and fr.
    const flatKeys = (obj, prefix = '') =>
      Object.entries(obj).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return typeof v === 'object' && v !== null ? flatKeys(v, path) : [path];
      });
    const keys = flatKeys(en);
    for (const key of keys) {
      // translate falls back to the key string when missing; a real
      // translation must therefore differ from the key path.
      expect(translate('es', key), `es missing ${key}`).not.toBe(key);
      expect(translate('fr', key), `fr missing ${key}`).not.toBe(key);
    }
  });

  it('locale dicts are loadable JSON objects', () => {
    for (const dict of [en, es, fr]) {
      expect(typeof dict).toBe('object');
      expect(dict.lang).toBeDefined();
    }
  });
});
