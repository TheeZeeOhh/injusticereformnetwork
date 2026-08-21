// End-to-end runtime smoke: boots nothing itself — expects the server already
// running at $BASE (default http://127.0.0.1:4399). Drives one full loop.
import { WebSocket } from 'ws';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4399';
const WSURL = BASE.replace('http', 'ws');
const die = (m) => { console.error('SMOKE FAIL:', m); process.exit(1); };

// 1) HTTP health + static
const health = await (await fetch(`${BASE}/health`)).json();
if (!health.ok) die('health not ok');
const html = await (await fetch(`${BASE}/`)).text();
if (!html.includes('Agent Office')) die('index.html missing');
console.log('✓ http: /health ok, / serves UI');

// 2) WS full loop
const ws = new WebSocket(WSURL);
let snapshot = null;
const done = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('loop timed out')), 15000);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'snapshot') {
      snapshot = msg;
      if (!snapshot.agents.length) die('no agents in snapshot');
      const agent = snapshot.agents.find((a) => a.provider === 'echo') ?? snapshot.agents[0];
      console.log(`✓ ws: snapshot has ${snapshot.agents.length} agents; driving "${agent.name}"`);
      ws.send(JSON.stringify({ type: 'task:add', title: 'smoke: say hello', body: 'SMOKE-PAYLOAD-42' }));
      // grab the task id from the next task event
      ws._agent = agent.id;
    } else if (msg.type === 'task' && msg.task.column === 'todo' && !ws._assigned) {
      ws._assigned = true;
      ws._taskId = msg.task.id;
      ws.send(JSON.stringify({ type: 'task:assign', taskId: msg.task.id, agentId: ws._agent }));
      ws.send(JSON.stringify({ type: 'agent:start', agentId: ws._agent }));
    } else if (msg.type === 'term' && /SMOKE-PAYLOAD-42/.test(msg.chunk)) {
      ws._sawOutput = true;
    } else if (msg.type === 'task' && msg.task.id === ws._taskId && msg.task.column === 'done') {
      clearTimeout(timeout);
      if (!ws._sawOutput) return reject(new Error('task done but never saw agent output'));
      resolve();
    }
  });
  ws.on('error', reject);
});

await done;
console.log('✓ ws: task added → assigned → agent ran → output streamed → moved to done');
ws.close();
console.log('SMOKE PASS');
process.exit(0);
