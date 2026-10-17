#!/usr/bin/env node
// CSP runtime gauntlet.
//
// Serves the production build (dist/) under the exact CSP declared in
// src-tauri/tauri.conf.json, drives it in headless Chromium over CDP, and
// checks the two things a unit test cannot:
//
//   1. The CSP holds at runtime without breaking the app (no violations, no
//      uncaught errors, every route renders).
//   2. "No plaintext leaves the device": a canary PHI string typed into a
//      client record never appears in any outbound request, WebSocket frame,
//      or plaintext at rest (localStorage / sessionStorage / IndexedDB).
//
// This is a browser proxy for the Tauri webview (WebKitGTK), not the webview
// itself: it proves the policy and the data paths, not the kiosk boot.
//
// Usage: npm run build && node scripts/csp-gauntlet.mjs [--keep] [--self-test]
// Exit code 0 = pass, 1 = findings, 2 = harness failure.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const KEEP = process.argv.includes('--keep');
// --self-test plants a deliberate plaintext leak (at rest + in transit) and
// must FAIL; it proves the detectors can fire, so a clean run means something.
const SELF_TEST = process.argv.includes('--self-test');
const CHROME = process.env.CHROME_BIN || ['/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser'].find(existsSync);

const CANARY = `ZQXCANARY${randomBytes(6).toString('hex')}`;
const PASSPHRASE = `gauntlet-${randomBytes(12).toString('hex')}-Orchid-Lantern-Ferry`;
const ROLE = 'Systems Admin'; // widest route access

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(`HARNESS FAILURE: ${msg}`); process.exit(2); };

// ---------------------------------------------------------------- policy
const tauriConf = JSON.parse(await readFile(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
const CSP = tauriConf.app?.security?.csp;
if (!CSP) die('no app.security.csp in tauri.conf.json');
if (!existsSync(join(DIST, 'index.html'))) die('dist/index.html missing - run npm run build');
if (!CHROME) die('no chromium found (set CHROME_BIN)');

const routes = [...(await readFile(join(ROOT, 'src/App.jsx'), 'utf8')).matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

// ---------------------------------------------------------------- server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.onnx': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || path.endsWith('/')) file = join(DIST, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- chromium
const profile = await mkdtemp(join(tmpdir(), 'csp-gauntlet-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
  '--disable-component-update', '--disable-sync',
  ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  chrome.on('exit', (c) => rej(new Error(`chromium exited ${c}: ${buf.slice(-400)}`)));
  setTimeout(() => rej(new Error('chromium did not start')), 15000);
}).catch((e) => die(e.message));
const port = new URL(wsUrl).port;
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map();
const handlers = {};
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method && handlers[msg.method]) handlers[msg.method](msg.params);
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

// ---------------------------------------------------------------- observers
let currentRoute = '(boot)';
const requests = [];          // every request the page made
const wsFrames = [];          // outbound websocket frames
const violations = [];        // CSP violations
const errors = [];            // uncaught exceptions + console errors
const routeResults = [];

handlers['Network.requestWillBeSent'] = ({ requestId, request }) => {
  requests.push({ requestId, route: currentRoute, method: request.method, url: request.url, postData: request.postData || '', hasPostData: !!request.hasPostData });
};
handlers['Network.webSocketCreated'] = ({ url }) => requests.push({ route: currentRoute, method: 'WS', url, postData: '' });
handlers['Network.webSocketFrameSent'] = ({ response }) => wsFrames.push({ route: currentRoute, payload: response.payloadData || '' });
handlers['Runtime.exceptionThrown'] = ({ exceptionDetails: d }) => errors.push({ route: currentRoute, kind: 'exception', text: d.exception?.description?.split('\n')[0] || d.text });
handlers['Runtime.consoleAPICalled'] = ({ type, args }) => {
  if (type !== 'error') return;
  const text = args.map((a) => a.value ?? a.description ?? '').join(' ');
  errors.push({ route: currentRoute, kind: 'console', text: text.slice(0, 300) });
};
handlers['Log.entryAdded'] = ({ entry }) => {
  if (entry.level === 'error' && /Content Security Policy|Refused to/i.test(entry.text)) violations.push({ route: currentRoute, source: 'log', text: entry.text.slice(0, 400) });
};
handlers['Audits.issueAdded'] = ({ issue }) => {
  if (issue.code !== 'ContentSecurityPolicyIssue') return;
  const d = issue.details.contentSecurityPolicyIssueDetails;
  const loc = d.sourceCodeLocation ? ` at ${d.sourceCodeLocation.url.replace(ORIGIN, '')}:${d.sourceCodeLocation.lineNumber}:${d.sourceCodeLocation.columnNumber}` : '';
  violations.push({ route: currentRoute, source: 'audit', text: `${d.violatedDirective} blocked ${d.blockedURL || d.contentSecurityPolicyViolationType}${loc}` });
};

await send('Network.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Audits.enable');
await send('Page.enable');
// Runs before page scripts and outside the page CSP.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__cspv = [];
  document.addEventListener('securitypolicyviolation', e => window.__cspv.push(e.violatedDirective + ' <- ' + (e.blockedURI || 'inline')));
  window.confirm = () => true; window.alert = () => {};
` });

// ---------------------------------------------------------------- DOM helpers (run in page)
const HELPERS = `(() => {
  const vis = el => el && el.offsetParent !== null;
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const button = re => [...document.querySelectorAll('button')].find(b => vis(b) && !b.disabled && re.test(b.textContent));
  return { vis, setVal, button };
})()`;
const inPage = (body) => evaluate(`(async () => { const H = ${HELPERS}; ${body} })()`);
const waitFor = async (cond, ms = 15000, label = cond) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await inPage(`return !!(${cond});`).catch(() => false)) return; await sleep(250); }
  throw new Error(`timed out waiting for: ${label}`);
};
const go = async (path) => {
  currentRoute = path;
  await evaluate(`history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate'));`);
};

// ---------------------------------------------------------------- flow
let flowError = null;
let atRest = null;
let canaryRendered = false;
try {
  currentRoute = '/';
  await send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor(`document.querySelector('#root')?.children.length`, 20000, 'app mount');

  // Onboarding: fill name, pick role, tick every box, click Next until Login.
  for (let i = 0; i < 8; i++) {
    if (await inPage(`return !!document.querySelector('input[type=password]');`)) break;
    await inPage(`
      for (const el of document.querySelectorAll('input[type=text]')) if (H.vis(el) && !el.value) H.setVal(el, 'gauntlet-operator');
      for (const s of document.querySelectorAll('select')) if ([...s.options].some(o => o.value === ${JSON.stringify(ROLE)})) H.setVal(s, ${JSON.stringify(ROLE)});
      for (const c of document.querySelectorAll('input[type=checkbox]')) if (H.vis(c) && !c.checked) c.click();
      await new Promise(r => setTimeout(r, 100));
      const b = H.button(/next|continue|begin|finish|complete|enter|start|passphrase|→/i); if (b) b.click();
    `);
    await sleep(1500);
  }
  await waitFor(`document.querySelector('input[type=password]')`, 20000, 'login screen');

  // Enroll Vault A.
  await inPage(`
    const sel = document.querySelector('select'); if (sel) H.setVal(sel, ${JSON.stringify(ROLE)});
    const user = document.querySelector('input[type=text]'); if (!user.value) H.setVal(user, 'gauntlet-operator');
    H.setVal(document.querySelector('input[type=password]'), ${JSON.stringify(PASSPHRASE)});
  `);
  await sleep(500);
  await inPage(`document.querySelector('form button[type=submit]').click();`);
  await waitFor(`document.querySelector('.sidebar')`, 60000, 'unlocked shell (PBKDF2)');

  // Plant the canary in a client record and save it through the crypto engine.
  await go('/clients');
  await waitFor(`H.button(/add new client/i)`, 15000, 'add client button');
  await inPage(`H.button(/add new client/i).click();`);
  await sleep(800);
  await inPage(`
    const content = document.querySelector('.main-content > div:last-child');
    const fields = [...content.querySelectorAll('input[type=text]')].filter(H.vis);
    H.setVal(fields[0], ${JSON.stringify(CANARY)});
    if (fields[1]) H.setVal(fields[1], ${JSON.stringify(CANARY + '-alias')});
    if (fields[2]) H.setVal(fields[2], '555-0100');
  `);
  await sleep(300);
  await inPage(`
    const content = document.querySelector('.main-content > div:last-child');
    [...content.querySelectorAll('button')].find(b => H.vis(b) && /save|vault|enregistrer/i.test(b.textContent)).click();
  `);
  await sleep(3000);
  canaryRendered = await inPage(`return document.body.innerText.includes(${JSON.stringify(CANARY)}) || [...document.querySelectorAll('input')].some(i => i.value.includes(${JSON.stringify(CANARY)}));`);
  if (SELF_TEST) {
    await evaluate(`localStorage.setItem('selftest', ${JSON.stringify(CANARY)});
      fetch('http://localhost:11434/selftest', { method: 'POST', body: ${JSON.stringify(CANARY)} }).catch(() => {});`);
    await sleep(500);
  }

  // Visit every route; a route "renders" if the content area is non-empty and
  // no error boundary text shows.
  for (const r of routes) {
    const before = errors.length;
    await go(r);
    await sleep(2500);
    const state = await inPage(`
      const c = document.querySelector('.main-content > div:last-child');
      const text = c ? c.innerText.trim() : '';
      return { len: text.length, boundary: /something went wrong|unexpected application error|error boundary/i.test(text) };
    `).catch((e) => ({ len: 0, boundary: true, err: e.message }));
    routeResults.push({ route: r, ...state, newErrors: errors.length - before });
  }
  await go('/');
  await sleep(1000);

  // At-rest scan: walk every client-side store for the canary in plaintext.
  atRest = await evaluate(`(async () => {
    const C = ${JSON.stringify(CANARY)};
    const dec = new TextDecoder('utf-8', { fatal: false });
    const hits = []; let records = 0;
    const scan = (v, where, depth = 0) => {
      if (depth > 12 || v == null) return;
      if (typeof v === 'string') { if (v.includes(C)) hits.push(where); return; }
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        const u8 = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        if (dec.decode(u8).includes(C)) hits.push(where + ' (bytes)'); return;
      }
      if (v instanceof Blob) return;
      if (typeof v === 'object') for (const k of Object.keys(v)) { if (k.includes(C)) hits.push(where + ' key'); scan(v[k], where + '.' + k, depth + 1); }
    };
    for (const [name, st] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]])
      for (let i = 0; i < st.length; i++) { const k = st.key(i); scan(k, name + ' key'); scan(st.getItem(k), name + '[' + k + ']'); }
    if (document.cookie.includes(C)) hits.push('cookie');
    const dbs = await indexedDB.databases();
    for (const { name } of dbs) {
      const db = await new Promise((res, rej) => { const q = indexedDB.open(name); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      for (const store of db.objectStoreNames) {
        const all = await new Promise((res) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
        records += all.length;
        all.forEach((v, i) => scan(v, name + '/' + store + '[' + i + ']'));
      }
      db.close();
    }
    const caches_ = 'caches' in self ? await caches.keys() : [];
    return { hits, records, databases: dbs.map(d => d.name), cacheStorage: caches_, inPageViolations: window.__cspv };
  })()`);
} catch (e) {
  flowError = e.message;
  const snap = await inPage(`return { buttons: [...document.querySelectorAll('button')].filter(H.vis).map(b => (b.disabled ? '[disabled] ' : '') + b.textContent.trim().slice(0, 60)), text: document.body.innerText.slice(0, 600) };`).catch(() => null);
  if (snap) flowError += `\n  visible buttons: ${JSON.stringify(snap.buttons)}\n  page text: ${JSON.stringify(snap.text)}`;
}

// Post bodies Chromium didn't inline.
for (const r of requests) {
  if (r.hasPostData && !r.postData && r.requestId) {
    try { r.postData = (await send('Network.getRequestPostData', { requestId: r.requestId })).postData; } catch { /* gone */ }
  }
}

// ---------------------------------------------------------------- report
const offDevice = requests.filter((r) => { try { const u = new URL(r.url); return /^(https?|wss?):$/.test(u.protocol) && u.origin !== ORIGIN; } catch { return false; } });
const leaks = [
  ...requests.filter((r) => r.url.includes(CANARY) || (r.postData || '').includes(CANARY)).map((r) => `${r.method} ${r.url} (route ${r.route})`),
  ...wsFrames.filter((f) => f.payload.includes(CANARY)).map((f) => `WS frame on ${f.route}`),
];
const hostSummary = {};
for (const r of offDevice) {
  const h = new URL(r.url).host;
  (hostSummary[h] ||= { count: 0, routes: new Set(), withBody: 0 }).count++;
  hostSummary[h].routes.add(r.route);
  if (r.postData) hostSummary[h].withBody++;
}
const brokenRoutes = routeResults.filter((r) => r.boundary || r.len === 0);

const line = (s = '') => console.log(s);
line(`CSP gauntlet  ${new Date().toISOString()}`);
line(`policy: tauri.conf.json app.security.csp  (${CSP.length} chars)`);
line(`origin: ${ORIGIN}   chromium: ${CHROME}`);
line(`canary: ${CANARY}`);
line(`scope: browser build, Vault A flow + every route. NOT covered: native Tauri webview, Vault B unlock, Jitsi call, weather widget (no geolocation).`);
line();
line(`flow: ${flowError ? `ABORTED - ${flowError}` : 'completed'}`);
line(`canary visible after save (save path ran): ${canaryRendered}`);
line(`routes visited: ${routeResults.length}/${routes.length}   rendered empty/boundary: ${brokenRoutes.length}`);
for (const r of brokenRoutes) line(`  - ${r.route}  len=${r.len} boundary=${r.boundary}${r.err ? ' ' + r.err : ''}`);
line();
line(`CSP violations: ${violations.length}`);
const seenV = new Set();
for (const v of violations) { const k = v.text; if (seenV.has(k)) continue; seenV.add(k); line(`  - [${v.route}] ${v.text}`); }
if (atRest?.inPageViolations?.length) line(`  in-page securitypolicyviolation events: ${atRest.inPageViolations.length}`);
line();
line(`uncaught errors / console.error: ${errors.length}`);
const seenE = new Set();
for (const e of errors) { const k = e.text.slice(0, 160); if (seenE.has(k)) continue; seenE.add(k); line(`  - [${e.route}] ${e.kind}: ${k}`); }
line();
line(`off-device requests: ${offDevice.length}`);
for (const [h, s] of Object.entries(hostSummary)) line(`  - ${h}  x${s.count}  bodies=${s.withBody}  routes=${[...s.routes].join(',')}`);
line();
line(`CANARY IN TRANSIT: ${leaks.length}`);
for (const l of leaks) line(`  !! ${l}`);
line(`CANARY AT REST (plaintext): ${atRest ? atRest.hits.length : 'not scanned'}`);
if (atRest) {
  for (const h of atRest.hits) line(`  !! ${h}`);
  line(`  scanned: ${atRest.records} IndexedDB records in [${atRest.databases.join(', ')}], localStorage, sessionStorage, cookies; CacheStorage=[${atRest.cacheStorage.join(', ')}]`);
}

const vacuous = !canaryRendered || !atRest || atRest.records === 0;
if (vacuous) line(`\nWARNING: result is vacuous - canary save or at-rest scan did not demonstrably run.`);

ws.close();
chrome.kill('SIGKILL');
server.close();
if (!KEEP) await rm(profile, { recursive: true, force: true });

if (flowError || vacuous) process.exit(2);
process.exit(violations.length || leaks.length || atRest.hits.length || brokenRoutes.length || errors.some((e) => e.kind === 'exception') ? 1 : 0);
