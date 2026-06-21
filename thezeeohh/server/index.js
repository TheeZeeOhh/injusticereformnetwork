require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db'); // initialize DB & seed

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Stripe webhook (raw body — MUST come before json parser) ─────────────
const paymentsRouter = require('./routes/payments');
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use('/api/payments', paymentsRouter);

// ─── Body Parsers ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/courses',     require('./routes/courses'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/instructors', require('./routes/instructors'));
app.use('/api/newsletter',  require('./routes/newsletter'));
app.use('/api/reviews',     require('./routes/reviews'));

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'Radiant Threshold',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─── Serve Frontend Static Files ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// SPA fallback — serve index.html for any unknown GET route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─── Start ────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🌟 Radiant Threshold server running at http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/health`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   Mode:     ${process.env.NODE_ENV || 'development'}\n`);
});

// ─── Sovereign Channel WebSocket Relay (port 3002) ────────────────────────
try {
  const WS_PORT = process.env.WS_PORT || 3002;
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ port: WS_PORT });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[Sovereign Channel] Client connected. Total: ${clients.size}`);

    ws.on('message', (raw) => {
      // Relay to all OTHER clients
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(raw.toString());
        }
      });
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[Sovereign Channel] Client left. Total: ${clients.size}`);
    });

    ws.on('error', () => clients.delete(ws));
  });

  console.log(`⚡ Sovereign Channel WebSocket relay on ws://localhost:${WS_PORT}`);
} catch (e) {
  console.log(`[Sovereign Channel] WebSocket relay unavailable (ws package not found). Run: npm install ws`);
}

module.exports = app;
