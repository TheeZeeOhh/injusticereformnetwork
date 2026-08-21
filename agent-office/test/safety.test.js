import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLoopbackHost,
  assertNoRemoteSurface,
  fillTemplate,
  DEFAULT_CAPS,
} from '../server/safety.js';

test('assertLoopbackHost accepts loopback', () => {
  for (const h of ['127.0.0.1', 'localhost', '::1']) {
    assert.equal(assertLoopbackHost(h), h);
  }
});

test('assertLoopbackHost rejects non-loopback', () => {
  for (const h of ['0.0.0.0', '192.168.1.5', 'example.com']) {
    assert.throws(() => assertLoopbackHost(h), /local-only/);
  }
});

test('assertNoRemoteSurface rejects banned config keys', () => {
  assert.throws(() => assertNoRemoteSurface({ webhook: {} }), /webhook/);
  assert.throws(() => assertNoRemoteSurface({ slack: {}, tunnel: 1 }), /slack|tunnel/);
  assert.doesNotThrow(() => assertNoRemoteSurface({ providers: {}, agents: [] }));
});

test('fillTemplate substitutes known tokens only, no shell breakout risk', () => {
  assert.equal(fillTemplate('hi {name}', { name: 'jim' }), 'hi jim');
  assert.equal(fillTemplate('{unknown}', {}), '{unknown}');
  // value is returned literally; it is the caller's job to pass it as an argv element
  assert.equal(fillTemplate('{p}', { p: 'a"; rm -rf /' }), 'a"; rm -rf /');
});

test('caps are sane defaults', () => {
  assert.ok(DEFAULT_CAPS.maxRuntimeMs >= 60_000);
  assert.ok(DEFAULT_CAPS.maxOutputBytes >= 100_000);
});
