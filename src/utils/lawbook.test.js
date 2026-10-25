/**
 * IRN Lawbook — the citations we publish must match the official code.
 *
 * lawbook/build.py fetches every section from the official source and caches
 * the text. This test re-checks that cache on its own terms instead of trusting
 * the builder's verdict: each entry's `check` words must appear in the official
 * text, the text must be the one the builder hashed, and the published site must
 * be built from the current data. It runs offline; refreshing the cache against
 * the live sources is `python3 lawbook/build.py --refresh`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../lawbook/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const db = JSON.parse(read('data/laws.json'));
const verified = JSON.parse(read('data/verified.json'));
const text = (id) => JSON.parse(read(`data/text/${id}.json`));

// Same normalisation as build.py: case, dash variants, curly quotes, whitespace.
const norm = (s) => s.toLowerCase()
  .replace(/[‐-—]/g, '-')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ');

const OFFICIAL = {
  VA: 'https://law.lis.virginia.gov/',
  MD: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?',
  US: 'https://www.law.cornell.edu/',
};

describe('lawbook data', () => {
  it('has unique ids, known topics and something to check for every entry', () => {
    const topics = new Set(db.topics.map((t) => t.id));
    const ids = db.laws.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of db.laws) {
      expect(['VA', 'MD', 'US'], l.id).toContain(l.j);
      expect(l.topics.length, l.id).toBeGreaterThan(0);
      for (const t of l.topics) expect(topics.has(t), `${l.id} topic ${t}`).toBe(true);
      expect(l.check.length, l.id).toBeGreaterThan(0);
      expect(l.summary.length, l.id).toBeGreaterThan(30);
    }
  });

  it('covers LGBTQ+ law in both states', () => {
    const lgbtq = db.laws.filter((l) => l.topics.includes('lgbtq'));
    expect(lgbtq.filter((l) => l.j === 'VA').length).toBeGreaterThanOrEqual(10);
    expect(lgbtq.filter((l) => l.j === 'MD').length).toBeGreaterThanOrEqual(10);
  });
});

describe('every citation against the cached official text', () => {
  for (const l of db.laws) {
    it(`${l.id}`, () => {
      expect(existsSync(new URL(`data/text/${l.id}.json`, root)), 'no cached text; run build.py').toBe(true);
      const t = text(l.id);
      // Pending cases are checked against the Court's own docket.
      const official = l.code === 'scotus' ? 'https://www.supremecourt.gov/docket/' : OFFICIAL[l.j];
      expect(t.url.startsWith(official), t.url).toBe(true);
      const hay = norm(`${t.heading}\n${t.body}`);
      const missing = l.check.filter((w) => !hay.includes(norm(w)));
      expect(missing, `official text lacks: ${missing.join(' | ')}`).toEqual([]);
      expect(/^\W*(repealed|reserved|expired)\b/.test(norm(t.body.slice(0, 60))), 'section is repealed').toBe(false);
      expect(verified[l.id].status).toBe('ok');
      expect(verified[l.id].sha256).toBe(createHash('sha256').update(t.body).digest('hex'));
    });
  }

  it('would catch a wrong summary (the check is not a no-op)', () => {
    // Virginia allows two ounces; the first draft said one. This is the kind of
    // error the check exists for, so prove it still fires.
    const t = text('va-4.1-1100');
    expect(norm(t.body).includes(norm('not more than one ounce'))).toBe(false);
    expect(norm(t.body).includes(norm('not more than two ounces'))).toBe(true);
  });
});

describe('the published site', () => {
  const site = read('site/index.html');
  const start = site.indexOf('const DATA = ') + 'const DATA = '.length;
  const end = site.indexOf(';\n', start);
  const data = JSON.parse(site.slice(start, end).replace(/<\\\//g, '</'));

  it('is built from the current data', () => {
    expect(data.laws.map((l) => l.id)).toEqual(db.laws.map((l) => l.id));
    const byId = Object.fromEntries(db.laws.map((l) => [l.id, l]));
    for (const l of data.laws) expect(l.summary, l.id).toBe(byId[l.id].summary);
  });

  it('carries the not-legal-advice notice and builds no markup from statute text', () => {
    expect(data.meta.notice).toMatch(/not legal advice/i);
    const script = site.slice(site.lastIndexOf('<script>'));
    expect(script.includes('innerHTML')).toBe(false);
    expect(script.includes('insertAdjacentHTML')).toBe(false);
  });
});
