// audioChunkQueue.js
//
// Backpressure for live transcription.
//
// THE BUG THIS EXISTS TO FIX: capture produced a 5-second chunk every 5 seconds
// of wall time and posted each one to the Whisper worker unconditionally. On
// WASM, whisper-tiny needs longer than real time to process a 5s window — and
// the worker ran TWO passes per chunk (transcribe + translate), so it consumed
// chunks at roughly a third of the rate they arrived. Nothing checked whether
// the worker was busy, so the backlog grew without bound: memory climbed, the
// worker thrashed, and the session locked up a minute or two in. Pressing STOP
// made it worse, because stop flushed one more chunk onto the pile.
//
// The fix is not "go faster" — it is to admit the machine has a speed and
// degrade honestly when speech outruns it. This queue keeps AT MOST ONE chunk
// in flight. Audio that arrives while the worker is busy is COALESCED into a
// single pending buffer rather than queued as separate jobs, so no words are
// lost to ordinary lag. If the backlog exceeds `maxPendingSamples` the OLDEST
// samples are dropped and counted, so the UI can say "transcription is behind,
// N seconds dropped" out loud instead of silently freezing and lying about it.
//
// Deliberately free of DOM/worker dependencies so the scheduling logic is unit
// testable without WASM, a microphone, or a model download.

export class AudioChunkQueue {
  /**
   * @param {(audio: Float32Array) => void} send  invoked with a chunk to transcribe
   * @param {{ maxPendingSamples?: number, onDrop?: (droppedSamples:number)=>void }} opts
   */
  constructor(send, opts = {}) {
    if (typeof send !== 'function') {
      throw new Error('AudioChunkQueue requires a send(audio) function.');
    }
    this.send = send;
    // Default ceiling: 30s at 16 kHz. Past this the session is so far behind
    // that holding more audio helps nobody.
    this.maxPendingSamples = opts.maxPendingSamples ?? 16000 * 30;
    this.onDrop = opts.onDrop ?? (() => {});

    this.inFlight = false;
    this.pending = [];        // Float32Array[] awaiting a free worker
    this.pendingSamples = 0;
    this.droppedSamples = 0;
  }

  /** True when the worker is busy or work is waiting — for an honest UI badge. */
  get isBehind() {
    return this.inFlight && this.pendingSamples > 0;
  }

  /** Samples currently buffered behind the in-flight job. */
  get backlogSamples() {
    return this.pendingSamples;
  }

  /**
   * Offer a captured chunk. Sends immediately if the worker is idle, otherwise
   * coalesces it into the pending buffer (trimming the oldest audio if the
   * backlog is over the ceiling).
   */
  push(audio) {
    if (!(audio instanceof Float32Array) || audio.length === 0) return;

    if (!this.inFlight) {
      this.inFlight = true;
      this.send(audio);
      return;
    }

    this.pending.push(audio);
    this.pendingSamples += audio.length;
    this.#trim();
  }

  /**
   * Called when the worker reports it finished a chunk (success OR error —
   * an error must still free the slot, or one bad chunk wedges the session
   * permanently, which is just the original freeze wearing a hat).
   */
  onWorkerDone() {
    this.inFlight = false;
    if (this.pendingSamples === 0) {
      this.pending = [];
      return;
    }
    const merged = this.#drainPending();
    this.inFlight = true;
    this.send(merged);
  }

  /**
   * Stop capturing. Returns the trailing audio ONLY if the worker is idle;
   * when it is already behind, the trailing chunk is discarded rather than
   * piled onto the backlog. Stop must relieve pressure, never add to it.
   */
  finish() {
    const hadBacklog = this.pendingSamples;
    if (this.inFlight) {
      this.pending = [];
      this.pendingSamples = 0;
      if (hadBacklog > 0) {
        this.droppedSamples += hadBacklog;
        this.onDrop(hadBacklog);
      }
      return null;
    }
    if (this.pendingSamples === 0) return null;
    return this.#drainPending();
  }

  reset() {
    this.inFlight = false;
    this.pending = [];
    this.pendingSamples = 0;
    this.droppedSamples = 0;
  }

  #trim() {
    while (this.pendingSamples > this.maxPendingSamples && this.pending.length > 1) {
      const oldest = this.pending.shift();
      this.pendingSamples -= oldest.length;
      this.droppedSamples += oldest.length;
      this.onDrop(oldest.length);
    }
  }

  #drainPending() {
    const merged = new Float32Array(this.pendingSamples);
    let offset = 0;
    for (const part of this.pending) {
      merged.set(part, offset);
      offset += part.length;
    }
    this.pending = [];
    this.pendingSamples = 0;
    return merged;
  }
}
