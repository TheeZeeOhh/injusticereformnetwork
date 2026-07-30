import { describe, it, expect } from 'vitest';
import { buildClientJoinUrl, randomRoomName } from './telehealthShare';

// The client join link is the ONE telehealth string that leaves the operator's
// device (sent to a client), so its construction is a boundary worth pinning:
// it must carry no config fragment, never route to an unconfigured server, and
// never let a crafted room name alter the origin/path.
describe('buildClientJoinUrl', () => {
  it('builds a clean https link with no config fragment', () => {
    expect(buildClientJoinUrl('meet.yourorg.org', 'Sanctuary-abc123'))
      .toBe('https://meet.yourorg.org/Sanctuary-abc123');
  });

  it('omits the #config fragment that the in-app iframe uses', () => {
    const url = buildClientJoinUrl('meet.yourorg.org', 'room1');
    expect(url).not.toContain('#');
    expect(url).not.toContain('config.');
  });

  it('returns empty when no domain is configured (no public fallback)', () => {
    expect(buildClientJoinUrl('', 'room1')).toBe('');
    expect(buildClientJoinUrl(undefined, 'room1')).toBe('');
  });

  it('percent-encodes the room so it cannot alter path or origin', () => {
    // A room name trying to inject a path segment or a new host is encoded, not
    // interpreted — the origin stays the configured host.
    const url = buildClientJoinUrl('meet.yourorg.org', '../evil@attacker.com');
    expect(url.startsWith('https://meet.yourorg.org/')).toBe(true);
    expect(url).not.toContain('attacker.com/');
    expect(url).toContain('%2F'); // the slash in "../" is encoded
  });

  it('keeps an explicit port on the host', () => {
    expect(buildClientJoinUrl('meet.yourorg.org:8443', 'r'))
      .toBe('https://meet.yourorg.org:8443/r');
  });
});

describe('randomRoomName', () => {
  it('produces a Sanctuary-prefixed 10-hex token', () => {
    const r = randomRoomName();
    expect(r).toMatch(/^Sanctuary-[0-9a-f]{10}$/);
  });

  it('is unguessable — 100 draws are all distinct', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(randomRoomName());
    expect(seen.size).toBe(100);
  });
});
