// server.js - Simple Express backend for Sanctuary Reading Room
// Provides a /search POST endpoint that receives a JSON { query: string }
// It generates an embedding via Ollama (nomic-embed-text) and performs a cosine similarity
// search over the local_vector_db.json (produced by the ingest script).
// Returns top 5 matches with title (source filename) and a short snippet.

import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import JSONStream from 'JSONStream';

import cors from 'cors';
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static('/home/aziza/IRN_Finds'));

const DB_PATH = path.resolve('/home/aziza/Projects/sovereign-hivemind/local_vector_db.json');
const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const MODEL = 'nomic-embed-text';

// Load DB using a stream to avoid string length limits
let db = [];
console.log('Loading database via stream, this may take a moment...');
const stream = fs.createReadStream(DB_PATH, { encoding: 'utf8' });
const parser = JSONStream.parse('*');
stream.pipe(parser);
parser.on('data', (entry) => {
  db.push(entry);
});
parser.on('end', () => {
  console.log(`Loaded ${db.length} vector entries successfully.`);
});
parser.on('error', (e) => {
  console.error('Stream error:', e);
});

// Helper: cosine similarity
function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate embedding for a query string via Ollama
async function embed(text) {
  const resp = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text })
  });
  if (!resp.ok) {
    throw new Error(`Ollama embedding error: ${resp.status}`);
  }
  const data = await resp.json();
  // Ollama returns { embedding: [float...] }
  return data.embedding;
}

app.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const qVec = await embed(query);
    // Compute similarity for each entry (could be optimized with ANN lib)
    const results = db.map(entry => ({
      source: entry.source,
      text: entry.text,
      score: cosine(qVec, entry.vector || entry.embedding) // some DBs use "vector"
    }));
    // Sort descending by score and take top 5
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 5).map(r => ({
      title: path.basename(r.source),
      snippet: r.text.slice(0, 200) + (r.text.length > 200 ? '…' : ''),
      score: r.score
    }));
    res.json({ results: top });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});
app.get('/search', (req, res) => {
  res.status(405).json({ error: 'Please use POST /search with JSON body and Authorization header' });
});
// Root status endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Sanctuary backend running', uptime: process.uptime() });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sanctuary backend listening on http://0.0.0.0:${PORT}`);
});
