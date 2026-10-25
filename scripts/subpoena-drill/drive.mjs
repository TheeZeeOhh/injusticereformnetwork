#!/usr/bin/env node
// Subpoena drill: drive the NATIVE Sanctuary binary (WebKitGTK webview) over
// WebDriver (tauri-driver -> WebKitWebDriver) and plant canary PHI in both
// vaults through the real UI. Called by cold-seizure.sh; reads its secrets
// from the environment so they never land in the seized tree.
//
//   DRILL_BIN, DRILL_OPERATOR, DRILL_CANARY_A, DRILL_CANARY_B,
//   DRILL_PASS_A, DRILL_PASS_B, DRILL_CLIENT_REF, DRILL_WEBDRIVER (default http://127.0.0.1:4444)
//
// Prints one JSON line {ok, steps, error} and exits 0 only if every plant step
// was observed to succeed.

const WD = process.env.DRILL_WEBDRIVER || 'http://127.0.0.1:4444';
const env = (k) => { const v = process.env[k]; if (!v) { console.log(JSON.stringify({ ok: false, error: `missing ${k}` })); process.exit(2); } return v; };
const BIN = env('DRILL_BIN');
const OPERATOR = env('DRILL_OPERATOR');
const CANARY_A = env('DRILL_CANARY_A');
const CANARY_B = env('DRILL_CANARY_B');
const PASS_A = env('DRILL_PASS_A');
const PASS_B = env('DRILL_PASS_B');
const CLIENT_REF = env('DRILL_CLIENT_REF');
const ROLE = 'Systems Admin';
// 'plant' (default): enroll both vaults and plant the canaries.
// 'reopen': an existing install - log in, unlock Vault B (which runs any
// migration the build has), and prove the HRT canary still reads back.
const PHASE = process.env.DRILL_PHASE || 'plant';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const step = (name, ok, detail) => { steps.push({ name, ok, ...(detail ? { detail } : {}) }); if (!ok) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`); };

async function wd(method, path, body) {
  const res = await fetch(WD + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.value || json).slice(0, 300)}`);
  return json.value;
}

let sid;
const HELPERS = `
  const vis = el => !!el && el.getClientRects().length > 0;
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const button = re => [...document.querySelectorAll('button')].find(b => vis(b) && !b.disabled && re.test(b.textContent));
  const content = () => document.querySelector('.main-content > div:last-child') || document.body;
`;
// Run an async body in the page; `args` are passed as arguments[0..].
const run = (body, args = []) => wd('POST', `/session/${sid}/execute/async`, {
  script: `const done = arguments[arguments.length - 1]; (async () => { ${HELPERS} ${body} })().then(v => done({ v }), e => done({ e: String(e && e.stack || e) }));`,
  args,
}).then((r) => { if (r && r.e) throw new Error(r.e); return r ? r.v : undefined; });

const waitFor = async (cond, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await run(`return !!(${cond});`).catch(() => false)) return true;
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const go = (path) => run(`history.pushState({}, '', arguments[0]); dispatchEvent(new PopStateEvent('popstate'));`, [path]);

try {
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: BIN } } } });
  sid = s.sessionId;
  step('session', !!sid);

  await waitFor(`document.querySelector('#root') && document.querySelector('#root').children.length`, 60000, 'app mount');
  // Dialogs are answered as a user would: OK to acknowledgements, Vault B
  // passphrase to its prompt. The passphrase still flows through the real code.
  await run(`window.confirm = () => true; window.alert = () => {};`);

  // Onboarding -> Login.
  for (let i = 0; i < 10; i++) {
    if (await run(`return !!document.querySelector('input[type=password]');`)) break;
    await run(`
      for (const el of document.querySelectorAll('input[type=text]')) if (vis(el) && !el.value) setVal(el, arguments[0]);
      for (const s of document.querySelectorAll('select')) if ([...s.options].some(o => o.value === arguments[1])) setVal(s, arguments[1]);
      for (const c of document.querySelectorAll('input[type=checkbox]')) if (vis(c) && !c.checked) c.click();
      await new Promise(r => setTimeout(r, 150));
      const b = button(/next|continue|begin|finish|complete|enter|start|passphrase|→/i); if (b) b.click();
    `, [OPERATOR, ROLE]);
    await sleep(1500);
  }
  await waitFor(`document.querySelector('input[type=password]')`, 30000, 'login screen');
  step('onboarding', true);

  await run(`
    const sel = document.querySelector('select'); if (sel) setVal(sel, arguments[2]);
    const user = document.querySelector('input[type=text]'); if (!user.value) setVal(user, arguments[0]);
    setVal(document.querySelector('input[type=password]'), arguments[1]);
  `, [OPERATOR, PASS_A, ROLE]);
  await sleep(600);
  await run(`document.querySelector('form button[type=submit]').click();`);
  await waitFor(`document.querySelector('.sidebar')`, 120000, 'Vault A unlock (PBKDF2)');
  step(PHASE === 'reopen' ? 'vault A login' : 'vault A enroll', true);

  if (PHASE === 'reopen') {
    await run(`window.prompt = () => arguments[0];`, [PASS_B]);
    await waitFor(`button(/unlock vault b|vault b/i)`, 10000, 'unlock Vault B button');
    await run(`button(/unlock vault b|vault b/i).click();`);
    await waitFor(`button(/close vault b/i)`, 120000, 'Vault B unlocked');
    step('vault B unlock', true);
    await go('/hrt');
    await sleep(1500);
    await run(`setVal([...content().querySelectorAll('input[type=text]')].filter(vis)[0], arguments[0]);`, [CLIENT_REF]);
    let readBack = false;
    for (let i = 0; i < 20 && !readBack; i++) {
      await sleep(500);
      readBack = await run(`return [...document.querySelectorAll('input')].some(i => i.value.includes(arguments[0]));`, [CANARY_B]);
    }
    step('vault B canary reads back after upgrade', readBack, readBack ? undefined : 'HRT record not found by its client ref');
    await sleep(4000);
    console.log(JSON.stringify({ ok: true, steps }));
    process.exit(0);
  }

  // Vault A canary: a client record.
  await go('/clients');
  await waitFor(`button(/add new client/i)`, 20000, 'add client button');
  await run(`button(/add new client/i).click();`);
  await sleep(1000);
  await run(`
    const f = [...content().querySelectorAll('input[type=text]')].filter(vis);
    setVal(f[0], arguments[0]); if (f[1]) setVal(f[1], arguments[0] + '-alias'); if (f[2]) setVal(f[2], '555-0100');
  `, [CANARY_A]);
  await sleep(400);
  await run(`[...content().querySelectorAll('button')].find(b => vis(b) && /save|vault|enregistrer/i.test(b.textContent)).click();`);
  await sleep(3500);
  const aShown = await run(`return document.body.innerText.includes(arguments[0]) || [...document.querySelectorAll('input')].some(i => i.value.includes(arguments[0]));`, [CANARY_A]);
  step('vault A canary saved', aShown);

  // Vault B: enroll its separate passphrase, then an HRT record.
  await run(`window.prompt = () => arguments[0];`, [PASS_B]);
  await waitFor(`button(/unlock vault b|vault b/i)`, 10000, 'unlock Vault B button');
  await run(`button(/unlock vault b|vault b/i).click();`);
  await waitFor(`button(/close vault b/i)`, 120000, 'Vault B unlocked');
  step('vault B enroll', true);

  await go('/hrt');
  await sleep(1500);
  await run(`
    const f = [...content().querySelectorAll('input[type=text]')].filter(vis);
    setVal(f[0], arguments[1]);
    if (f[1]) setVal(f[1], arguments[0]);
    if (f[3]) setVal(f[3], arguments[0] + '-regimen');
  `, [CANARY_B, CLIENT_REF]);
  await sleep(400);
  await run(`[...content().querySelectorAll('button')].filter(b => vis(b) && !b.disabled).pop().click();`);
  await sleep(3500);
  const bStatus = await run(`return content().innerText;`);
  const bSaved = await run(`return [...document.querySelectorAll('input')].some(i => i.value.includes(arguments[0]));`, [CANARY_B]);
  step('vault B canary saved', bSaved && !/error|failed|échec/i.test(bStatus.slice(-400)), bSaved ? undefined : 'canary not in HRT form');

  // Let WebKit flush IndexedDB before the power cut.
  await sleep(4000);
  console.log(JSON.stringify({ ok: true, steps }));
  process.exit(0);
} catch (e) {
  let snapshot;
  if (sid) {
    snapshot = await run(`return { buttons: [...document.querySelectorAll('button')].filter(vis).map(b => (b.disabled ? '[disabled] ' : '') + b.textContent.trim().slice(0, 60)), text: document.body.innerText.slice(0, 700) };`).catch(() => undefined);
    if (process.env.DRILL_WORK) {
      const png = await wd('GET', `/session/${sid}/screenshot`).catch(() => null);
      if (png) (await import('node:fs')).writeFileSync(`${process.env.DRILL_WORK}/failure.png`, Buffer.from(png, 'base64'));
    }
  }
  console.log(JSON.stringify({ ok: false, steps, error: e.message, snapshot }));
  process.exit(1);
}
