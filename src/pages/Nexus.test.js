import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Nexus, { NEXUS_ZONES } from './Nexus';

// The repo tests run in a node environment (no jsdom), so we render the
// component to a static HTML string via react-dom/server and assert against the
// markup. Route validity is checked against the actual App.jsx source so a tile
// can never silently point at a route that no longer exists.

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(here, '..', 'App.jsx'), 'utf8');

// Every `path="..."` declared inside App.jsx's <Routes>.
const declaredRoutes = new Set(
  [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
);

function render() {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(Nexus))
  );
}

describe('Nexus launcher', () => {
  it('renders without throwing', () => {
    const html = render();
    expect(html).toContain('IRN Nexus');
  });

  it('shows both zone headers', () => {
    const html = render();
    expect(html).toContain('Secure Zone');
    expect(html).toContain('Operational Zone');
  });

  it('defines exactly two zones with 14 tiles total', () => {
    expect(NEXUS_ZONES).toHaveLength(2);
    const total = NEXUS_ZONES.reduce((n, z) => n + z.tiles.length, 0);
    expect(total).toBe(14);
  });

  it('every routed tile points at a route that exists in App.jsx', () => {
    for (const zone of NEXUS_ZONES) {
      for (const tile of zone.tiles) {
        if (!tile.to) continue; // coming-soon tiles have no route
        expect(
          declaredRoutes.has(tile.to),
          `tile "${tile.name}" primary route ${tile.to} missing from App.jsx`
        ).toBe(true);
        for (const extra of tile.more || []) {
          expect(
            declaredRoutes.has(extra),
            `tile "${tile.name}" secondary route ${extra} missing from App.jsx`
          ).toBe(true);
        }
      }
    }
  });

  it('the /nexus route itself is wired in App.jsx', () => {
    expect(declaredRoutes.has('/nexus')).toBe(true);
  });

  it('coming-soon tiles have no route and render disabled (no href)', () => {
    const comingSoon = NEXUS_ZONES.flatMap((z) => z.tiles).filter(
      (t) => t.status === 'Coming soon'
    );
    expect(comingSoon.length).toBeGreaterThan(0);
    for (const tile of comingSoon) {
      expect(tile.to).toBeNull();
    }

    const html = render();
    // Grants/Campaigns/Fundraising must render as disabled, non-link elements.
    for (const tile of comingSoon) {
      expect(html).toContain(tile.name);
    }
    // No coming-soon label should sit inside an anchor tag.
    for (const tile of comingSoon) {
      const anchorWithName = new RegExp(`<a[^>]*>(?:(?!</a>).)*${tile.name}`, 's');
      expect(anchorWithName.test(html)).toBe(false);
    }
    expect(html).toContain('aria-disabled="true"');
  });

  it('live tiles render as anchors with an href', () => {
    const html = render();
    const live = NEXUS_ZONES.flatMap((z) => z.tiles).filter((t) => t.status === 'Live');
    for (const tile of live) {
      // Each live tile name should appear inside an anchor element.
      const anchorWithName = new RegExp(`<a[^>]*href="[^"]*"[^>]*>(?:(?!</a>).)*${tile.name}`, 's');
      expect(anchorWithName.test(html), `live tile "${tile.name}" is not a link`).toBe(true);
    }
  });
});
