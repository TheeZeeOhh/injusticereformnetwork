// Pure helpers for the telehealth client-share link. Kept out of Telehealth.jsx
// so that component file exports only the component (React fast-refresh works
// cleanly when a module doesn't mix component and non-component exports).

// Build the CLEAN join URL to hand to a client on their own device. This is
// deliberately NOT the same string as the embedded-iframe callUrl: it omits the
// `#config.*` fragment (those flags — disabled prejoin, deep-linking — are for
// OUR sandboxed iframe; a client on a normal browser wants Jitsi's standard
// prejoin mic/cam check). Returns '' when no self-hosted domain is configured,
// so there is never a link that could route to a public/unconfigured server.
// domain is assumed already sanitized by normalizeJitsiDomain (bare host).
// The room is percent-encoded so it cannot alter the path or origin.
export function buildClientJoinUrl(domain, room) {
  if (!domain) return '';
  return `https://${domain}/${encodeURIComponent(room)}`;
}

// A random, unguessable room token. The room name IS the access control on a
// bare self-hosted Jitsi (no per-room password by default), so a sequential
// default like "Sanctuary-Intake-492" is guessable — anyone could walk into an
// active session. This produces "Sanctuary-<10 hex>" from a CSPRNG.
export function randomRoomName() {
  const bytes = new Uint8Array(5);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `Sanctuary-${hex}`;
}
