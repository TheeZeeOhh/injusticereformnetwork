// Conformance test for os/apps/manifest.json — the IRN OS app manifest.
//
// WHY THIS TEST EXISTS: the manifest is read by five other things (the stager,
// the chroot hook, the irn-app launcher, the app store and the desktop menu).
// A field that is wrong here is wrong in five places at once, and the way you
// find out is at boot, on a USB stick, in a room where nobody has a laptop. The
// manifest is a declaration; this file is the enforcement, exactly the way
// src/irnl/conformance.test.js enforces src/irnl/spec/irn.irn.
//
// WHY IT LIVES UNDER src/ AND NOT UNDER os/: vitest.config.js sets
//   include: ['src/**/*.test.js']
// so a test written next to the manifest would never run. A conformance test
// that is not in the test run is decoration. It lives where the runner looks.
//
// THE ONE THAT MATTERS IS THE EGRESS CROSS-CHECK (block 5). Everything else here
// is shape-checking that stops a typo from becoming a broken launcher. Block 5
// is a guardrail: it reads each app's real dependency list off disk and refuses
// to let an entry claim `network.required: false` while carrying a cloud SDK.
// You cannot quietly add @supabase to an app and keep the reassuring label.
//
// DEFAULT CLOSED, like everything else in this codebase. An unknown `type`
// fails. A missing required key fails. A dependency match with no declaration
// fails. The one escape hatch — `dep_exceptions` — is itself self-expiring
// (block 5b), so it cannot quietly rot into a permanent pardon.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'os', 'apps', 'manifest.json');

const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');

// ---------------------------------------------------------------------------
// The contract, restated as data.
//
// These tables ARE the schema. Adding a type means adding a row here and a
// section to os/apps/README.md — not sprinkling an `if` into a consumer.
// ---------------------------------------------------------------------------

// An id becomes a directory name under /opt/irn-apps, a URL component in the
// launcher, and a .desktop filename. Lowercase-alnum-and-dashes keeps it safe
// as all three at once, and the leading-character rule stops "-foo", which
// getopt-style parsers read as a flag.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// Keys every entry carries, whatever its type.
const COMMON_KEYS = [
  'id',
  'name',
  'summary',
  'src',
  'type',
  'launch',
  'terminal',
  'icon',
  'categories',
  'keywords',
  'store_category',
  'network'
];

// Keys each type additionally requires. Anything not listed is a hard failure:
// an unrecognised type means a consumer would have to guess how to stage and
// launch it, and a guess in a build script is a bug with a delay fuse.
const REQUIRED_BY_TYPE = {
  'web-static': ['build', 'dist'],
  'node-service': ['build', 'dist', 'server'],
  'node-cli': ['entry', 'bin'],
  'python-cli': ['entry', 'bin'],
  // A native desktop GUI written in Python — a window, not a command. It needs
  // an `entry` to exec and nothing else: no build step, no dist directory, and
  // deliberately no `bin`, because nothing puts it on $PATH. It is NOT
  // python-cli: that type carries terminal:true, which would make the menu
  // entry open a terminal emulator inside a terminal emulator.
  'python-gui': ['entry'],
  webext: ['ext_id']
};

// Types the irn-app launcher opens in a window. These and only these carry the
// `irn-app <id>` launch line; see block 4 for why that sameness is enforced.
const GUI_TYPES = ['web-static', 'node-service', 'python-gui'];
const CLI_TYPES = ['node-cli', 'python-cli'];

// The declared vocabulary for "what does this app put on the wire". Free text
// here would defeat the point — the store cannot warn about a value it has
// never seen.
//   none     — nothing leaves the process.
//   queries  — text the operator typed or opened goes to a local model or a
//              LAN peer, or could reach a remote API only if the operator
//              supplies a credential themselves.
//   casework — client- or case-derived data reaches a third party. This is the
//              label that earns a warning in the store.
const SENDS_VALUES = ['none', 'queries', 'casework'];

// Dependency names that mean "this package talks to somebody else's server".
// Presence of any of these in package.json is treated as evidence of egress
// until an entry proves otherwise — the burden is on the claim of safety, not
// on the accusation.
//
// Matched as prefixes so that @supabase/ssr, @supabase/supabase-js and any
// future @anthropic-ai/* are all caught without maintaining a list of leaves.
const EGRESS_DEPS = [
  '@supabase/',
  'googleapis',
  '@notionhq/',
  '@google/generative-ai',
  'openai',
  '@anthropic-ai/'
];

// A key by any of these names would make an app start on its own. Block 6
// forbids that on anything that phones out; see there for why.
const AUTOSTART_KEY_RE = /autostart|^startup$/i;

const manifest = JSON.parse(raw);
const apps = manifest.apps;

/** `~/Projects/foo` -> `/home/you/Projects/foo`. The manifest stores `~` paths
 *  because it is read on machines with different usernames; only this test and
 *  the stager ever resolve them. */
function resolveSrc(src) {
  if (src.startsWith('~/')) return path.join(os.homedir(), src.slice(2));
  return src;
}

/** The app's package.json, or null when the source tree or the file is absent.
 *  Null means SKIP, never FAIL — see the note on block 5. */
function readPackageJson(app) {
  const pkgPath = path.join(resolveSrc(app.src), 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Every declared dependency name, runtime and dev alike. devDependencies count
 *  because a build-time SDK still had the credentials and still shaped the
 *  bundle — "it's only a devDependency" is not a network claim. */
function declaredDeps(pkg) {
  return Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
}

function egressDepsIn(pkg) {
  return declaredDeps(pkg).filter((name) => EGRESS_DEPS.some((p) => name.startsWith(p)));
}

// ---------------------------------------------------------------------------

describe('os/apps/manifest.json', () => {
  // 1. It parses and it is the version the consumers were written against.
  //
  // The version is not decoration. When a consumer meets version 2 it must
  // stop rather than misread a renamed field, so bumping this number is a
  // deliberate act that breaks this assertion first.
  describe('document', () => {
    it('is valid JSON', () => {
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('is version 1', () => {
      expect(manifest.version).toBe(1);
    });

    it('has an apps array and an excluded array', () => {
      expect(Array.isArray(manifest.apps)).toBe(true);
      expect(manifest.apps.length).toBeGreaterThan(0);
      expect(Array.isArray(manifest.excluded)).toBe(true);
    });
  });

  // 2. Ids: unique, and shaped like something you can safely put in a path.
  //
  // Duplicate ids are the nastiest failure mode in this file because nothing
  // errors — the second entry simply overwrites the first in whatever map a
  // consumer builds, and one app silently vanishes from the menu.
  describe('ids', () => {
    it('every id matches the id grammar', () => {
      for (const app of apps) {
        expect(app.id, `id ${JSON.stringify(app.id)}`).toMatch(ID_RE);
      }
    });

    it('every id is unique', () => {
      const ids = apps.map((a) => a.id);
      expect(new Set(ids).size, `duplicate id in [${ids.join(', ')}]`).toBe(ids.length);
    });

    it('no app id collides with an excluded id', () => {
      // An entry in both lists means somebody moved an app and only did half
      // the job. Whichever list a consumer reads first wins, which is not a
      // decision anyone made on purpose.
      const appIds = new Set(apps.map((a) => a.id));
      for (const ex of manifest.excluded) {
        expect(appIds.has(ex.id), `${ex.id} is in both apps and excluded`).toBe(false);
      }
    });
  });

  // 3. Required keys per type; unknown types are rejected outright.
  describe('shape', () => {
    it('every app declares a known type', () => {
      for (const app of apps) {
        expect(
          Object.keys(REQUIRED_BY_TYPE),
          `${app.id} has type ${JSON.stringify(app.type)}`
        ).toContain(app.type);
      }
    });

    it('every app carries the common keys', () => {
      for (const app of apps) {
        for (const key of COMMON_KEYS) {
          // `launch` is legitimately null for a webext (see block 4), so test
          // for presence of the key rather than truthiness of the value.
          expect(
            Object.prototype.hasOwnProperty.call(app, key),
            `${app.id} is missing "${key}"`
          ).toBe(true);
        }
      }
    });

    it('every app carries the keys its type requires', () => {
      for (const app of apps) {
        for (const key of REQUIRED_BY_TYPE[app.type] || []) {
          expect(app[key], `${app.id} (${app.type}) needs "${key}"`).toBeTruthy();
        }
      }
    });

    it('descriptive fields are the right kind of thing', () => {
      for (const app of apps) {
        expect(typeof app.name, `${app.id}.name`).toBe('string');
        expect(app.name.length, `${app.id}.name is empty`).toBeGreaterThan(0);
        expect(typeof app.summary, `${app.id}.summary`).toBe('string');
        // A one-word summary is a placeholder. The store shows this text to an
        // operator deciding whether to trust the app; make it say something.
        expect(app.summary.length, `${app.id}.summary is too short`).toBeGreaterThan(20);
        expect(typeof app.terminal, `${app.id}.terminal`).toBe('boolean');
        expect(typeof app.icon, `${app.id}.icon`).toBe('string');
        expect(app.icon.length, `${app.id}.icon is empty`).toBeGreaterThan(0);
        expect(Array.isArray(app.categories), `${app.id}.categories`).toBe(true);
        expect(app.categories.length, `${app.id}.categories is empty`).toBeGreaterThan(0);
        expect(Array.isArray(app.keywords), `${app.id}.keywords`).toBe(true);
        expect(app.keywords.length, `${app.id}.keywords is empty`).toBeGreaterThan(0);
        expect(typeof app.store_category, `${app.id}.store_category`).toBe('string');
        expect(app.store_category.length, `${app.id}.store_category`).toBeGreaterThan(0);
        if ('generic' in app) {
          expect(typeof app.generic, `${app.id}.generic`).toBe('string');
        }
      }
    });

    it('src is a ~-relative host path', () => {
      // Absolute paths would bake one machine's home directory into the image
      // build; a bare relative path would be resolved against whatever
      // directory the stager happens to run from.
      for (const app of apps) {
        expect(app.src, `${app.id}.src`).toMatch(/^~\//);
      }
    });

    it('terminal is true for CLIs and false for everything else', () => {
      // The desktop entry's Terminal= line comes straight from this. A CLI with
      // Terminal=false launches, prints to nowhere and exits: from the menu it
      // looks like clicking the icon did nothing at all.
      for (const app of apps) {
        expect(app.terminal, `${app.id} (${app.type}).terminal`).toBe(CLI_TYPES.includes(app.type));
      }
    });

    it('the network block is well formed', () => {
      for (const app of apps) {
        const n = app.network;
        expect(typeof n, `${app.id}.network`).toBe('object');
        expect(typeof n.required, `${app.id}.network.required`).toBe('boolean');
        expect(SENDS_VALUES, `${app.id}.network.sends`).toContain(n.sends);
        expect(Array.isArray(n.services), `${app.id}.network.services`).toBe(true);
        // The note is where the evidence goes — file and line, so the next
        // reader can re-verify the claim instead of re-deriving it.
        expect(typeof n.note, `${app.id}.network.note`).toBe('string');
        expect(n.note.length, `${app.id}.network.note is too short`).toBeGreaterThan(20);
      }
    });

    it('an app that sends nothing names no services', () => {
      for (const app of apps) {
        if (app.network.sends === 'none') {
          expect(app.network.services, `${app.id} sends none but names services`).toEqual([]);
        }
      }
    });

    it('every excluded entry says who it is and why', () => {
      // The excluded list is the whole reason nobody re-audits ~/Dev/tools every
      // six months. An entry with no reason does not do that job.
      for (const ex of manifest.excluded) {
        expect(ex.id, 'excluded entry needs an id').toMatch(ID_RE);
        expect(typeof ex.src, `excluded ${ex.id}.src`).toBe('string');
        expect(typeof ex.reason, `excluded ${ex.id}.reason`).toBe('string');
        expect(ex.reason.length, `excluded ${ex.id}.reason is too short`).toBeGreaterThan(20);
      }
    });
  });

  // 4. The launch line.
  //
  // WHY GUI APPS ALL SHARE ONE LAUNCHER: `irn-app <id>` is a single choke point
  // that resolves the install path, picks a free port, starts a service if the
  // type needs one, and opens the window. If entries were allowed to write
  // their own command lines, that policy would be copy-pasted ten times and
  // would diverge on the first app that needed something slightly different.
  // The id must match the entry's own id, because `irn-app equityguard` on the
  // school-not-prison entry is a one-word typo that launches the wrong program.
  describe('launch', () => {
    it('GUI apps launch through irn-app with their own id', () => {
      for (const app of apps) {
        if (!GUI_TYPES.includes(app.type)) continue;
        expect(app.launch, `${app.id} (${app.type}).launch`).toBe(`irn-app ${app.id}`);
      }
    });

    it('CLI apps launch as their own bin name', () => {
      for (const app of apps) {
        if (!CLI_TYPES.includes(app.type)) continue;
        expect(app.launch, `${app.id}.launch should be its bin`).toBe(app.bin);
        expect(app.bin, `${app.id}.bin`).toMatch(ID_RE);
      }
    });

    it('a webext has no launcher', () => {
      // A browser extension has no process of its own — Firefox owns it. A
      // non-null launch here would mean somebody invented a command that does
      // not exist. Consumers key off this to skip generating a .desktop file.
      for (const app of apps) {
        if (app.type !== 'webext') continue;
        expect(app.launch, `${app.id} is a webext and must not declare a launcher`).toBeNull();
        expect(app.ext_id, `${app.id}.ext_id`).toMatch(/^[^\s@]+@[^\s@]+$/);
      }
    });
  });

  // 5. THE EGRESS CROSS-CHECK.
  //
  // A `network` block is a promise. This reads the app's actual package.json off
  // this machine and holds the promise against it: if a cloud SDK is installed,
  // the entry must either admit to egress (required + a named service) or carry
  // an explicit, justified exception naming that exact package.
  //
  // WHY MISSING SOURCES SKIP RATHER THAN FAIL: these apps live in ten separate
  // repos outside this one. A fresh clone, CI, or anybody who is not Aziza has
  // none of them on disk. A test that failed there would be red for everyone by
  // default, and a permanently-red test gets ignored — which would cost more
  // than the check is worth. Skipping keeps the check meaningful exactly where
  // it can be meaningful: on the machine that actually builds the image.
  describe('egress cross-check', () => {
    it('no app hides a cloud SDK behind network.required: false', () => {
      let checked = 0;

      for (const app of apps) {
        const pkg = readPackageJson(app);
        if (!pkg) continue; // source absent, or not a Node project at all
        checked += 1;

        const hits = egressDepsIn(pkg);
        if (hits.length === 0) continue;

        const exempted = new Set((app.dep_exceptions || []).map((e) => e.package));
        const unexplained = hits.filter((h) => !exempted.has(h));
        if (unexplained.length === 0) continue;

        // Declared egress: fine, as long as it says who it talks to. "required
        // but services: []" is a warning with no content — the store would have
        // nothing to show the operator.
        expect(
          app.network.required,
          `${app.id} declares network.required: false but depends on ` +
            `${unexplained.join(', ')}. Either set required: true and name the ` +
            `services, or add a dep_exceptions entry justifying each package.`
        ).toBe(true);

        expect(
          app.network.services.length,
          `${app.id} depends on ${unexplained.join(', ')} and is network.required, ` +
            `so network.services must name what it talks to.`
        ).toBeGreaterThan(0);
      }

      // Guard against the check silently checking nothing. If a refactor broke
      // path resolution, every app would "pass" by skipping and this suite would
      // go green while enforcing precisely zero. Suspiciously good = bugged.
      if (checked === 0) {
        console.warn(
          '[appManifest] egress cross-check inspected 0 package.json files — ' +
            'app sources are not present on this machine, so nothing was verified.'
        );
      }
    });

    // 5b. Exceptions expire on their own.
    //
    // This is what makes dep_exceptions a countdown rather than a pardon. An
    // exception is only ever justified by a package that is actually installed;
    // once the dead dependency is removed upstream, the exception is a lie about
    // the current state and this fails until somebody deletes it. After that,
    // if the dependency ever comes back, block 5 catches it because there is no
    // longer an exception covering it. Both directions are loud.
    it('every dep_exception names a package that is really still installed', () => {
      for (const app of apps) {
        if (!app.dep_exceptions) continue;
        const pkg = readPackageJson(app);
        if (!pkg) continue;

        const installed = new Set(declaredDeps(pkg));
        for (const ex of app.dep_exceptions) {
          expect(
            installed.has(ex.package),
            `${app.id} carries a dep_exception for "${ex.package}", but that ` +
              `package is no longer in its package.json. The dependency is gone: ` +
              `delete the exception.`
          ).toBe(true);
        }
      }
    });

    it('every dep_exception is shaped like a justification', () => {
      for (const app of apps) {
        if (!app.dep_exceptions) continue;
        expect(Array.isArray(app.dep_exceptions), `${app.id}.dep_exceptions`).toBe(true);
        for (const ex of app.dep_exceptions) {
          expect(typeof ex.package, `${app.id} dep_exception.package`).toBe('string');
          // An exception exempting a package that was never suspect is noise
          // that makes the real ones harder to see.
          expect(
            EGRESS_DEPS.some((p) => ex.package.startsWith(p)),
            `${app.id} exempts "${ex.package}", which is not an egress dependency`
          ).toBe(true);
          expect(typeof ex.reason, `${app.id} dep_exception.reason`).toBe('string');
          // "unused" is not a reason; it is a conclusion. The reason has to
          // carry enough evidence that the next reader can re-check it.
          expect(
            ex.reason.length,
            `${app.id} dep_exception for ${ex.package} needs a real justification`
          ).toBeGreaterThan(40);
        }
      }
    });
  });

  // 6. Nothing that phones out comes up on its own.
  //
  // Autostart plus egress is the combination that turns a machine into a beacon
  // the moment it joins a network — before the operator has decided anything.
  // An app that talks to Supabase, Notion and Google starts when a person means
  // it to start, or it does not start.
  describe('autostart', () => {
    it('no network-required app declares autostart', () => {
      for (const app of apps) {
        if (!app.network.required) continue;
        const offending = Object.keys(app).filter((k) => AUTOSTART_KEY_RE.test(k));
        expect(
          offending,
          `${app.id} is network.required and must not autostart (found: ${offending.join(', ')})`
        ).toEqual([]);
      }
    });
  });

  // 7. The exclude list.
  //
  // This is the field that keeps a 1GB vector database and a .env full of
  // credentials out of the squashfs. An empty string here is worse than a
  // missing entry: depending on how the stager joins paths, "" can match the
  // project root and exclude everything, or match nothing and exclude nothing.
  // Neither is what anyone meant.
  describe('exclude', () => {
    it('every exclude entry is a non-empty string', () => {
      for (const app of apps) {
        if (!('exclude' in app)) continue;
        expect(Array.isArray(app.exclude), `${app.id}.exclude`).toBe(true);
        for (const item of app.exclude) {
          expect(typeof item, `${app.id}.exclude has a non-string entry`).toBe('string');
          expect(item.trim().length, `${app.id}.exclude has an empty entry`).toBeGreaterThan(0);
          // An absolute path in exclude would be a host path leaking into a
          // list that is applied inside the app's own tree.
          expect(item.startsWith('/'), `${app.id}.exclude entry "${item}" is absolute`).toBe(false);
        }
      }
    });
  });

  // 8. Spot-checks that would not survive a careless edit.
  //
  // These name specific facts rather than shapes. They are here because each
  // one, if it silently changed, produces a broken or dangerous image with no
  // other symptom — and because a schema check cannot see them.
  describe('load-bearing specifics', () => {
    it('Sovereign Hivemind excludes its 1GB vector database and its .env', () => {
      // local_vector_db.json was measured at 1,007,629,647 bytes. Staging it
      // would add a gigabyte of one machine's accumulated embeddings to every
      // ISO. The .env sits next to an app that imports a Google AI SDK and is
      // treated as a credential.
      const hivemind = apps.find((a) => a.id === 'hivemind');
      expect(hivemind, 'hivemind entry is missing').toBeTruthy();
      expect(hivemind.exclude).toContain('local_vector_db.json');
      expect(hivemind.exclude).toContain('.env');
    });

    it('IRN OS Console still declares the cloud services it talks to', () => {
      // The one genuinely networked app in the roster. If this ever reads as
      // local-first, the store stops warning about it.
      const console_ = apps.find((a) => a.id === 'irn-os-console');
      expect(console_, 'irn-os-console entry is missing').toBeTruthy();
      expect(console_.network.required).toBe(true);
      expect(console_.network.sends).toBe('casework');
      expect(console_.network.services.length).toBeGreaterThan(0);
    });

    it('only the two signed-off apps send casework off the device', () => {
      // The Technical Incapacity Defense is the point of the project. A third
      // app quietly acquiring `sends: casework` is exactly the drift this file
      // exists to catch — it should require editing this assertion by hand.
      //
      // THIS LIST WAS EDITED ONCE, DELIBERATELY, AND THE EDIT IS THE AUDIT TRAIL:
      //
      //   2026-09-06 — sanctuary-terminal added, with Aziza's explicit sign-off.
      //   Its antigravity_selection() action pipes the selected text of a pane
      //   into `agy -p`, which is Google's Antigravity agent. Two gates stand in
      //   front of it (redaction mode must be ON, default-closed; the selection
      //   is passed through redact_text() first) and the image ships no agy
      //   binary — but regex redaction does not mask names or narrative prose,
      //   so what reaches Google can still be client-derived. Declaring it
      //   'queries' would have been the comfortable answer and the false one.
      //
      // Adding a third id here is not a formality. It means a new path off the
      // device exists; say who signed off and what gates it, as above.
      const senders = apps.filter((a) => a.network.sends === 'casework').map((a) => a.id);
      expect(senders.sort()).toEqual(['irn-os-console', 'sanctuary-terminal']);
    });
  });
});
