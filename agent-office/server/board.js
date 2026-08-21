/**
 * board.js — the shared task board (the coordination surface every agent reads).
 *
 * Three columns: todo → doing → done. Persisted to a plain JSON file so a restart
 * doesn't lose the roster of work. No database, no native module.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const COLUMNS = Object.freeze(['todo', 'doing', 'done']);

export class Board {
  /** @param {string|null} file  path to persist to, or null for in-memory only */
  constructor(file = null) {
    this.file = file;
    /** @type {Map<string, object>} */
    this.tasks = new Map();
    if (file && existsSync(file)) this.#load();
  }

  #load() {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const t of raw.tasks ?? []) this.tasks.set(t.id, t);
    } catch {
      /* start empty on a corrupt/absent file rather than crash */
    }
  }

  #persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ tasks: [...this.tasks.values()] }, null, 2));
  }

  add({ title, body = '', assignee = null }) {
    if (!title || !String(title).trim()) throw new Error('task title is required');
    const now = Date.now();
    const task = {
      id: randomUUID(),
      title: String(title).trim(),
      body: String(body),
      column: 'todo',
      assignee,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this.#persist();
    return task;
  }

  get(id) {
    return this.tasks.get(id) ?? null;
  }

  update(id, patch) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`no task ${id}`);
    if ('column' in patch && !COLUMNS.includes(patch.column)) {
      throw new Error(`invalid column "${patch.column}"`);
    }
    Object.assign(task, patch, { updatedAt: Date.now() });
    this.#persist();
    return task;
  }

  move(id, column) {
    return this.update(id, { column });
  }

  assign(id, agentId) {
    return this.update(id, { assignee: agentId });
  }

  /** Next actionable task for an agent: a doing one first, else an assigned todo. */
  nextFor(agentId) {
    const mine = [...this.tasks.values()].filter((t) => t.assignee === agentId);
    return (
      mine.find((t) => t.column === 'doing') ??
      mine.find((t) => t.column === 'todo') ??
      null
    );
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
}
