#!/usr/bin/env node
// Subpoena drill: examine a seized tree the way a forensic examiner would -
// byte-search every file for the planted canaries and passphrases, in every
// encoding they plausibly land in. Called by cold-seizure.sh.
//
//   node forensics.mjs <seized-root> [<extra-root>...]
//   needles from env: DRILL_CANARY_A, DRILL_CANARY_B, DRILL_PASS_A, DRILL_PASS_B, DRILL_CLIENT_REF,
//   DRILL_OPERATOR (positive control: stored in plaintext BY DESIGN, so the scan
//   MUST find it - if it doesn't, the scan is blind and the run is invalid).
//   DRILL_SINCE (unix seconds): also scan the user journal from then on.
//
// Exit: 0 clean, 1 PHI/secret recovered, 2 invalid run (positive control missed).

import { readdirSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = process.argv.slice(2);
const SECRET = { 'Vault A canary': 'DRILL_CANARY_A', 'Vault B canary': 'DRILL_CANARY_B', 'Vault A passphrase': 'DRILL_PASS_A', 'Vault B passphrase': 'DRILL_PASS_B',
  // Metadata, not content: the client ref typed into a Vault B (HRT) record.
  // Recoverable in plaintext = "this client has an HRT record" without Vault B.
  'Vault B client ref (metadata)': 'DRILL_CLIENT_REF' };
const CONTROL = 'DRILL_OPERATOR';

// Every byte pattern a string can plausibly be stored as.
function encodings(s) {
  const u8 = Buffer.from(s, 'utf8');
  const out = [['utf8', u8], ['utf16le', Buffer.from(s, 'utf16le')], ['hex', Buffer.from(u8.toString('hex'))]];
  for (let k = 0; k < 3; k++) {
    const b64 = Buffer.from(u8.subarray(k)).toString('base64');
    const core = b64.slice(0, b64.length - 4); // drop the alignment-dependent tail
    if (core.length >= 12) out.push([`base64@${k}`, Buffer.from(core)]);
  }
  return out;
}
const needles = [];
for (const [label, key] of Object.entries(SECRET)) for (const [enc, bytes] of encodings(process.env[key] || '')) if (process.env[key]) needles.push({ label, enc, bytes, control: false });
for (const [enc, bytes] of encodings(process.env[CONTROL] || '')) needles.push({ label: 'operator name (control)', enc, bytes, control: true });
if (!needles.some((n) => n.control) || needles.length < 5) { console.error('forensics: needles missing from env'); process.exit(2); }

const hits = [];
const inventory = [];
let bytesScanned = 0;
function scanBuffer(buf, where) {
  bytesScanned += buf.length;
  for (const n of needles) {
    const at = buf.indexOf(n.bytes);
    if (at !== -1) hits.push({ label: n.label, enc: n.enc, where, offset: at, control: n.control });
  }
}
function walk(dir, root) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    let st; try { st = lstatSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, root);
    else if (st.isFile()) {
      inventory.push({ path: relative(root, p), size: st.size });
      try { scanBuffer(readFileSync(p), relative(root, p) || p); } catch { /* unreadable */ }
    }
  }
}
for (const r of roots) walk(r, r);

if (process.env.DRILL_SINCE) {
  try {
    const j = execFileSync('journalctl', ['--user', `--since=@${process.env.DRILL_SINCE}`, '-o', 'cat', '--no-pager'], { maxBuffer: 256 << 20 });
    scanBuffer(j, 'journal (user)');
  } catch { /* no user journal */ }
  try {
    const c = execFileSync('coredumpctl', ['list', `--since=@${process.env.DRILL_SINCE}`, '--no-pager'], { encoding: 'utf8' });
    if (/sanctuary|\/app\b|WebKit/i.test(c)) hits.push({ label: 'core dump from the app during the run', enc: '-', where: 'coredumpctl', offset: 0, control: false });
  } catch { /* none */ }
}

const findings = hits.filter((h) => !h.control);
const controlFound = hits.some((h) => h.control);
const report = { controlFound, findings, controlHits: hits.filter((h) => h.control), filesScanned: inventory.length, bytesScanned, inventory };
writeFileSync(process.env.DRILL_REPORT || '/dev/null', JSON.stringify(report, null, 2));

console.log(`files scanned: ${inventory.length}   bytes: ${bytesScanned}`);
console.log(`positive control (operator name, plaintext by design): ${controlFound ? 'FOUND - scanner can see app storage' : 'NOT FOUND - scan is blind, run INVALID'}`);
for (const h of report.controlHits.slice(0, 3)) console.log(`  control at ${h.where} [${h.enc}]`);
console.log(`RECOVERED: ${findings.length}`);
const seen = new Set();
for (const h of findings) { const k = `${h.label}|${h.where}|${h.enc}`; if (seen.has(k)) continue; seen.add(k); console.log(`  !! ${h.label} in ${h.where} [${h.enc}] @${h.offset}`); }
process.exit(!controlFound ? 2 : findings.length ? 1 : 0);
