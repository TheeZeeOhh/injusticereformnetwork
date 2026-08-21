/**
 * index.js — transport. A loopback-only HTTP server that serves the static UI
 * and a WebSocket channel carrying orchestrator events out and operator commands
 * in. No other network is touched.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { Orchestrator } from './orchestrator.js';
import { assertLoopbackHost, assertNoRemoteSurface } from './safety.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4317);
const BOARD_FILE = process.env.BOARD_FILE ?? join(ROOT, 'data', 'board.json');

function loadConfig() {
  const explicit = process.env.CONFIG;
  const candidates = [explicit, join(ROOT, 'config.json'), join(ROOT, 'config.example.json')].filter(
    Boolean
  );
  for (const file of candidates) {
    if (existsSync(file)) {
      const cfg = JSON.parse(readFileSync(file, 'utf8'));
      assertNoRemoteSurface(cfg);
      console.log(`[agent-office] config: ${file}`);
      return cfg;
    }
  }
  throw new Error('no config found (looked for config.json / config.example.json)');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403).end('forbidden'); // path traversal guard
    return;
  }
  if (rel === 'health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

function main() {
  assertLoopbackHost(HOST);
  const orch = new Orchestrator(loadConfig(), BOARD_FILE);

  const server = createServer(serveStatic);
  const wss = new WebSocketServer({ server });

  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) if (client.readyState === 1) client.send(data);
  };

  // orchestrator → all browsers
  orch.on('log', (entry) => broadcast({ type: 'log', entry }));
  orch.on('term', (t) => broadcast({ type: 'term', ...t }));
  orch.on('agent', (a) => broadcast({ type: 'agent', agent: a }));
  orch.on('task', (t) => broadcast({ type: 'task', task: t }));

  // browser → orchestrator
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', ...orch.snapshot() }));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        switch (msg.type) {
          case 'task:add':
            orch.addTask({ title: msg.title, body: msg.body, assignee: msg.assignee ?? null });
            break;
          case 'task:assign':
            orch.assignTask(msg.taskId, msg.agentId ?? null);
            break;
          case 'task:move':
            orch.moveTask(msg.taskId, msg.column);
            break;
          case 'agent:start':
            orch.startAgent(msg.agentId);
            break;
          case 'agent:stop':
            orch.stopAgent(msg.agentId);
            break;
          default:
            break;
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });
  });

  const shutdown = () => {
    orch.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    console.log(`[agent-office] local-only harness on http://${HOST}:${PORT}`);
    console.log(`[agent-office] agents: ${orch.agents.size} · providers: ${Object.keys(orch.providers).join(', ')}`);
  });
}

main();
