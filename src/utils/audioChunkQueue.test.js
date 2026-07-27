import { describe, it, expect } from 'vitest';
import { AudioChunkQueue } from './audioChunkQueue.js';

const chunk = (n, fill = 1) => new Float32Array(n).fill(fill);

describe('AudioChunkQueue — backpressure (the freeze fix)', () => {
  it('sends the first chunk immediately', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(chunk(100));
    expect(sent).toHaveLength(1);
    expect(sent[0].length).toBe(100);
  });

  it('does NOT send while a chunk is in flight — this is the whole point', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(chunk(100));
    q.push(chunk(100));
    q.push(chunk(100));
    q.push(chunk(100));
    // Old behaviour posted all four straight at the worker.
    expect(sent).toHaveLength(1);
    expect(q.backlogSamples).toBe(300);
    expect(q.isBehind).toBe(true);
  });

  it('coalesces the backlog into ONE chunk when the worker frees up (no words lost)', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(chunk(10, 1));
    q.push(chunk(10, 2));
    q.push(chunk(10, 3));
    expect(sent).toHaveLength(1);

    q.onWorkerDone();
    expect(sent).toHaveLength(2);
    expect(sent[1].length).toBe(20);          // both backlog chunks, merged
    expect(sent[1][0]).toBe(2);               // order preserved
    expect(sent[1][10]).toBe(3);
    expect(q.backlogSamples).toBe(0);
  });

  it('goes idle when the backlog is empty rather than spinning', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(chunk(10));
    q.onWorkerDone();
    expect(sent).toHaveLength(1);
    expect(q.inFlight).toBe(false);
    expect(q.isBehind).toBe(false);
  });

  it('drops the OLDEST audio past the ceiling and reports it honestly', () => {
    const dropped = [];
    const q = new AudioChunkQueue(() => {}, {
      maxPendingSamples: 25,
      onDrop: (n) => dropped.push(n),
    });
    q.push(chunk(10)); // in flight
    q.push(chunk(10)); // pending 10
    q.push(chunk(10)); // pending 20
    q.push(chunk(10)); // pending 30 -> over ceiling, shed oldest
    expect(q.backlogSamples).toBeLessThanOrEqual(25);
    expect(dropped.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(q.droppedSamples).toBeGreaterThan(0);
  });

  it('backlog stays bounded under sustained overload (memory does not run away)', () => {
    const q = new AudioChunkQueue(() => {}, { maxPendingSamples: 16000 * 30 });
    // 10 minutes of 5s chunks arriving with the worker never finishing.
    for (let i = 0; i < 120; i++) q.push(chunk(16000 * 5));
    expect(q.backlogSamples).toBeLessThanOrEqual(16000 * 30 + 16000 * 5);
  });

  it('a FAILED chunk still frees the slot — one bad chunk must not wedge the session', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(chunk(10));
    q.push(chunk(10));
    q.onWorkerDone(); // worker reported an error, but reported
    expect(sent).toHaveLength(2);
    q.onWorkerDone();
    expect(q.inFlight).toBe(false);
  });
});

describe('AudioChunkQueue — stop must relieve pressure, not add to it', () => {
  it('discards the trailing chunk when already behind', () => {
    const q = new AudioChunkQueue(() => {});
    q.push(chunk(10));  // in flight
    q.push(chunk(10));  // backlog
    expect(q.finish()).toBeNull();
    expect(q.backlogSamples).toBe(0);
    expect(q.droppedSamples).toBe(10);
  });

  it('returns the trailing audio when the worker is idle', () => {
    const q = new AudioChunkQueue(() => {});
    q.push(chunk(10));
    q.onWorkerDone();     // idle now
    q.pending.push(chunk(7));
    q.pendingSamples = 7;
    const tail = q.finish();
    expect(tail).not.toBeNull();
    expect(tail.length).toBe(7);
  });

  it('reset clears all state', () => {
    const q = new AudioChunkQueue(() => {});
    q.push(chunk(10));
    q.push(chunk(10));
    q.reset();
    expect(q.inFlight).toBe(false);
    expect(q.backlogSamples).toBe(0);
    expect(q.droppedSamples).toBe(0);
  });
});

describe('AudioChunkQueue — input guards', () => {
  it('requires a send function', () => {
    expect(() => new AudioChunkQueue()).toThrow(/requires a send/);
  });

  it('ignores empty and non-Float32Array input', () => {
    const sent = [];
    const q = new AudioChunkQueue((a) => sent.push(a));
    q.push(new Float32Array(0));
    q.push(null);
    q.push([1, 2, 3]);
    expect(sent).toHaveLength(0);
  });
});
