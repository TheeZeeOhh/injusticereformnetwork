import { saveSecureRecord, loadSecureRecord } from './storageEngine';

// Sanctuary Autonomous Public License v1.1 Enforced Hash Payload
const SAPL_WATERMARK = "SANCTUARY_AUTONOMOUS_PUBLIC_LICENSE_v1.1_OPEN_SOURCE_MANDATE";

// IndexedDB record id + AAD tag for the single encrypted hive-mind blob. Tag 'H'
// keeps it in its own namespace, cryptographically separated from Vault A/B.
const HIVE_RECORD_ID = 'hive_mind_store';
const HIVE_VAULT_TAG = 'H';

// Fallback Deterministic Mock Embedding
function generateMockVector(seedString) {
  let seed = 0;
  for (let i = 0; i < seedString.length; i++) {
    seed = seedString.charCodeAt(i) + ((seed << 5) - seed);
  }
  const vec = new Array(768).fill(0).map((_, i) => Math.sin(seed + i));
  const magnitude = Math.sqrt(vec.reduce((acc, val) => acc + val * val, 0));
  return vec.map(v => v / (magnitude || 1));
}

// Generate an Ollama Embedding
export async function getVectorEmbedding(text) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) throw new Error("Ollama network refusal");
    
    const data = await response.json();
    return data.embedding;
  } catch (e) {
    console.warn("Ollama unavailable, falling back to deterministic SAPL mock vector.");
    return generateMockVector(text);
  }
}

async function generateNodeHash(key, vector, timestamp) {
  const payload = `${key}:${vector.join(',')}:${timestamp}:${SAPL_WATERMARK}`;
  const msgUint8 = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class TrieNode {
  constructor(key, vector, timestamp) {
    this.key = key;
    this.vector = vector;
    this.timestamp = timestamp;
    this.hash = null;
    this.left = null;
    this.right = null;
  }

  async updateHash() {
    this.hash = await generateNodeHash(this.key, this.vector, this.timestamp);
    // In a full Merkle Trie, we would also hash the left/right child hashes, 
    // but the spec dictates hashing the serialized payload injected with the SAPL v1.1 watermark.
  }
}

// --- Admission gate (subpoena litmus + n>=k source floor) --------------------
//
// The hive-mind is a replicated CRDT store: once a record syncs it lives on every
// node, forever, unrecallable. So NOTHING person-identifying may enter it — a
// hostile subpoena of a random node must yield nothing it couldn't already get
// from a FOIA request or a public website. This gate ENFORCES that in code; it is
// NOT left to caller discipline. Default-closed: uncertainty resolves to REJECT.
//
// See invariant_hive_mind_admission + decision_hive_mind_taxonomy.

// Minimum distinct independent sources before an entity/pattern entry may exist,
// so no single reporter is recoverable (provenance k-anonymity).
export const HIVE_MIN_SOURCES = 5;

// Person-identifying / casework signals — any hit REJECTS the candidate.
// NOTE on names: a naive "two capitalized words" test over-rejects legitimate
// bureaucratic ground truth (court names, jurisdictions, form titles are all
// capitalized). We do NOT use that heuristic. The robust person-signals below
// (client/casework referents, pronouns, individual dates/scheduling, DOB/SSN,
// health detail, case/docket refs) catch actual personal content; a bare name in
// otherwise-public ground truth ("Norfolk Circuit Court") is not itself PHI.
// Callers must still not put a person's name in — enforced by these signals plus
// the requirement that content be public, durable ground truth.
const HIVE_REJECT_PATTERNS = [
  /\bmy client\b|\bthe client\b|\bclient('s|s)?\b/i,
  /\b(my|the|a) (patient|resident|navigator note|case note)\b/i,
  /\b(he|she|him|her|his|hers|theirs)\b/i,                    // singular personal pronouns => an individual
  /\bcourt date\b|\bhearing (on|is|date)\b|\bappointment (on|is)\b/i, // individual scheduling
  /\bDOB\b|\bdate of birth\b|\bSSN\b|\b\d{3}-\d{2}-\d{4}\b/i,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,                            // a specific date = individual event
  /\bhrt\b|\bhormone|\bestrogen|\btestosterone|\bdiagnos|\bmedication|\bhiv\b/i, // health detail
  /\bcase\s*#?\s*[a-z0-9-]{3,}|\bdocket\b/i,                 // case/docket reference
];

// Authorship must be a role/region token, never a person/device identity.
const HIVE_ROLE_REGION = /^[a-z0-9 ]+(navigator|intake|clerk|region|office|chapter|desk)\b|^\d{3}\b/i;

/**
 * Decide whether a candidate may enter the hive-mind.
 * @param {{ sourceText?: string, sourceCount?: number, lastVerifiedBy?: string, isPattern?: boolean }} candidate
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function admissionGate(candidate = {}) {
  const text = String(candidate.sourceText || '');
  if (!text.trim()) return { ok: false, reason: 'empty candidate' };

  // 1. Subpoena litmus: reject anything person-identifying.
  for (const re of HIVE_REJECT_PATTERNS) {
    if (re.test(text)) return { ok: false, reason: 'person-identifying content' };
  }

  // 2. n>=k source floor for pattern/entity entries.
  if (candidate.isPattern) {
    const n = Number(candidate.sourceCount);
    if (!Number.isFinite(n) || n < HIVE_MIN_SOURCES) {
      return { ok: false, reason: `below source floor (need >= ${HIVE_MIN_SOURCES} distinct sources)` };
    }
  }

  // 3. Authorship must be a role/region token, never an identity.
  if (candidate.lastVerifiedBy != null) {
    if (!HIVE_ROLE_REGION.test(String(candidate.lastVerifiedBy))) {
      return { ok: false, reason: 'authorship is not a role/region token' };
    }
  }

  return { ok: true, reason: null };
}

export class HiveMindEngine {
  constructor() {
    this.root = null;
    // Per-key admission candidate metadata, kept parallel to the BST so it can be
    // persisted and re-gated on load. Purely additive bookkeeping: it does NOT
    // participate in insert/LWW/gate logic, so the safety-critical path is
    // unchanged. Keyed by node key; last admitted candidate wins (mirrors LWW).
    this.candidates = new Map();
  }

  // Insert or Update with LWW-CRDT rules.
  // ENFORCED admission gate: a candidate MUST pass admissionGate before it can
  // become replicated ground truth. `candidate` carries the source text + metadata
  // the gate needs; passing it is required. Rejection throws — the gate cannot be
  // bypassed by callers.
  async insert(key, vector, timestamp, candidate) {
    const verdict = admissionGate(candidate);
    if (!verdict.ok) {
      throw new Error(`hive-mind admission REJECTED: ${verdict.reason}`);
    }

    // Only reached once the gate has ADMITTED this candidate. Retain it so the
    // store can be persisted and independently re-gated on hydrate.
    this.candidates.set(key, candidate);

    if (!this.root) {
      this.root = new TrieNode(key, vector, timestamp);
      await this.root.updateHash();
      return;
    }

    await this._insertNode(this.root, key, vector, timestamp);
  }

  async _insertNode(node, key, vector, timestamp) {
    if (key === node.key) {
      // Collision -> LWW-CRDT
      if (timestamp > node.timestamp) {
        node.vector = vector;
        node.timestamp = timestamp;
        await node.updateHash();
      }
      return true; // Updated
    }

    if (key < node.key) {
      if (!node.left) {
        node.left = new TrieNode(key, vector, timestamp);
        await node.left.updateHash();
      } else {
        await this._insertNode(node.left, key, vector, timestamp);
      }
    } else {
      if (!node.right) {
        node.right = new TrieNode(key, vector, timestamp);
        await node.right.updateHash();
      } else {
        await this._insertNode(node.right, key, vector, timestamp);
      }
    }
    
    // Propagate hash update up the tree
    await node.updateHash();
  }

  // Flatten tree to array
  flatten(node = this.root, arr = []) {
    if (node !== null) {
      this.flatten(node.left, arr);
      arr.push(node);
      this.flatten(node.right, arr);
    }
    return arr;
  }

  // Cosine Similarity 
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Semantic Search
  async semanticSearch(queryText) {
    const queryVector = await getVectorEmbedding(queryText);
    const nodes = this.flatten();
    
    if (nodes.length === 0) return null;

    let bestNode = null;
    let bestScore = -Infinity;

    for (const node of nodes) {
      const score = this.cosineSimilarity(queryVector, node.vector);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    return { node: bestNode, score: bestScore };
  }

  // --- Encrypted persistence (tag 'H') --------------------------------------
  //
  // The store is persisted as ONE encrypted blob, not per-node records, so a
  // single AES-GCM envelope authenticates the whole tree. Content is non-PHI by
  // the admission gate, but it is still encrypted at rest for consistency with
  // every other Sanctuary store.

  // Flatten the tree to a plain, order-independent array of records. Each carries
  // its admission candidate so hydrate can re-gate it independently.
  serialize() {
    return this.flatten().map(node => ({
      key: node.key,
      vector: node.vector,
      timestamp: node.timestamp,
      candidate: this.candidates.get(node.key) || { sourceText: '' },
    }));
  }

  // Encrypt and store the whole tree under the hive key. `hiveKey` is the AES-GCM
  // key from cryptoEngine.deriveHiveKey(passphraseA). Returns the number of
  // entries written.
  async persist(hiveKey) {
    const entries = this.serialize();
    await saveSecureRecord(hiveKey, HIVE_RECORD_ID, { entries }, HIVE_VAULT_TAG);
    return entries.length;
  }

  // Load, decrypt, and rebuild the tree from the persisted blob. Every entry is
  // RE-GATED through admissionGate on the way in: even though it passed at write
  // time, a locally tampered blob must not be trusted. Entries that fail the gate
  // are DROPPED (not fatal) so one poisoned entry can't deny the whole store.
  // Returns { admitted, dropped }. A missing blob (first run) yields zeros.
  async hydrate(hiveKey) {
    const payload = await loadSecureRecord(hiveKey, HIVE_RECORD_ID, HIVE_VAULT_TAG);
    if (!payload || !Array.isArray(payload.entries)) {
      return { admitted: 0, dropped: 0 };
    }

    this.root = null;
    this.candidates = new Map();

    let admitted = 0;
    let dropped = 0;
    for (const e of payload.entries) {
      // Re-run the gate; insert() enforces it too, but check first so a rejection
      // is a counted drop rather than a thrown abort of the whole hydrate.
      if (!e || !admissionGate(e.candidate).ok) {
        dropped++;
        continue;
      }
      try {
        await this.insert(e.key, e.vector, e.timestamp, e.candidate);
        admitted++;
      } catch {
        dropped++;
      }
    }
    return { admitted, dropped };
  }
}

// Singleton export
export const hiveMind = new HiveMindEngine();
