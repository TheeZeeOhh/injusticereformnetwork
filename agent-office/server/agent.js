/**
 * agent.js — one worker. Wraps a CLI "provider" (the coding agent you already
 * run) as a spawnable process, bounded by the safety caps.
 *
 * A provider is a command template, e.g.
 *   { "cmd": "claude", "args": ["-p", "{prompt}"] }
 * The `{prompt}` token is filled with the composed task text at spawn time. spawn
 * is called WITHOUT a shell and args are passed as an array, so the task text is
 * a literal argv string — it cannot break out into another command.
 */
import { spawn } from 'node:child_process';
import { fillTemplate, DEFAULT_CAPS } from './safety.js';

/** @typedef {'idle'|'working'|'done'|'error'|'stopped'} AgentStatus */

export class Agent {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? def.id;
    this.role = def.role ?? 'worker';
    this.provider = def.provider;
    this.cwd = def.cwd ?? process.cwd();
    this.caps = { ...DEFAULT_CAPS, ...(def.caps ?? {}) };
    /** @type {AgentStatus} */
    this.status = 'idle';
    this.currentTaskId = null;
    this.pid = null;
    this.lastExit = null;
    /** recent output, kept small for the snapshot; full stream goes over ws */
    this.tail = '';
    this._child = null;
    this._killTimer = null;
    this._bytes = 0;
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      provider: this.provider,
      status: this.status,
      currentTaskId: this.currentTaskId,
      pid: this.pid,
      lastExit: this.lastExit,
    };
  }

  isRunning() {
    return this._child !== null;
  }

  /**
   * Spawn the provider against `task`.
   * @param providerDef  the resolved provider command template
   * @param task         the board task (title/body compose the prompt)
   * @param onOutput     (chunk:string) => void   live stream sink
   * @param onExit       (code:number|null, capped:string|null) => void
   */
  start(providerDef, task, onOutput, onExit) {
    if (this.isRunning()) throw new Error(`agent ${this.id} is already running`);
    if (!providerDef) throw new Error(`agent ${this.id} has no provider "${this.provider}"`);

    const prompt = this.#composePrompt(task);
    const vars = { prompt, title: task.title, body: task.body, role: this.role };
    const args = (providerDef.args ?? []).map((a) => fillTemplate(a, vars));
    // Effective caps: agent default, overridden by anything the provider pins.
    const caps = { ...this.caps, ...(providerDef.caps ?? {}) };

    this.status = 'working';
    this.currentTaskId = task.id;
    this.lastExit = null;
    this.tail = '';
    this._bytes = 0;

    const child = spawn(providerDef.cmd, args, {
      cwd: providerDef.cwd ?? this.cwd,
      env: { ...process.env, ...(providerDef.env ?? {}) },
      stdio: providerDef.promptStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    this._child = child;
    this.pid = child.pid ?? null;

    if (providerDef.promptStdin && child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    let capped = null;
    const cap = (reason) => {
      if (capped) return;
      capped = reason;
      this.kill('SIGKILL');
    };

    const onChunk = (buf) => {
      const chunk = buf.toString();
      this._bytes += buf.length;
      this.tail = (this.tail + chunk).slice(-4000);
      onOutput(chunk);
      if (this._bytes > caps.maxOutputBytes) cap('output-cap');
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);

    this._killTimer = setTimeout(() => cap('runtime-cap'), caps.maxRuntimeMs);
    this._killTimer.unref?.();

    child.on('error', (err) => {
      onOutput(`\n[spawn error] ${err.message}\n`);
      this.#finish(null, capped ?? 'spawn-error', onExit);
    });
    child.on('close', (code) => this.#finish(code, capped, onExit));
  }

  #composePrompt(task) {
    const header = this.role ? `You are ${this.name} (${this.role}).\n\n` : '';
    const body = task.body ? `\n\n${task.body}` : '';
    return `${header}Task: ${task.title}${body}`;
  }

  #finish(code, capped, onExit) {
    clearTimeout(this._killTimer);
    this._killTimer = null;
    this._child = null;
    this.pid = null;
    this.lastExit = code;
    if (capped) this.status = 'error';
    else if (code === 0) this.status = 'done';
    else this.status = 'error';
    onExit(code, capped);
  }

  kill(signal = 'SIGTERM') {
    if (!this._child) return false;
    try {
      this._child.kill(signal);
    } catch {
      /* already gone */
    }
    return true;
  }

  stop() {
    if (this.kill('SIGTERM')) this.status = 'stopped';
  }
}
