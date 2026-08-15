#!/usr/bin/env node
// Sable — a codebase familiar for Sanctuary.
// A small guardian spirit whose mood reflects the real state of this repo.
// It reads git, your working tree, TODOs, test coverage, and how long it's
// been since you last committed, then reacts. No network, no PHI, RAM-only.
//
//   node pet.js            fast read of the repo, render Sable once
//   node pet.js --test     also run the test suite and let a red bar spook her
//   node pet.js --watch    stay resident; re-read + re-render when files change
//   node pet.js --bar      emit one line of waybar JSON (a live desktop pet that
//                          reacts to the repo AND your machine: load, battery,
//                          time of day, music). Point a waybar custom module at it.
//   node pet.js --record-test <pass|fail>
//                          record the latest test verdict (called by the
//                          pre-commit hook) so --bar can show red without
//                          re-running the suite every few seconds.
//
// She now also stands guard: she inspects the STAGED diff and bristles if a
// secret or client-data-shaped blob is about to be committed, frets over
// crypto/vault edits, notices a merge/rebase in progress, and can tap you on
// the shoulder (desktop notification) the moment her mood turns for the worse.
//
// Purely local and read-only to your REPO — Sable never writes to it. Her own
// memory (last mood, last test verdict) lives outside the tree, under
// $XDG_STATE_HOME/sable (default ~/.local/state/sable). Set SABLE_NO_NOTIFY=1
// to silence her notifications.

import { execSync } from 'node:child_process';
import { watch, readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

// Sable's home is the repo she lives in, resolved from this script's location —
// so she reads the same repo even when launched from elsewhere (e.g. waybar).
// `--repo <path>` points her at a DIFFERENT repo (the familiars strip uses this
// to read several codebases); in that mode she's glance-only: no notifications,
// and she won't borrow the home repo's cached test verdict.
const _argv = process.argv.slice(2);
const _repoIdx = _argv.indexOf('--repo');
const REPO_OVERRIDE = _repoIdx !== -1 && !!_argv[_repoIdx + 1];
const REPO = REPO_OVERRIDE
  ? _argv[_repoIdx + 1]
  : dirname(fileURLToPath(import.meta.url));

// Her own memory lives OUTSIDE the repo, so "never writes to your repo" holds.
const STATE_DIR = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, 'sable')
  : join(os.homedir(), '.local', 'state', 'sable');
const STATE_FILE = join(STATE_DIR, 'state.json');
// A recorded verdict older than this is treated as stale (unknown), not red.
const TEST_VERDICT_TTL_MS = 24 * 60 * 60 * 1000;

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

const args = process.argv.slice(2);
const argSet = new Set(args);
const RUN_TESTS = argSet.has('--test');
const WATCH = argSet.has('--watch');
const BAR = argSet.has('--bar'); // emit one line of waybar JSON, then exit
const RECORD_TEST = argSet.has('--record-test'); // followed by pass|fail

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], cwd: REPO }).toString().trim();
  } catch {
    return '';
  }
}

// ── Sable's own memory (outside the repo, never throws) ─────────────────────
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}
function writeState(patch) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const next = { ...readState(), ...patch };
    writeFileSync(STATE_FILE, JSON.stringify(next));
  } catch {
    // Losing her diary is never worth breaking the bar over.
  }
}

// ── Standing guard: what's about to be committed? ───────────────────────────
// Reuses the pre-commit hook's secret shapes so Sable and the gate agree. She
// only *warns*; the hook is the thing that actually blocks. Scans the staged
// diff's added lines — cheap enough to run on every bar tick.
const SECRET_RE = new RegExp(
  'sk_(live|test)_[0-9A-Za-z]{16,}' +
  '|whsec_[0-9A-Za-z]{16,}' +
  '|-----BEGIN [A-Z ]*PRIVATE KEY-----' +
  '|AKIA[0-9A-Z]{16}' +
  '|(JWT_SECRET|SESSION_SECRET|API_SECRET|SECRET_KEY|AWS_SECRET_ACCESS_KEY|PASSPHRASE|PASSWORD)' +
  '\\s*[:=]\\s*["\']?[^"\'\\s]{8,}'
);
// Client-data shapes. Conservative on purpose — a false alarm every keystroke
// is worse than none. SSN is the least ambiguous PHI pattern.
const PHI_RE = /\b\d{3}-\d{2}-\d{4}\b/;
// The safety-critical engines: edits here must keep the crypto/vault tests green.
const CRIT_RE = /(cryptoEngine|storageEngine|backupEngine|authStore|guardrails|vault)/i;

function scanStaged() {
  const names = sh('git diff --cached --name-only --diff-filter=ACM')
    .split('\n').filter(Boolean);
  const added = sh('git diff --cached -U0 --diff-filter=ACM')
    .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));

  const envFile = names.some(
    (n) => /(^|\/)\.env($|\.)/.test(n) && !/\.env\.example$/.test(n)
  );
  const secret = envFile || added.some((l) => SECRET_RE.test(l));
  const phi = added.some((l) => PHI_RE.test(l));
  const critical = names.filter((n) => CRIT_RE.test(n));

  return { secret, phi, critical, staged: names.length };
}

// ── Read the repo's vital signs ────────────────────────────────────────────
function readSignals() {
  const porcelain = sh('git status --porcelain');
  const lines = porcelain ? porcelain.split('\n') : [];
  const trackedDirty = lines.filter((l) => !l.startsWith('??')).length;
  const untracked = lines.filter((l) => l.startsWith('??')).length;
  const stagedCount = lines.filter((l) => /^[MADRC]/.test(l)).length;

  let ahead = 0, behind = 0;
  const lr = sh('git rev-list --left-right --count @{u}...HEAD');
  if (lr) { const [b, a] = lr.split(/\s+/).map(Number); behind = b || 0; ahead = a || 0; }

  const lastCommitEpoch = Number(sh('git log -1 --format=%ct')) || 0;
  const daysSinceCommit = lastCommitEpoch
    ? Math.floor((Date.now() / 1000 - lastCommitEpoch) / 86400) : 0;

  const todos = Number(sh('grep -rInE "TODO|FIXME|HACK|XXX" src 2>/dev/null | wc -l')) || 0;
  const srcFiles = Number(sh("find src \\( -name '*.js' -o -name '*.jsx' \\) | wc -l")) || 0;
  const testFiles = Number(sh("find src -name '*.test.js' | wc -l")) || 0;
  // symbolic-ref works even on a fresh branch with no commits yet, where
  // rev-parse HEAD errors out.
  const branch = sh('git rev-parse --abbrev-ref HEAD') || sh('git symbolic-ref --short HEAD') || '?';

  // Git danger states: a half-finished merge/rebase, a growing stash, or a
  // commit aimed straight at a protected branch.
  const merging = sh('git rev-parse -q --verify MERGE_HEAD') !== '';
  const rebasing = existsSync(sh('git rev-parse --git-path rebase-merge'))
    || existsSync(sh('git rev-parse --git-path rebase-apply'));
  const stashCount = (() => { const s = sh('git stash list'); return s ? s.split('\n').length : 0; })();
  const onProtected = /^(main|master)$/.test(branch);

  const sentinel = scanStaged();

  // Test verdict: run it on demand (--test), otherwise trust a fresh recording.
  let testsPass = null;
  if (RUN_TESTS) {
    try { execSync('npm test', { stdio: 'ignore', cwd: REPO }); testsPass = true; }
    catch { testsPass = false; }
    writeState({ test: { pass: testsPass, at: Date.now() } });
  } else if (!REPO_OVERRIDE) {
    // Only the home repo trusts the recorded verdict — it's Sanctuary's, and
    // must not be shown against other repos in the familiars strip.
    const rec = readState().test;
    if (rec && typeof rec.pass === 'boolean' && Date.now() - (rec.at || 0) < TEST_VERDICT_TTL_MS) {
      testsPass = rec.pass;
    }
  }

  return {
    trackedDirty, untracked, stagedCount, ahead, behind, daysSinceCommit,
    todos, srcFiles, testFiles, branch, testsPass,
    merging, rebasing, stashCount, onProtected, sentinel,
  };
}

// ── Decide how Sable feels ─────────────────────────────────────────────────
// One dominant mood wins, by priority: guardianship first, then danger, then
// neglect, then calm.
function moodFor(s) {
  if (s.sentinel.secret)
    return { key: 'guarding', why: 'a secret is staged — she is standing in front of the commit' };
  if (s.sentinel.phi)
    return { key: 'guarding', why: 'the staged diff looks like client data — do NOT commit it in the clear' };
  if (s.testsPass === false)
    return { key: 'alarmed', why: 'a test is red — she can feel the crack in the wards' };
  if (s.merging || s.rebasing)
    return { key: 'tangled', why: `a ${s.merging ? 'merge' : 'rebase'} is half-finished — mind the threads` };
  if (s.sentinel.critical.length)
    return { key: 'worried', why: `crypto/vault code is staged (${s.sentinel.critical[0].split('/').pop()}) — keep the tests green` };
  if (s.onProtected && s.stagedCount > 0)
    return { key: 'worried', why: `you're about to commit straight to ${s.branch}` };
  if (s.todos > 12)
    return { key: 'worried', why: `${s.todos} loose TODOs whispering at her` };
  if (s.trackedDirty > 0)
    return { key: 'anxious', why: `${s.trackedDirty} unsaved change${s.trackedDirty > 1 ? 's' : ''} rattling in the working tree` };
  if (s.ahead > 0)
    return { key: 'eager', why: `${s.ahead} commit${s.ahead > 1 ? 's' : ''} straining to be pushed` };
  if (s.daysSinceCommit >= 7)
    return { key: 'sleepy', why: `${s.daysSinceCommit} days since the last commit — she's dozed off` };
  if (s.untracked > 15)
    return { key: 'curious', why: `${s.untracked} untracked files she keeps sniffing at` };
  if (s.testFiles / Math.max(s.srcFiles, 1) >= 0.35)
    return { key: 'proud', why: `${s.testFiles} tests guarding ${s.srcFiles} files — well warded` };
  return { key: 'content', why: 'the vault is quiet and clean' };
}

// ── Faces ──────────────────────────────────────────────────────────────────
// A little fox-guardian. Ears, eyes, and mouth swap by mood; the aura tints her.
const FACES = {
  content:  { eyes: '•   •', mouth: ' ‿ ',  color: C.green,   aura: 'purrs softly',        emote: '♪' },
  proud:    { eyes: '◕   ◕', mouth: ' ◡ ',  color: C.cyan,    aura: 'sits tall, chest out',  emote: '✦' },
  eager:    { eyes: '⚈   ⚈', mouth: ' ▽ ',  color: C.blue,    aura: 'paws at the remote',    emote: '↑' },
  curious:  { eyes: 'o   O', mouth: ' ~ ',  color: C.magenta, aura: 'nose twitching',        emote: '?' },
  anxious:  { eyes: '·   ·', mouth: ' ں ',  color: C.yellow,  aura: 'tail flicking',         emote: '~' },
  sleepy:   { eyes: '－   －', mouth: ' ⌣ ', color: C.gray,    aura: 'curled up, dreaming',   emote: 'z' },
  worried:  { eyes: 'ⓞ   ⓞ', mouth: ' ⌒ ', color: C.yellow,  aura: 'ears pinned back',      emote: '!' },
  alarmed:  { eyes: '✖   ✖', mouth: ' ▢ ',  color: C.red,     aura: 'fur bristling',         emote: '!!' },
  guarding: { eyes: '⊙   ⊙', mouth: ' ▢ ',  color: C.red,     aura: 'planted in front of the commit', emote: '⚠' },
  tangled:  { eyes: '◑   ◐', mouth: ' ~ ',  color: C.yellow,  aura: 'untangling the threads', emote: '⤨' },
  busy:     { eyes: '>   <', mouth: ' ◇ ',  color: C.blue,    aura: 'working hard with you',  emote: '⚙' },
  happy:    { eyes: '^   ^', mouth: ' ᵕ ',  color: C.green,   aura: 'swaying to the music',   emote: '♫' },
};

// ── Machine signals: how Sable reads what YOU'RE doing right now ────────────
// Live, non-invasive reads only — load, battery, clock, and whatever media
// player is running. No input capture, no window snooping (Wayland doesn't
// expose those, and Sable is a familiar, not a spy).
function readSystem() {
  const cpus = os.cpus().length || 1;
  const load1 = os.loadavg()[0] || 0;
  const hour = new Date().getHours();

  let battery = null, charging = false;
  try {
    const base = '/sys/class/power_supply';
    for (const name of readdirSync(base)) {
      let type = '';
      try { type = readFileSync(`${base}/${name}/type`, 'utf8').trim(); } catch { /* skip */ }
      if (type !== 'Battery') continue;
      const cap = Number(readFileSync(`${base}/${name}/capacity`, 'utf8').trim());
      let status = '';
      try { status = readFileSync(`${base}/${name}/status`, 'utf8').trim(); } catch { /* skip */ }
      if (Number.isFinite(cap)) battery = cap;
      charging = status === 'Charging' || status === 'Full';
      break;
    }
  } catch { /* no battery (desktop) */ }

  const media = sh('playerctl status 2>/dev/null');          // Playing | Paused | ''
  const track = media === 'Playing' ? sh('playerctl metadata title 2>/dev/null') : '';

  return { cpus, load1, loadRatio: load1 / cpus, hour, battery, charging, media, track };
}

// Compact faces for the waybar module (the ASCII fox is too wide for a bar).
const BAR_FACES = {
  content: '◕ᴥ◕', happy: '◕ᴥ◕♫', proud: '★ᴥ★', eager: '◕ᴥ◕↑',
  curious: 'o.O', anxious: '·︿·', worried: 'ⓞ﹏ⓞ', sleepy: '-ᴥ-z',
  busy: '>ᴥ<', alarmed: '⊙ᴥ⊙!', guarding: '⊙ᴥ⊙⚠', tangled: '◑ᴥ◐',
};

// Bar mood: repo signals + machine signals. Guardianship first, then danger.
function barMood(s, sys) {
  if (s.branch === '?')
    return { key: 'sleepy', why: 'no git signal here' };
  if (s.sentinel.secret)
    return { key: 'guarding', why: 'a secret is staged — do NOT commit' };
  if (s.sentinel.phi)
    return { key: 'guarding', why: 'staged diff looks like client data' };
  if (sys.battery !== null && sys.battery <= 10 && !sys.charging)
    return { key: 'alarmed', why: `battery at ${sys.battery}% — she's frightened` };
  if (s.testsPass === false)
    return { key: 'alarmed', why: 'a test is red' };
  if (s.merging || s.rebasing)
    return { key: 'tangled', why: `a ${s.merging ? 'merge' : 'rebase'} is in progress` };
  if (s.sentinel.critical.length)
    return { key: 'worried', why: `crypto/vault code staged (${s.sentinel.critical[0].split('/').pop()})` };
  if (sys.loadRatio > 1.2)
    return { key: 'busy', why: `load ${sys.load1.toFixed(1)} on ${sys.cpus} cores — working hard with you` };
  if (s.onProtected && s.stagedCount > 0)
    return { key: 'worried', why: `about to commit straight to ${s.branch}` };
  if (s.trackedDirty > 0)
    return { key: 'anxious', why: `${s.trackedDirty} unsaved change${s.trackedDirty > 1 ? 's' : ''} in the tree` };
  if (s.ahead > 0)
    return { key: 'eager', why: `${s.ahead} commit${s.ahead > 1 ? 's' : ''} to push` };
  if (sys.media === 'Playing')
    return { key: 'happy', why: sys.track ? `swaying to “${sys.track}”` : "music's on — she's swaying" };
  if (sys.hour >= 23 || sys.hour < 5)
    return { key: 'sleepy', why: `it's ${String(sys.hour).padStart(2, '0')}:00 — she's dozing` };
  if (s.untracked > 15)
    return { key: 'curious', why: `${s.untracked} untracked files she's sniffing` };
  return { key: 'content', why: "all quiet — she's content" };
}

// ── Notifications: a tap on the shoulder when her mood turns for the worse ──
// Fires only on a *transition* into a concerning mood (and once when the coast
// clears), so she's a sentinel, not a nag. Silence with SABLE_NO_NOTIFY=1.
const CONCERN = new Set(['guarding', 'alarmed', 'worried', 'tangled']);
function maybeNotify(mood) {
  if (process.env.SABLE_NO_NOTIFY) return;
  const prev = readState().mood;
  if (mood.key === prev) return;               // no change → stay quiet
  writeState({ mood: mood.key });
  if (prev === undefined) return;              // first run this session → don't startle
  const urgent = mood.key === 'guarding' || mood.key === 'alarmed';
  let title, body;
  if (CONCERN.has(mood.key)) {
    title = `Sable · ${mood.key}`;
    body = mood.why;
  } else if (CONCERN.has(prev)) {
    title = 'Sable · all clear';
    body = mood.why;
  } else {
    return;                                    // calm → calm transition, no ping
  }
  // Never let a missing notifier break the bar.
  const q = (t) => `'${String(t).replace(/'/g, "'\\''")}'`;
  sh(`notify-send ${urgent ? '-u critical' : '-u normal'} ${q(title)} ${q(body)}`);
}

// One line of waybar JSON: { text, tooltip, class }. `class` drives CSS color.
function printBar() {
  const s = readSignals();
  const sys = readSystem();
  const mood = barMood(s, sys);
  if (!REPO_OVERRIDE) maybeNotify(mood); // familiars strip is glance-only
  const tip = [
    `Sable · ${s.branch}`,
    mood.why,
    '',
    `tree: ${s.trackedDirty ? s.trackedDirty + ' dirty' : 'clean'} · staged ${s.stagedCount} · untracked ${s.untracked} · unpushed ${s.ahead}`,
    s.sentinel.secret ? '⚠ a secret is staged' : '',
    s.sentinel.phi ? '⚠ staged diff looks like client data' : '',
    s.sentinel.critical.length ? `⚠ crypto/vault staged: ${s.sentinel.critical.map((n) => n.split('/').pop()).join(', ')}` : '',
    s.merging ? '⤨ merge in progress' : (s.rebasing ? '⤨ rebase in progress' : ''),
    s.stashCount ? `stash: ${s.stashCount}` : '',
    s.testsPass === false ? '✗ last test run was RED' : (s.testsPass === true ? '✓ last test run was green' : ''),
    `load: ${sys.load1.toFixed(2)}/${sys.cpus}${sys.battery !== null ? ` · battery ${sys.battery}%${sys.charging ? '⚡' : ''}` : ''}`,
    sys.media === 'Playing' ? `♪ ${sys.track || 'playing'}` : '',
  ].filter(Boolean).join('\n');
  process.stdout.write(JSON.stringify({
    text: BAR_FACES[mood.key] || '◕ᴥ◕',
    tooltip: tip,
    class: mood.key,
    alt: mood.key,
    branch: s.branch,
  }) + '\n');
}

function render(s, mood) {
  const f = FACES[mood.key];
  const c = f.color;
  const pet = [
    `${c}      /\\   ${f.emote}   /\\${C.reset}`,
    `${c}     /  \\_____/  \\${C.reset}`,
    `${c}    (   ${f.eyes}   )${C.reset}`,
    `${c}     \\    ${f.mouth}    /${C.reset}`,
    `${c}      \\___v___v__/${C.reset}     ${C.dim}${f.aura}${C.reset}`,
  ];

  const bar = (label, val, good) =>
    `  ${C.dim}${label.padEnd(14)}${C.reset}${good ? C.green : C.yellow}${val}${C.reset}`;

  const testLine = s.testsPass === null
    ? `  ${C.dim}tests${' '.repeat(9)}${C.reset}${C.gray}unknown (run --test)${C.reset}`
    : bar('tests', s.testsPass ? 'all green ✓' : 'RED ✗', s.testsPass);

  console.clear();
  console.log('');
  console.log(`  ${C.bold}Sable${C.reset} ${C.dim}·  your ${s.branch} familiar${C.reset}`);
  console.log('');
  pet.forEach((l) => console.log(l));
  console.log('');
  console.log(`  ${c}“${mood.why}”${C.reset}`);
  console.log('');
  console.log(bar('working tree', s.trackedDirty ? `${s.trackedDirty} dirty` : 'clean', !s.trackedDirty));
  console.log(bar('staged', String(s.stagedCount), s.stagedCount === 0 || (!s.sentinel.secret && !s.sentinel.phi)));
  console.log(bar('untracked', String(s.untracked), s.untracked <= 15));
  console.log(bar('last commit', s.daysSinceCommit === 0 ? 'today' : `${s.daysSinceCommit}d ago`, s.daysSinceCommit < 7));
  console.log(bar('unpushed', String(s.ahead), s.ahead === 0));
  console.log(bar('TODOs', String(s.todos), s.todos <= 12));
  console.log(bar('coverage', `${s.testFiles} tests / ${s.srcFiles} files`, s.testFiles / Math.max(s.srcFiles, 1) >= 0.35));
  console.log(testLine);
  if (s.sentinel.secret || s.sentinel.phi || s.sentinel.critical.length || s.merging || s.rebasing) {
    console.log('');
    if (s.sentinel.secret) console.log(`  ${C.red}⚠ a secret is staged — Sable is blocking the way${C.reset}`);
    if (s.sentinel.phi) console.log(`  ${C.red}⚠ staged diff looks like client data — do not commit in the clear${C.reset}`);
    if (s.sentinel.critical.length) console.log(`  ${C.yellow}⚠ crypto/vault staged: ${s.sentinel.critical.map((n) => n.split('/').pop()).join(', ')} — keep the tests green${C.reset}`);
    if (s.merging) console.log(`  ${C.yellow}⤨ a merge is in progress${C.reset}`);
    if (s.rebasing) console.log(`  ${C.yellow}⤨ a rebase is in progress${C.reset}`);
  }
  console.log('');
  if (WATCH) console.log(`  ${C.dim}watching src/ — edit a file to see Sable react · Ctrl-C to release her${C.reset}\n`);
}

function beat() {
  const s = readSignals();
  const mood = moodFor(s);
  if (!REPO_OVERRIDE) maybeNotify(mood);
  render(s, mood);
}

if (RECORD_TEST) {
  // Called by the pre-commit hook: `node pet.js --record-test pass|fail`.
  const verdict = args[args.indexOf('--record-test') + 1];
  if (verdict === 'pass' || verdict === 'fail') {
    writeState({ test: { pass: verdict === 'pass', at: Date.now() } });
  }
} else if (BAR) {
  // waybar custom module: emit one JSON line and exit (waybar re-runs on interval)
  printBar();
} else {
  beat();
  if (WATCH) {
    let pending;
    const nudge = () => { clearTimeout(pending); pending = setTimeout(beat, 250); };
    try {
      watch(`${REPO}/src`, { recursive: true }, nudge);
    } catch {
      // recursive watch unsupported on some platforms — poll instead
      setInterval(beat, 3000);
    }
  }
}
