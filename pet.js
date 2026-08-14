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
//
// Purely local and read-only. Sable never writes to your repo.

import { execSync } from 'node:child_process';
import { watch, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import os from 'node:os';

// Sable's home is the repo she lives in, resolved from this script's location —
// so she reads the same repo even when launched from elsewhere (e.g. waybar).
const REPO = dirname(fileURLToPath(import.meta.url));

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

const args = new Set(process.argv.slice(2));
const RUN_TESTS = args.has('--test');
const WATCH = args.has('--watch');
const BAR = args.has('--bar'); // emit one line of waybar JSON, then exit

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], cwd: REPO }).toString().trim();
  } catch {
    return '';
  }
}

// ── Read the repo's vital signs ────────────────────────────────────────────
function readSignals() {
  const porcelain = sh('git status --porcelain');
  const lines = porcelain ? porcelain.split('\n') : [];
  const trackedDirty = lines.filter((l) => !l.startsWith('??')).length;
  const untracked = lines.filter((l) => l.startsWith('??')).length;

  let ahead = 0, behind = 0;
  const lr = sh('git rev-list --left-right --count @{u}...HEAD');
  if (lr) { const [b, a] = lr.split(/\s+/).map(Number); behind = b || 0; ahead = a || 0; }

  const lastCommitEpoch = Number(sh('git log -1 --format=%ct')) || 0;
  const daysSinceCommit = lastCommitEpoch
    ? Math.floor((Date.now() / 1000 - lastCommitEpoch) / 86400) : 0;

  const todos = Number(sh('grep -rInE "TODO|FIXME|HACK|XXX" src 2>/dev/null | wc -l')) || 0;
  const srcFiles = Number(sh("find src \\( -name '*.js' -o -name '*.jsx' \\) | wc -l")) || 0;
  const testFiles = Number(sh("find src -name '*.test.js' | wc -l")) || 0;
  const branch = sh('git rev-parse --abbrev-ref HEAD') || '?';

  let testsPass = null;
  if (RUN_TESTS) {
    try {
      execSync('npm test', { stdio: 'ignore' });
      testsPass = true;
    } catch {
      testsPass = false;
    }
  }

  return {
    trackedDirty, untracked, ahead, behind, daysSinceCommit,
    todos, srcFiles, testFiles, branch, testsPass,
  };
}

// ── Decide how Sable feels ─────────────────────────────────────────────────
// One dominant mood wins, by priority: danger first, then neglect, then calm.
function moodFor(s) {
  if (s.testsPass === false)
    return { key: 'alarmed', why: 'a test is red — she can feel the crack in the wards' };
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
  busy: '>ᴥ<', alarmed: '⊙ᴥ⊙!',
};

// Bar mood: repo signals + machine signals, danger first.
function barMood(s, sys) {
  if (sys.battery !== null && sys.battery <= 10 && !sys.charging)
    return { key: 'alarmed', why: `battery at ${sys.battery}% — she's frightened` };
  if (s.testsPass === false)
    return { key: 'alarmed', why: 'a test is red' };
  if (sys.loadRatio > 1.2)
    return { key: 'busy', why: `load ${sys.load1.toFixed(1)} on ${sys.cpus} cores — working hard with you` };
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

// One line of waybar JSON: { text, tooltip, class }. `class` drives CSS color.
function printBar() {
  const s = readSignals();
  const sys = readSystem();
  const mood = barMood(s, sys);
  const tip = [
    `Sable · ${s.branch}`,
    mood.why,
    '',
    `tree: ${s.trackedDirty ? s.trackedDirty + ' dirty' : 'clean'} · untracked ${s.untracked} · unpushed ${s.ahead}`,
    `load: ${sys.load1.toFixed(2)}/${sys.cpus}${sys.battery !== null ? ` · battery ${sys.battery}%${sys.charging ? '⚡' : ''}` : ''}`,
    sys.media === 'Playing' ? `♪ ${sys.track || 'playing'}` : '',
  ].filter(Boolean).join('\n');
  process.stdout.write(JSON.stringify({
    text: BAR_FACES[mood.key] || '◕ᴥ◕',
    tooltip: tip,
    class: mood.key,
    alt: mood.key,
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
    ? `  ${C.dim}tests${' '.repeat(9)}${C.reset}${C.gray}not run (add --test)${C.reset}`
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
  console.log(bar('untracked', String(s.untracked), s.untracked <= 15));
  console.log(bar('last commit', s.daysSinceCommit === 0 ? 'today' : `${s.daysSinceCommit}d ago`, s.daysSinceCommit < 7));
  console.log(bar('unpushed', String(s.ahead), s.ahead === 0));
  console.log(bar('TODOs', String(s.todos), s.todos <= 12));
  console.log(bar('coverage', `${s.testFiles} tests / ${s.srcFiles} files`, s.testFiles / Math.max(s.srcFiles, 1) >= 0.35));
  console.log(testLine);
  console.log('');
  if (WATCH) console.log(`  ${C.dim}watching src/ — edit a file to see Sable react · Ctrl-C to release her${C.reset}\n`);
}

function beat() {
  const s = readSignals();
  render(s, moodFor(s));
}

if (BAR) {
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
