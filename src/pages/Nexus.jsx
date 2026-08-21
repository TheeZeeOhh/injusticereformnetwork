import React from 'react';
import { Link } from 'react-router-dom';

// IRN Nexus — a unified two-zone launcher. This is PURELY additive navigation:
// it links to routes that already exist elsewhere in the app. It shows NO PHI
// (only static tile labels), touches no crypto/vault/storage engine, and never
// moves data anywhere. Coming-soon tiles are inert (no link, not focusable).
//
// Trust zones:
//  - SECURE ZONE: modules that run behind Sanctuary's crypto boundary (keys in
//    RAM, encrypted at rest). All already routed.
//  - OPERATIONAL ZONE: non-PHI operational modules. Some are not built yet and
//    are shown as "Coming soon" rather than dead links.
//
// Status meanings (honesty over completeness — a tile must not claim to be live
// when it isn't):
//  - 'Live'        : has a working primary route rendering the real module.
//  - 'Partial'     : reachable, but not the full experience the tile name implies
//                    (e.g. Maps has no true map yet), or the component exists only
//                    embedded inside another route (no dedicated route of its own).
//  - 'Coming soon' : not built in this repo; inert, no route.
//
// `to`   — primary route to open (null for Coming soon).
// `more` — secondary routes the tile also fronts (validated to exist by the test).

export const NEXUS_ZONES = [
  {
    id: 'secure',
    title: 'Secure Zone',
    tagline: 'Encrypted at rest · keys in RAM · never leaves the device',
    accent: 'var(--vault-a)',
    tiles: [
      {
        emoji: '🗂',
        name: 'Cases',
        desc: 'Client records and case reporting',
        status: 'Live',
        to: '/clients',
        more: ['/case-report'],
      },
      {
        emoji: '📂',
        name: 'Document Vault',
        desc: 'Evidence vault and document library',
        status: 'Live',
        to: '/evidence',
        more: ['/docs'],
      },
      {
        emoji: '💬',
        name: 'Communications',
        desc: 'Secure messaging and telehealth',
        status: 'Live',
        to: '/messages',
        more: ['/telehealth'],
      },
      {
        emoji: '👥',
        name: 'Volunteers',
        desc: 'Staffing pipeline, shifts, schedule, stipends',
        status: 'Live',
        to: '/staffing',
        more: ['/shifts', '/schedule', '/stipends'],
      },
      {
        emoji: '⚖',
        name: 'Legal Research',
        desc: 'Attorney directory, FOIA, referrals',
        status: 'Live',
        to: '/attorneys',
        more: ['/foia', '/referrals'],
      },
      {
        emoji: '📍',
        name: 'Maps',
        desc: 'Transport and resource navigator (no true map yet)',
        status: 'Partial',
        to: '/transport',
        more: ['/resources'],
      },
    ],
  },
  {
    id: 'ops',
    title: 'Operational Zone',
    tagline: 'No PHI · operational data only',
    accent: 'var(--ember)',
    tiles: [
      {
        emoji: '📰',
        name: 'Intelligence',
        desc: 'Situational intelligence layer',
        status: 'Live',
        to: '/intelligence',
      },
      {
        emoji: '📊',
        name: 'Dashboards',
        desc: 'Home dashboard and on-call board',
        status: 'Live',
        to: '/',
        more: ['/oncall'],
      },
      {
        emoji: '🤖',
        name: 'AI Agents',
        desc: 'Amina assistant — embedded in Resource Navigator (no standalone route)',
        status: 'Partial',
        to: '/resources',
      },
      {
        emoji: '📅',
        name: 'Calendar',
        desc: 'Shift and appointment schedule',
        status: 'Live',
        to: '/schedule',
      },
      {
        emoji: '🛰',
        name: 'Live Alerts',
        desc: 'Clinical alerts — embedded on the dashboard (no standalone route)',
        status: 'Partial',
        to: '/',
      },
      {
        emoji: '📄',
        name: 'Grants',
        desc: 'Grant Studio — separate ops tool, not in this app yet',
        status: 'Coming soon',
        to: null,
      },
      {
        emoji: '🗳',
        name: 'Campaigns',
        desc: 'Advocacy campaign management',
        status: 'Coming soon',
        to: null,
      },
      {
        emoji: '💰',
        name: 'Fundraising',
        desc: 'Donor and fundraising operations',
        status: 'Coming soon',
        to: null,
      },
    ],
  },
];

const PILL_STYLES = {
  Live: { bg: 'var(--gold-dim)', color: 'var(--gold)', border: 'var(--gold)' },
  Partial: { bg: 'var(--ember-dim)', color: 'var(--ember)', border: 'var(--ember)' },
  'Coming soon': { bg: 'transparent', color: 'var(--text-tertiary)', border: 'var(--border-color)' },
};

function StatusPill({ status }) {
  const s = PILL_STYLES[status] || PILL_STYLES['Coming soon'];
  return (
    <span
      className="nexus-pill"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {status}
    </span>
  );
}

function TileBody({ tile }) {
  return (
    <>
      <div className="nexus-tile-top">
        <span className="nexus-tile-emoji" aria-hidden="true">{tile.emoji}</span>
        <StatusPill status={tile.status} />
      </div>
      <div className="nexus-tile-name">{tile.name}</div>
      <div className="nexus-tile-desc">{tile.desc}</div>
    </>
  );
}

function Tile({ tile, accent }) {
  const style = { borderTopColor: accent };

  // Coming-soon tiles are inert: a plain, non-focusable element with no href so
  // they can never be a dead link the keyboard/mouse can follow.
  if (!tile.to) {
    return (
      <div
        className="nexus-tile nexus-tile--disabled glass-panel"
        style={style}
        aria-disabled="true"
      >
        <TileBody tile={tile} />
      </div>
    );
  }

  return (
    <Link
      to={tile.to}
      className="nexus-tile glass-panel"
      style={style}
      aria-label={`${tile.name} — ${tile.status}`}
    >
      <TileBody tile={tile} />
    </Link>
  );
}

export default function Nexus() {
  return (
    <div className="dashboard nexus">
      <div className="dashboard-header">
        <h1>IRN Nexus</h1>
        <p>One desktop for every IRN module, organized by trust zone.</p>
      </div>

      {NEXUS_ZONES.map((zone) => (
        <section key={zone.id} className="nexus-zone" aria-labelledby={`nexus-zone-${zone.id}`}>
          <div className="nexus-zone-header" style={{ borderLeftColor: zone.accent }}>
            <h2 id={`nexus-zone-${zone.id}`}>{zone.title}</h2>
            <p>{zone.tagline}</p>
          </div>
          <div className="nexus-grid">
            {zone.tiles.map((tile) => (
              <Tile key={tile.name} tile={tile} accent={zone.accent} />
            ))}
          </div>
        </section>
      ))}

      <style>{`
        .nexus-zone { margin-bottom: 2.5rem; }
        .nexus-zone-header {
          border-left: 3px solid var(--gold);
          padding-left: 0.9rem;
          margin-bottom: 1.25rem;
        }
        .nexus-zone-header h2 {
          font-size: 1.1rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--bone);
        }
        .nexus-zone-header p {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .nexus-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1.25rem;
        }
        .nexus-tile {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding: 1.25rem;
          border-top: 2px solid var(--gold);
          text-decoration: none;
          color: inherit;
          transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
        }
        .nexus-tile:hover { transform: translateY(-3px); border-color: var(--gold); }
        .nexus-tile:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }
        .nexus-tile--disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .nexus-tile--disabled:hover { transform: none; }
        .nexus-tile-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nexus-tile-emoji { font-size: 1.75rem; line-height: 1; }
        .nexus-tile-name {
          font-size: 1rem;
          font-weight: 600;
          color: var(--bone);
        }
        .nexus-tile-desc {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .nexus-pill {
          font-family: var(--font-mono);
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          .nexus-tile { transition: none; }
          .nexus-tile:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}
