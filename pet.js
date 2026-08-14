#!/usr/bin/env node
// Sable — a codebase familiar for Sanctuary.
// A small guardian spirit whose mood reflects the real state of this repo.
// It reads git, your working tree, TODOs, test coverage, and how long it's
// been since you last committed, then reacts. No network, no PHI, RAM-only.
//
//   node pet.js            fast read of the repo, render Sable once
//   node pet.js --test     also run the test suite and let a red bar spook her
//   node pet.js --watch    stay resident; re-read + re-render when files change
//
// Purely local and read-only. Sable never writes to your repo.

import { execSync } from 'node:child_process';
import { watch } from 'node:fs';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

const args = new Set(process.argv.slice(2));
const RUN_TESTS = args.has('--test');
const WATCH = args.has('--watch');

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
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
};

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

beat();

if (WATCH) {
  let pending;
  const nudge = () => { clearTimeout(pending); pending = setTimeout(beat, 250); };
  try {
    watch('src', { recursive: true }, nudge);
  } catch {
    // recursive watch unsupported on some platforms — poll instead
    setInterval(beat, 3000);
  }
}
