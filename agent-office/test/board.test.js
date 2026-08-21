import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Board, COLUMNS } from '../server/board.js';

test('add creates a todo task and rejects empty titles', () => {
  const b = new Board();
  const t = b.add({ title: 'ship it', body: 'do the thing' });
  assert.equal(t.column, 'todo');
  assert.equal(t.title, 'ship it');
  assert.throws(() => b.add({ title: '   ' }), /title/);
});

test('move validates columns', () => {
  const b = new Board();
  const t = b.add({ title: 'x' });
  b.move(t.id, 'doing');
  assert.equal(b.get(t.id).column, 'doing');
  assert.throws(() => b.move(t.id, 'nope'), /invalid column/);
  assert.deepEqual(COLUMNS, ['todo', 'doing', 'done']);
});

test('nextFor prefers a doing task over a todo, scoped to the agent', () => {
  const b = new Board();
  const a = b.add({ title: 'a', assignee: 'jim' });
  const c = b.add({ title: 'c', assignee: 'jim' });
  b.add({ title: 'other', assignee: 'pam' });
  assert.equal(b.nextFor('jim').id, a.id); // first todo
  b.move(c.id, 'doing');
  assert.equal(b.nextFor('jim').id, c.id); // doing wins
  assert.equal(b.nextFor('nobody'), null);
});

test('persists across instances', () => {
  const file = join(tmpdir(), `board-${randomUUID()}.json`);
  try {
    const b1 = new Board(file);
    const t = b1.add({ title: 'persist me' });
    const b2 = new Board(file);
    assert.equal(b2.get(t.id).title, 'persist me');
  } finally {
    rmSync(file, { force: true });
  }
});
