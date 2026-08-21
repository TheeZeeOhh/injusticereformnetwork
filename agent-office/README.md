# Agent Office (local-only)

A scoped, **local-only** multi-agent harness. Wrap the CLI coding agent you
already run (`claude`, or any command) as autonomous workers on a shared task
board, and watch them work on a live office floor.

This is a deliberately small MVP inspired by
[Munder Difflin](https://github.com/chaitanyagiri/munder-difflin), with **every
remote/egress surface removed**: no public webhook tunnels, no Slack, no
third-party voice, no telemetry. It binds `127.0.0.1` only and refuses to do
otherwise.

## Why the trimmed scope

The upstream harness is well engineered, but its trigger features open a public
tunnel and its shared memory trusts inbound text as instructions — a
prompt-injection surface you don't want next to sensitive data. This build keeps
the good part (a coordinated crew of local CLI agents) and drops the surfaces
that made it risky to run near PHI.

## Run it

```bash
cd agent-office
npm install
npm test           # unit + process-lifecycle tests, no API key needed
npm start          # → http://127.0.0.1:4317
```

Out of the box the `echo` and `sleep` providers need no API key, so you can add
a task, assign it to a desk, and hit **Start** to see the full loop immediately.

## Point it at your real agent

Copy the example config and edit the `claude` provider (or add your own):

```bash
cp config.example.json config.json
```

A provider is a command template; `{prompt}` (also `{title}`, `{body}`, `{role}`)
is filled with the composed task text at spawn time. Spawn runs **without a
shell** and args are passed as an array, so task text is a literal argv string —
it can't break out into another command.

```json
"claude": { "cmd": "claude", "args": ["-p", "{prompt}"], "caps": { "maxRuntimeMs": 600000 } }
```

## Guardrails baked in

- **Loopback only** — the server throws if asked to bind a non-loopback host
  (`server/safety.js`), and `config.json` is rejected if it contains
  `webhook`/`tunnel`/`slack`/`telemetry`/`trigger` keys.
- **Per-run caps** — each agent run is bounded by a wall-clock timeout and an
  output-byte cap; exceeding either kills the process and flags the agent
  `error` (the cost/runaway brake the upstream app calls a "circuit breaker").
- **No outbound network** from the harness itself. Whatever your *provider* CLI
  does is up to that CLI.

## What it is / isn't

- **Is:** a local orchestrator (task board + roster + live terminals + activity
  log) over `node:child_process`, ~zero deps (`ws` only), tests via Node's
  built-in runner.
- **Isn't (yet):** Electron packaging, a pixel-art floor, PTY-true terminals
  (`node-pty`), semantic shared memory, or voice. Those are deliberate follow-ons,
  not part of the safe core.

## Config / env

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `4317` | loopback port |
| `HOST` | `127.0.0.1` | must be loopback |
| `CONFIG` | `config.json` → `config.example.json` | provider/agent config |
| `BOARD_FILE` | `data/board.json` | task persistence |
