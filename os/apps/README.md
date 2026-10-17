# The IRN OS app manifest

`manifest.json` is the single declaration of which companion apps ship in the
image, where their source lives, how each one is built, and what each one puts
on the wire. Five things read it — `os/stage-apps.sh`, the chroot hook
`os/config/hooks/live/0080-irn-apps.hook.chroot`, the `irn-app` launcher, the
app store, and the desktop menu — and `src/os/appManifest.test.js` enforces it.

Same shape as `src/irnl/spec/irn.irn`: **declare once, enforce by tests.** A
fact that lives in five places drifts, and you find out at boot, on a USB stick,
in a room where nobody has a laptop.

The conformance test lives under `src/` and not here because `vitest.config.js`
only collects `src/**/*.test.js`. A conformance test that is not in the test run
is decoration.

## Adding an app

1. Add an entry to `apps` (or to `excluded`, with a real reason — see below).
2. `npx vitest run src/os/appManifest.test.js`
3. `./os/stage-apps.sh` to copy the sources into `config/includes.chroot/`.
4. Build.

**Do not hand-edit an entry to make the test pass.** If the test is unhappy, the
image is about to be wrong. JSON has no comments, so the *why* goes in a
`_comment` array — any key starting with an underscore is documentation and
every consumer ignores it.

## Types

Every entry declares a `type`. Unknown types are a hard failure: a consumer
would otherwise have to guess how to stage and launch the app, and a guess in a
build script is a bug with a delay fuse.

| type | extra required keys | launched as | `terminal` |
|---|---|---|---|
| `web-static` | `build`, `dist` | `irn-app <id>` → local HTTP server + Firefox window | `false` |
| `node-service` | `build`, `dist`, `server` | `irn-app <id>` → node server + Firefox window | `false` |
| `node-cli` | `entry`, `bin` | its own `bin` name | `true` |
| `python-cli` | `entry`, `bin` | its own `bin` name | `true` |
| `python-gui` | `entry` | `irn-app <id>` → `python3 <entry>`, exec'd | `false` |
| `webext` | `ext_id` | nothing — Firefox owns it, `launch` must be `null` | `false` |

`terminal` is not a preference. It becomes the `Terminal=` line in the generated
`.desktop` file: a CLI with `Terminal=false` launches, prints to nowhere and
exits, which from the menu looks like clicking the icon did nothing at all.

### `python-gui`

A native desktop GUI written in Python — a window, not a command. It needs an
`entry` to exec and nothing else: no build step, no `dist`, and deliberately no
`bin`, because nothing puts it on `$PATH`.

It is emphatically **not** `python-cli`. That type carries `terminal: true`, and
filing a GUI under it would make the menu entry open a terminal emulator inside
a terminal emulator. `irn-app` `exec`s the interpreter rather than spawning it,
so no launcher process is left sitting in front of the app unreaped, and it
`chdir`s to `$HOME` first — `/opt` is read-only in the squashfs.

Runtime dependencies go in `deb_deps` as Debian package names; the chroot hook
`apt-get install`s them. Never stage a `.venv`: it is built against the host
distro's Python and points at an interpreter the image does not have.

## The `network` block

The field that matters most. IRN's whole premise is that client data does not
leave the device, and an app store that ships a cloud app next to a local-only
one launders that distinction away. So every entry states what it sends and to
whom.

- `required` — does the app need a network to do its job at all.
- `sends` — one of:
  - `none` — nothing leaves the process. Must name no services.
  - `queries` — text the operator typed or opened reaches a local model or a
    LAN peer, or could reach a remote API only if the operator supplies a
    credential themselves.
  - `casework` — client- or case-derived data reaches a third party. **This is
    the label that earns a warning in the store**, and the one the test pins by
    name in "load-bearing specifics": adding an app to that list is a deliberate
    edit with a sign-off, not a formality.
- `services` — who it talks to, named.
- `note` — the evidence, with file and line, so the next reader can re-verify
  the claim instead of re-deriving it.

The **egress cross-check** reads each app's real `package.json` off disk and
refuses to let an entry claim `required: false` while carrying a cloud SDK. The
one escape hatch, `dep_exceptions`, is self-expiring: an exception naming a
package that is no longer installed fails the suite, so it cannot rot into a
permanent pardon.

**The cross-check only sees Node projects.** A `python-gui` or `python-cli` app
has no `package.json`, so its `network` block is a declaration nothing automated
verifies — it has to be checked by hand against the source, and the `note` has
to carry the line numbers that let someone else check it again.

`required: false` and `sends: casework` are not a contradiction. The first says
the app works offline; the second says that when it does talk, what it sends is
client-derived. `sanctuary-terminal` is exactly that case.

Nothing that phones out may autostart. An app that talks to somebody else's
server starts when a person means it to, or it does not start.

## Icons

A bare name (`utilities-terminal`) is a freedesktop Icon Naming Specification
name and every compliant theme resolves it — that is the only kind of bare name
allowed here. Anything with a path separator or a file extension is a file
shipped inside the app, relative to its own tree; the hook rewrites it to an
absolute `/opt/irn-apps/<id>/…` path, because a `.desktop` file will not resolve
a relative icon and just renders a blank one with no error.

Set `startup_wm_class` when the app's window class differs from its filename.
Without it the window manager cannot match the window back to its launcher, and
the app gets a second generic entry in the dock instead of lighting up the one
that started it.

## Categories

`TerminalEmulator`, `Viewer` and friends are *additional* categories and need
exactly one **main** category beside them. `Utility` and `System` are both main
categories — an entry carrying two of them can appear **twice** in the menu.

## The `excluded` list

Software in `~` that is deliberately not in the image, each with a `reason`.
This is why nobody re-audits `~/Dev/tools` every six months: the next person to
inventory it finds the answer instead of repeating the investigation. Listing
something here rather than silently omitting it is the entire point.

## Related

`os/stage-extras.sh` stages the things that are *not* apps — Zee Zee and the
Ollama model store. Sanctuary Terminal used to live there and now lives here.
