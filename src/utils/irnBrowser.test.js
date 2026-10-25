/**
 * IRN Browser — guardrail tests for the hardened-Firefox assets.
 *
 * These files live under `os/config/includes.chroot/`, not under `src/`. The
 * test lives here because vitest.config.js includes `src/ **\/*.test.js`, and
 * putting it in the existing gate is the whole point: the browser's posture is
 * asserted in writing in BROWSER.md, on the command center's posture panel and
 * in the README, and a silent edit to policies.json would make all three lie.
 *
 * What is checked is deliberately narrow: the claims we publish. This cannot
 * verify that Firefox APPLIED any of it — only `about:policies` on a running
 * browser can, which is why BROWSER.md marks that as a separate step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const share = (f) =>
  readFileSync(new URL(`../../os/config/includes.chroot/usr/local/share/irn-browser/${f}`, import.meta.url), 'utf8');
const bin = (f) =>
  readFileSync(new URL(`../../os/config/includes.chroot/usr/local/bin/${f}`, import.meta.url), 'utf8');

const policies = JSON.parse(share('policies.json')).policies;
const cfg = share('mozilla.cfg');
const newtab = share('newtab.html');

describe('policies.json — the posture we publish', () => {
  it('turns off every telemetry and account channel', () => {
    for (const k of ['DisableTelemetry', 'DisableFirefoxStudies', 'DisableFeedbackCommands',
                     'DisableFirefoxAccounts', 'DisablePocket', 'DisableFormHistory']) {
      expect(policies[k], k).toBe(true);
    }
    expect(policies.FirefoxSuggest.WebSuggestions).toBe(false);
    expect(policies.FirefoxSuggest.SponsoredSuggestions).toBe(false);
    expect(policies.SearchSuggestEnabled).toBe(false);
    expect(policies.NetworkPrediction).toBe(false);
  });

  it('forces HTTPS and locked encrypted DNS to Quad9', () => {
    expect(policies.HttpsOnlyMode).toBe('force_enabled');
    expect(policies.DNSOverHTTPS.Enabled).toBe(true);
    expect(policies.DNSOverHTTPS.Locked).toBe(true);
    expect(policies.DNSOverHTTPS.ProviderURL).toMatch(/^https:\/\/dns\.quad9\.net\//);
  });

  it('locks strict tracking protection including fingerprinting', () => {
    expect(policies.EnableTrackingProtection.Value).toBe(true);
    expect(policies.EnableTrackingProtection.Locked).toBe(true);
    expect(policies.EnableTrackingProtection.Cryptomining).toBe(true);
    expect(policies.EnableTrackingProtection.Fingerprinting).toBe(true);
    expect(policies.Cookies.Behavior).toBe('reject-tracker-and-partition-foreign');
  });

  it('stores no credentials and prompts before anything hits disk', () => {
    expect(policies.PasswordManagerEnabled).toBe(false);
    expect(policies.OfferToSaveLogins).toBe(false);
    expect(policies.PromptForDownloadLocation).toBe(true);
  });

  it('refuses OS-injected enterprise roots (no silent TLS interception)', () => {
    expect(policies.Certificates.ImportEnterpriseRoots).toBe(false);
  });

  it('blocks camera, mic, location and notifications from even prompting', () => {
    for (const k of ['Camera', 'Microphone', 'Location', 'Notifications']) {
      expect(policies.Permissions[k].BlockNewRequests, k).toBe(true);
    }
  });

  it('opens on a local file, never a network home page', () => {
    expect(policies.Homepage.URL).toMatch(/^file:\/\//);
    expect(policies.OverrideFirstRunPage).toBe('');
    expect(policies.OverridePostUpdatePage).toBe('');
  });

  it('only ever fetches add-ons from addons.mozilla.org, except our own root-owned guard', () => {
    // The one exception is deliberate (2026-10-18): the IRN paste guard is ours,
    // unsigned, and installed from a path only root can write. Nothing else may
    // come from anywhere but AMO.
    for (const [id, v] of Object.entries(policies.ExtensionSettings)) {
      if (!v.install_url) continue;
      if (id === 'paste-guard@irn.local') {
        expect(v.install_url).toBe('file:///usr/local/lib/irn-browser/paste-guard.xpi');
      } else {
        expect(v.install_url, id).toMatch(/^https:\/\/addons\.mozilla\.org\//);
      }
    }
  });

  it('says in writing what turning off add-on signatures costs', () => {
    const at = cfg.indexOf('lockPref("xpinstall.signatures.required", false);');
    expect(at).toBeGreaterThan(0);
    expect(cfg.slice(Math.max(0, at - 700), at)).toMatch(/EVERY add-on/);
  });

  it('keeps the HTTPS-only exception list empty in the shipped policy', () => {
    // Per-box exceptions come from ~/.config/irn-browser/http-allowlist.txt at
    // install time; the image itself trusts no plain-HTTP origin.
    expect(policies.HttpAllowlist).toEqual([]);
    expect(policies.HttpsOnlyMode).toBe('force_enabled');
  });

  it('ships every bundled search engine over https', () => {
    const engines = policies.SearchEngines.Add;
    expect(engines.length).toBeGreaterThan(0);
    for (const e of engines) {
      expect(e.URLTemplate, e.Name).toMatch(/^https:\/\//);
      expect(e.URLTemplate, e.Name).toContain('{searchTerms}');
      expect(e.Alias, e.Name).toBeTruthy();
    }
    // Aliases are what you type; a duplicate silently shadows an engine.
    const aliases = engines.map((e) => e.Alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('never bookmarks the bare theezeeohh.github.io apex (it 404s)', () => {
    // There is no TheeZeeOhh/theezeeohh.github.io user-site repo — every Pages
    // site is a PROJECT page, so the apex has nothing to serve and returns 404.
    // It was bookmarked as "IRN site" and linked from the command center until
    // 2026-08-29. Project pages need the /<repo>/ path.
    const walk = (nodes) => nodes.flatMap((n) =>
      n.children ? walk(n.children) : (n.url ? [n.url] : []));
    for (const u of walk(policies.ManagedBookmarks)) {
      expect(u, u).not.toMatch(/^https:\/\/theezeeohh\.github\.io\/?$/);
    }
    expect(newtab).not.toMatch(/href="https:\/\/theezeeohh\.github\.io\/?"/);
  });

  it('gives every published GitHub Pages site its own bookmark', () => {
    const folder = policies.ManagedBookmarks.find(
      (n) => n.name === 'Published sites (GitHub Pages)');
    expect(folder, 'Pages folder must exist').toBeTruthy();
    const urls = folder.children.map((c) => c.url);
    expect(urls).toEqual([
      'https://theezeeohh.github.io/injusticereformnetwork/',
      'https://theezeeohh.github.io/irn-criminal-injustice/',
      'https://theezeeohh.github.io/irn-prompt-library/',
      'https://theezeeohh.github.io/sanctuary/',
    ]);
    // Project pages must keep the trailing /<repo>/ path.
    for (const u of urls) expect(u, u).toMatch(/github\.io\/[^/]+\/$/);
  });

  it('points every managed bookmark somewhere safe', () => {
    const walk = (nodes) => nodes.flatMap((n) =>
      n.children ? walk(n.children) : (n.url ? [n.url] : []));
    const urls = walk(policies.ManagedBookmarks);
    expect(urls.length).toBeGreaterThan(10);
    for (const u of urls) {
      expect(u, u).toMatch(/^(https:\/\/|file:\/\/|about:|http:\/\/localhost)/);
    }
  });
});

describe('mozilla.cfg — autoconfig', () => {
  it('starts with a comment (Firefox silently drops the first line)', () => {
    expect(cfg.split('\n')[0].trimStart().startsWith('//')).toBe(true);
  });

  it('locks the privacy prefs the posture panel claims', () => {
    for (const p of ['privacy.globalprivacycontrol.enabled',
                     'dom.security.https_only_mode',
                     'network.IDN_show_punycode',
                     'privacy.query_stripping.enabled',
                     'signon.rememberSignons',
                     'pdfjs.enableScripting']) {
      expect(cfg, p).toMatch(new RegExp(`^lockPref\\("${p.replace(/\./g, '\\.')}"`, 'm'));
    }
  });

  it('keeps the HTTP cache out of the filesystem', () => {
    expect(cfg).toMatch(/^lockPref\("browser\.cache\.disk\.enable", false\);/m);
    expect(cfg).toMatch(/^lockPref\("browser\.sessionstore\.privacy_level", 2\)/m);
  });

  it('uses only lockPref/defaultPref (a bare pref() here does nothing)', () => {
    const calls = cfg.match(/^\s*(\w+)\(/gm) || [];
    for (const c of calls) {
      expect(c.trim(), c).toMatch(/^(lockPref|defaultPref)\($/);
    }
  });
});

describe('newtab.html — the offline command center', () => {
  it('loads no external subresources', () => {
    expect(newtab).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(newtab).not.toMatch(/<link[^>]+href=/i);
    expect(newtab).not.toMatch(/<img\b/i);
    expect(newtab).not.toMatch(/@import/i);
    expect(newtab).not.toMatch(/url\(\s*['"]?https?:/i);
  });

  it('makes no network calls and keeps no storage', () => {
    // Scope this to the actual <script> body. The prose above and below it
    // *names* localStorage in order to promise the page does not use it, so
    // scanning the whole document would fail on its own documentation.
    // Strip HTML comments first — the header comment mentions "<script>" in
    // prose, and matching from there would swallow the whole document.
    const body = newtab.replace(/<!--[\s\S]*?-->/g, '');
    const scripts = [...body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1]).join('\n');
    expect(scripts.length).toBeGreaterThan(0);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'localStorage',
                       'sessionStorage', 'document.cookie', 'indexedDB']) {
      expect(scripts, bad).not.toContain(bad);
    }
  });

  it('keeps every generator slot present and unique', () => {
    for (const slot of ['DATE', 'POSTURE', 'ZEE', 'PASSAGE']) {
      const open = (newtab.match(new RegExp(`<!--IRN:SLOT:${slot}-->`, 'g')) || []).length;
      const close = (newtab.match(new RegExp(`<!--/IRN:SLOT:${slot}-->`, 'g')) || []).length;
      expect(open, slot).toBe(1);
      expect(close, slot).toBe(1);
    }
  });

  it('keeps its search keywords in step with the policy engines', () => {
    for (const e of policies.SearchEngines.Add) {
      expect(newtab, `alias ${e.Alias}`).toMatch(new RegExp(`\\b${e.Alias}\\s*:`));
    }
  });
});

describe('irn-browser / irn-zee — the launcher contract', () => {
  const wrapper = bin('irn-browser');
  const zee = bin('irn-zee');

  it('keeps burner profiles in RAM and deletes them on exit', () => {
    expect(wrapper).toMatch(/XDG_RUNTIME_DIR:-\/dev\/shm/);
    expect(wrapper).toMatch(/trap 'rm -rf "\$prof"/);
  });

  it('offers every documented session mode', () => {
    for (const flag of ['--ephemeral', '--tor', '--kiosk', '--capture',
                        '--doctor', '--panic', '--ask', '--list-profiles']) {
      expect(wrapper, flag).toContain(flag);
    }
  });

  it('never exposes the Operator (filesystem agent tools) to the browser', () => {
    // Strip the module docstring and comments first: the docstring explains at
    // length that .operate() is deliberately NOT wired up, and a naive scan
    // would trip over that explanation.
    const code = zee
      .replace(/^#![^\n]*\n/, '')
      .replace(/"""[\s\S]*?"""/, '')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(code).not.toMatch(/\.operate\s*\(/);
    expect(code).not.toMatch(/\bimport zee_tools\b/);
    // It also never builds a Brain, which is what would pull the tools in.
    expect(code).not.toMatch(/\bBrain\s*\(/);
  });

  it('treats Ollama ":cloud" endpoints as off-device, not just claude/gemini', () => {
    // The trap this guards: an Ollama ":cloud" model runs on Ollama's servers
    // and reports a 0-byte size, so a naive "fits in VRAM?" check ranks it
    // FIRST. On the dev box 15 of 33 installed models were :cloud.
    const m = zee.match(/CLOUD_RE = re\.compile\(r"([^"]+)"/);
    expect(m, 'CLOUD_RE must exist').toBeTruthy();
    const re = new RegExp(m[1].replace(/\(\?i\)/, ''), 'i');
    for (const bad of ['glm-5:cloud', 'kimi-k2.5:cloud', 'minimax-m2:cloud',
                       'qwen3.5:cloud', 'gemini-3-flash-preview:cloud',
                       'claude-opus-5', 'gemini-2.0']) {
      expect(re.test(bad), `${bad} must be refused`).toBe(true);
    }
    for (const good of ['llama3.2:latest', 'qwen3:4b', 'ai-twin-custom:latest',
                        'mistral:7b-instruct-v0.3-q4_K_M']) {
      expect(re.test(good), `${good} must be allowed`).toBe(false);
    }
  });

  it('never auto-selects an embedding or vision model for chat', () => {
    const m = zee.match(/NON_CHAT_RE = re\.compile\(r"([^"]+)"/);
    expect(m).toBeTruthy();
    const re = new RegExp(m[1].replace(/\\\\/g, '\\'), 'i');
    for (const bad of ['moondream:latest', 'llava:latest', 'nomic-embed-text:latest']) {
      expect(re.test(bad), `${bad} is not a chat model`).toBe(true);
    }
    expect(re.test('llama3.2:latest')).toBe(false);
  });

  it('refuses cloud models by default so prompts stay on the device', () => {
    expect(zee).toMatch(/claude\|gemini/);
    expect(zee).toContain('IRN_ZEE_ALLOW_CLOUD');
    // The guard must actually be called on every generation path.
    expect((zee.match(/guard_model\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

const browserPath = fileURLToPath(new URL('../../os/config/includes.chroot/usr/local/bin/irn-browser', import.meta.url));
const zeePath = fileURLToPath(new URL('../../os/config/includes.chroot/usr/local/bin/irn-zee', import.meta.url));

describe('--require-vpn counts real tunnels only', () => {
  // A fake /sys/class/net: one directory per interface with an operstate file.
  const vpn = (ifaces, env = {}) => {
    const net = mkdtempSync(join(tmpdir(), 'irn-net-'));
    for (const [name, state] of Object.entries(ifaces)) {
      mkdirSync(join(net, name));
      writeFileSync(join(net, name, 'operstate'), state + '\n');
    }
    const r = spawnSync('sh', ['-c', `. "${browserPath}"; vpn_up && echo "$VPN_FOUND"`], {
      env: { PATH: process.env.PATH, HOME: tmpdir(), IRN_BROWSER_LIB: '1', IRN_SYS_NET: net, ...env },
      encoding: 'utf8',
    });
    return r.status === 0 ? r.stdout.trim() : null;
  };

  it('does not mistake Proton\'s kill switch or leak guard for a tunnel', () => {
    expect(vpn({ lo: 'unknown', wlo1: 'up', pvpnksintrf0: 'unknown', ipv6leakintrf0: 'unknown' })).toBe(null);
  });

  it('accepts Proton WireGuard, OpenVPN, irn-vpn and other wg tunnels', () => {
    expect(vpn({ wlo1: 'up', proton0: 'unknown' })).toBe('proton0');
    expect(vpn({ tun0: 'unknown' })).toBe('tun0');
    expect(vpn({ 'irn-vpn': 'unknown' })).toBe('irn-vpn');
    expect(vpn({ wg0: 'up' })).toBe('wg0');
  });

  it('treats a tunnel that is down as no tunnel', () => {
    expect(vpn({ proton0: 'down' })).toBe(null);
  });

  it('accepts only the pinned interface when IRN_VPN_IFACE is set', () => {
    expect(vpn({ proton0: 'unknown' }, { IRN_VPN_IFACE: 'work0' })).toBe(null);
    expect(vpn({ work0: 'unknown' }, { IRN_VPN_IFACE: 'work0' })).toBe('work0');
  });
});

describe('Zee Zee picks a model that can answer', () => {
  const hasPython = spawnSync('python3', ['--version']).status === 0;
  const pick = (models, vram) => execFileSync('python3', ['-c', `
import importlib.machinery, importlib.util, json, sys
loader = importlib.machinery.SourceFileLoader("irnzee", sys.argv[1])
spec = importlib.util.spec_from_loader("irnzee", loader)
z = importlib.util.module_from_spec(spec); loader.exec_module(z)
print(z.fallback_model(json.loads(sys.argv[2]), int(sys.argv[3])))
`, zeePath, JSON.stringify(models), String(vram)], { encoding: 'utf8' }).trim();
  const GB = 1e9;
  // As on the box this was found on: biggest first, as pick_model sorts them.
  const box = [['qwen2.5:7b', 4.7 * GB], ['llama2:latest', 3.8 * GB], ['gemma3:4b', 3.3 * GB],
               ['qwen3:4b', 2.5 * GB], ['llama3.2:latest', 2.0 * GB], ['deepseek-r1:1.5b', 1.1 * GB],
               ['qwen2.5:0.5b', 0.4 * GB]];

  it.skipIf(!hasPython)('takes the biggest current model that fits in VRAM, not the smallest', () => {
    expect(pick(box, 4.29 * GB)).toBe('gemma3:4b');
  });

  it.skipIf(!hasPython)('with no VRAM figure, takes the smallest model that is still useful', () => {
    expect(pick(box, 0)).toBe('llama3.2:latest');
  });

  it.skipIf(!hasPython)('passes over reasoning and legacy models', () => {
    expect(pick([['deepseek-r1:7b', 4.7 * GB], ['llama2:latest', 3.8 * GB], ['llama3.2', 2 * GB]], 8 * GB)).toBe('llama3.2');
  });

  it.skipIf(!hasPython)('falls back to the biggest toy only when every model is a toy', () => {
    expect(pick([['b:1b', 0.9 * GB], ['a:0.5b', 0.4 * GB]], 4 * GB)).toBe('b:1b');
  });
});

describe('evidence capture — the outside services are opt-in', () => {
  const wrapper = bin('irn-browser');
  const capture = wrapper.slice(wrapper.indexOf('capture_evidence() {'), wrapper.indexOf('# Doctor'));

  it('sends the timestamp authority a digest of SHA256SUMS and nothing else', () => {
    expect(capture).toContain('openssl ts -query -data "$dir/SHA256SUMS"');
    expect(capture).toMatch(/--data-binary "@\$dir\/SHA256SUMS\.tsq"/);
    // The timestamp is taken after the artifacts are hashed, so it covers them.
    expect(capture.indexOf('sha256sum -- * > SHA256SUMS')).toBeLessThan(capture.indexOf('openssl ts -query'));
  });

  it('never contacts the Wayback Machine unless asked, not even with --full', () => {
    expect(capture).toMatch(/--full\)\s+want_warc=1; want_tsa=1; shift ;;/);
    expect(capture).toContain('want_wb=0');
    expect(capture).toMatch(/if \[ "\$want_wb" = 1 \]; then/);
  });

  it('states what a timestamp and a Wayback copy do and do not prove', () => {
    expect(capture).toMatch(/does not prove what the server sent/);
    expect(capture).toMatch(/independent of this machine and can differ/);
  });
});

describe('install-irn-browser.sh', () => {
  const inst = readFileSync(new URL('../../install-irn-browser.sh', import.meta.url), 'utf8');

  it('hardens every Firefox on the box, not just the first one found', () => {
    expect(inst).toMatch(/for cand in firefox-esr firefox; do/);
    expect(inst).toMatch(/for ff in \$FF_ALL; do/);
  });

  it('installs the paste guard root-owned at the path the policy names', () => {
    expect(inst).toContain('sudo install -Dm644 "$TMP_XPI" /usr/local/lib/irn-browser/paste-guard.xpi');
  });

  it('makes IRN Browser the default browser', () => {
    expect(inst).toContain('xdg-settings set default-web-browser irn-browser.desktop');
  });
});

describe('Zee Zee is actually Zee Zee', () => {
  const zee = bin('irn-zee');

  it('loads the real persona instead of hand-rolling one', () => {
    // zee_persona.py was made Qt-free specifically so bridges could import it:
    // "One copy, two consumers -- duplicating ~9KB of prompt would guarantee
    // the two drift apart." An earlier version of this bridge did exactly that
    // and lost the crisis floor, the register drop and the injection boundary.
    expect(zee).toContain('import zee_persona');
    expect(zee).toContain('zee_persona.DEFAULT_SYSTEM_PROMPT');
    expect(zee).not.toContain('PREAMBLE');
  });

  it('appends the same trained traits the desktop widget does', () => {
    expect(zee).toContain('twin_personality.json');
    expect(zee).toContain('persona_traits');
    expect(zee).toContain('Trained Personality Rules');
  });

  it('recalls only curated facts, never raw chat turns', () => {
    // MemoryStore.search's 2026-08-16 incident: searching kind="turn" served
    // unrelated noise back as "what you remember about the user".
    const fn = zee.slice(zee.indexOf('def recall('), zee.indexOf('def build_prompt('));
    expect(fn).toContain('kind="fact"');
    expect(fn).not.toContain('kind="turn"');
  });

  it('assembles every prompt in one place so the modes cannot drift', () => {
    expect(zee).toContain('def build_prompt(');
    // ask, page and the sidebar must all go through it.
    expect((zee.match(/build_prompt\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('tells her page text is untrusted data, not instructions', () => {
    expect(zee).toContain('BROWSER_CONTEXT');
    expect(zee).toMatch(/DATA, not instructions/);
    expect(zee).toContain('untrusted data, not instructions');
  });

  it('degrades to an honest assistant if the twin is not installed', () => {
    // A missing persona must not be an error — IRN OS may lack /opt/zee-zee.
    const fn = zee.slice(zee.indexOf('def load_persona('), zee.indexOf('def recall('));
    expect(fn).toContain('except Exception');
    expect(fn).toContain('parts.append(BROWSER_CONTEXT)');
  });
});

describe('Zee Zee sidebar server', () => {
  const zee = bin('irn-zee');

  it('binds loopback only, never a routable address', () => {
    expect(zee).toContain('_Server(("127.0.0.1", port)');
    expect(zee).not.toMatch(/"0\.0\.0\.0"|'0\.0\.0\.0'/);
  });

  it('enforces the CSRF check on POST but not on GET', () => {
    // A top-level navigation to the sidebar is legitimately cross-site —
    // Firefox opens it with a null triggering principal. Enforcing the origin
    // check on GET blocks the very thing the server exists for.
    const get = zee.slice(zee.indexOf('def do_GET'), zee.indexOf('def do_POST'));
    const post = zee.slice(zee.indexOf('def do_POST'));
    expect(get).not.toContain('_origin_ok');
    expect(post).toContain('_origin_ok');
  });

  it('cannot be framed and loads nothing external', () => {
    expect(zee).toContain("frame-ancestors 'none'");
    expect(zee).toContain('X-Frame-Options');
    expect(zee).toContain("default-src 'none'");
    // The sidebar page is inline-only: no CDN, no fonts, no remote anything.
    const html = zee.slice(zee.indexOf('SIDEBAR_HTML'), zee.indexOf('class _Handler'));
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
  });

  it('reads the ?q= param Firefox uses to hand over a prompt', () => {
    // Firefox 153 GenAI: `const { queryParam = "q" } = chatProviders.get(p) ?? {}`
    // — a custom provider falls through to "q". That is the whole contract.
    expect(zee).toContain('URLSearchParams(location.search).get("q")');
  });

  it('is what mozilla.cfg points the native sidebar at', () => {
    const port = (zee.match(/IRN_ZEE_PORT", "(\d+)"/) || [])[1];
    expect(port, 'server must declare a default port').toBeTruthy();
    expect(cfg).toContain(`defaultPref("browser.ml.chat.provider", "http://127.0.0.1:${port}/")`);
    // hideLocalhost defaults TRUE in Firefox and hides local providers.
    expect(cfg).toContain('defaultPref("browser.ml.chat.hideLocalhost", false)');
    // HTTPS-only must not upgrade loopback, or the provider URL breaks.
    expect(cfg).toContain('lockPref("dom.security.https_only_mode.upgrade_local", false)');
  });
});
