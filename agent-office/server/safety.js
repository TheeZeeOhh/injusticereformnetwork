/**
 * safety.js — the local-only invariants, in one place.
 *
 * This MVP deliberately drops every remote/egress surface the upstream harness
 * has (public webhook tunnels, Slack, third-party voice, telemetry). The guards
 * below make that structural rather than a promise: the server refuses to bind a
 * non-loopback address, and each agent run is bounded by a wall-clock and output
 * cap so a runaway (or an injected) agent can't burn unbounded time/tokens.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Throw unless `host` is a loopback address. Called before the server listens. */
export function assertLoopbackHost(host) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `agent-office is local-only: refusing to bind non-loopback host "${host}". ` +
        `Allowed: ${[...LOOPBACK_HOSTS].join(', ')}.`
    );
  }
  return host;
}

/** Reject config that smuggles in the remote surfaces this MVP intentionally omits. */
export function assertNoRemoteSurface(config) {
  const banned = ['webhook', 'webhooks', 'tunnel', 'slack', 'telemetry', 'trigger', 'triggers'];
  const present = banned.filter((k) => k in (config ?? {}));
  if (present.length) {
    throw new Error(
      `agent-office refuses remote-surface config keys: ${present.join(', ')}. ` +
        `This build is local-only by design.`
    );
  }
}

export const DEFAULT_CAPS = Object.freeze({
  /** Kill an agent run after this many ms of wall-clock. */
  maxRuntimeMs: 5 * 60 * 1000,
  /** Kill an agent run once it has emitted this many bytes of output. */
  maxOutputBytes: 2_000_000,
});

/**
 * Substitute `{token}` placeholders in a provider arg. Values are inserted as
 * literal argv strings (spawn is called WITHOUT a shell), so there is no shell
 * interpolation and nothing in `vars` can break out into a new command.
 */
export function fillTemplate(arg, vars) {
  return String(arg).replace(/\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}
