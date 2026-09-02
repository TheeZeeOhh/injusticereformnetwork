#!/usr/bin/env node
// cli.js — IRNL command line. Runs under plain Node (no bundler).
//
//   node src/irnl/cli.js check          validate the spec; exit 1 on error,
//                                       exit 2 on a weakened invariant
//   node src/irnl/cli.js build          regenerate the TS / Rust / Python types
//   node src/irnl/cli.js build --check  verify generated files are up to date
//                                       (for CI: fails if someone edited the
//                                       spec without regenerating)
//
// Output is deliberately plain text, no ANSI: this runs in the commit hook and
// in CI logs far more often than it runs in a terminal.
//
// This is the only module in src/irnl/ that touches the filesystem.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './compile.js';
import { TARGETS } from './codegen/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SPEC_PATH = resolve(HERE, 'spec/irn.irn');

function readSpec() {
  if (!existsSync(SPEC_PATH)) {
    console.error(`error: canonical spec not found at ${relative(ROOT, SPEC_PATH)}`);
    process.exit(1);
  }
  return readFileSync(SPEC_PATH, 'utf8');
}

function report(errors, warnings) {
  for (const e of errors) console.error(`  error    line ${e.line}: ${e.message}`);
  for (const w of warnings) console.error(`  warning  line ${w.line}: ${w.message}`);
}

function cmdCheck() {
  const { errors, warnings } = compile(readSpec(), { strict: false });
  report(errors, warnings);
  if (errors.length) {
    console.error(`\nFAIL: ${errors.length} error(s) - the spec is malformed.`);
    process.exit(1);
  }
  if (warnings.length) {
    // A warning means a core invariant was weakened. That is a deliberate,
    // signed-off act (CLAUDE.md), never an accident - so it fails CI too, with
    // a distinct exit code so a human can tell the two cases apart.
    console.error(`\nFAIL: ${warnings.length} weakened invariant(s) - needs explicit sign-off.`);
    process.exit(2);
  }
  console.log(`OK: ${relative(ROOT, SPEC_PATH)} - 0 errors, 0 weakened invariants.`);
}

function cmdBuild(checkOnly) {
  const { program, errors } = compile(readSpec(), { strict: false });
  if (errors.length) {
    report(errors, []);
    console.error('\nFAIL: refusing to generate from a spec with errors.');
    process.exit(1);
  }

  let stale = 0;
  for (const [name, target] of Object.entries(TARGETS)) {
    const outPath = resolve(ROOT, target.path);
    const next = target.emit(program);
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;

    if (checkOnly) {
      if (current !== next) {
        stale += 1;
        console.error(`  stale      ${target.path} (${name})`);
      }
      continue;
    }
    if (current === next) {
      console.log(`  unchanged  ${target.path}`);
      continue;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, next, 'utf8');
    console.log(`  wrote      ${target.path} (${name})`);
  }

  if (checkOnly) {
    if (stale) {
      console.error(`\nFAIL: ${stale} generated file(s) out of date - run: node src/irnl/cli.js build`);
      process.exit(1);
    }
    console.log('OK: generated files match the spec.');
  }
}

const [, , command, ...flags] = process.argv;
switch (command) {
  case 'check':
    cmdCheck();
    break;
  case 'build':
    cmdBuild(flags.includes('--check'));
    break;
  default:
    console.error('usage: node src/irnl/cli.js <check | build [--check]>');
    process.exit(1);
}
