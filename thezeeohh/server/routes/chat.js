const express = require('express');
const router = express.Router();
const http = require('http');

// System prompt defining Amina's persona
const AMINA_SYSTEM_PROMPT = `
You are Amina, the AI Sovereign Sentinel for the Injustice Reform Network (IRN) and Radiant Threshold.
Your character is built on the principles of the Aziza Code:
1. Mutual aid over charity (solidarity, not saviorism).
2. Deep relational organizing (building real trust and base leadership, not transactional mobilization).
3. Zero-Trust digital security and local-first architecture (OpSec is safety).
4. Centering trans, queer, and Black/brown liberation.
5. Standing against state surveillance, predatory carceral systems, and administrative exhaustion.

Tone: Sharp, street-smart, direct, empowering, and compassionate but uncompromising on community sovereignty. Use clear, direct sentences. Avoid clinical, robotic, or overly corporate language. Do not sound like a standard assistant. You speak like a frontline organizer who knows the streets of Baltimore and Hampton Roads.

If asked about Marcus Webb, note that he is no longer with the network and you have taken over the core curriculum.
Keep responses concise (1-3 short paragraphs), highly actionable, and focused on organizing, digital safety, mutual aid, or community defense.
`;

router.post('/', async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Build chat payload for Ollama
  const messages = [
    { role: 'system', content: AMINA_SYSTEM_PROMPT }
  ];

  // Append history if provided
  if (history && Array.isArray(history)) {
    history.forEach(msg => {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }

  // Append new user message
  messages.push({ role: 'user', content: message });

  // Select a model from those known to be installed
  // Prefer llama3.2, then mistral, then dolphin-llama3, then fallback
  const preferredModels = ['llama3.2:latest', 'mistral:7b-instruct-v0.3-q4_K_M', 'dolphin-llama3:latest', 'qwen2.5:0.5b'];
  let selectedModel = 'llama3.2:latest'; // default default

  // We can query the local Ollama instance
  const postData = JSON.stringify({
    model: selectedModel,
    messages: messages,
    stream: false
  });

  const options = {
    hostname: '127.0.0.1',
    port: 11434,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const ollamaReq = http.request(options, (ollamaRes) => {
    let rawData = '';
    ollamaRes.setEncoding('utf8');
    ollamaRes.on('data', (chunk) => { rawData += chunk; });
    ollamaRes.on('end', () => {
      try {
        const parsedData = JSON.parse(rawData);
        if (parsedData.message && parsedData.message.content) {
          res.json({ response: parsedData.message.content });
        } else {
          res.status(500).json({ error: 'Unexpected response from Ollama' });
        }
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Ollama response' });
      }
    });
  });

  ollamaReq.on('error', (e) => {
    console.error(`Ollama connection error: ${e.message}`);
    // If Ollama is down, return a localized error/static fallback hint
    res.status(503).json({ 
      error: 'Ollama offline',
      fallback: true
    });
  });

  ollamaReq.write(postData);
  ollamaReq.end();
});

module.exports = router;
