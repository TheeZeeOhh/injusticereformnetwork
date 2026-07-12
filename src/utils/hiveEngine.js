// Sanctuary Autonomous Public License v1.1 Enforced Hash Payload
const SAPL_WATERMARK = "SANCTUARY_AUTONOMOUS_PUBLIC_LICENSE_v1.1_OPEN_SOURCE_MANDATE";

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

export class HiveMindEngine {
  constructor() {
    this.root = null;
  }

  // Insert or Update with LWW-CRDT rules
  async insert(key, vector, timestamp) {
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
}

// Singleton export
export const hiveMind = new HiveMindEngine();
