// Agent Office — browser client. Talks to the loopback server over one WebSocket:
// server → {snapshot, agent, task, log, term}; client → {task:add, task:assign,
// task:move, agent:start, agent:stop}.

const state = {
  agents: new Map(),
  tasks: new Map(),
  providers: [],
  selected: null,
  term: new Map(), // agentId -> accumulated output
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// ---- WebSocket ------------------------------------------------------------
let ws;
function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); setTimeout(connect, 1000); };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}
function send(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); }
function setConn(ok) {
  $('conn-dot').className = `dot ${ok ? 'dot-on' : 'dot-off'}`;
  $('conn-label').textContent = ok ? 'connected · local' : 'disconnected';
}

function handle(msg) {
  switch (msg.type) {
    case 'snapshot':
      state.providers = msg.providers;
      state.agents = new Map(msg.agents.map((a) => [a.id, a]));
      state.tasks = new Map(msg.tasks.map((t) => [t.id, t]));
      $('log').innerHTML = '';
      msg.log.forEach(addLog);
      renderAll();
      break;
    case 'agent':
      state.agents.set(msg.agent.id, msg.agent);
      renderDesks();
      break;
    case 'task':
      state.tasks.set(msg.task.id, msg.task);
      renderBoard();
      break;
    case 'log':
      addLog(msg.entry);
      break;
    case 'term': {
      const prev = state.term.get(msg.agentId) ?? '';
      state.term.set(msg.agentId, (prev + msg.chunk).slice(-20000));
      if (state.selected === msg.agentId) renderTerminal();
      break;
    }
    case 'error':
      addLog({ ts: Date.now(), level: 'error', text: msg.message });
      break;
  }
}

// ---- render ---------------------------------------------------------------
function renderAll() { renderDesks(); renderBoard(); renderAssigneeOptions(); }

function renderDesks() {
  const el = $('desks');
  el.innerHTML = '';
  for (const a of state.agents.values()) {
    const desk = document.createElement('div');
    desk.className = `desk ${a.status === 'working' ? 'working' : ''} ${a.status === 'error' ? 'error' : ''} ${state.selected === a.id ? 'selected' : ''}`;
    desk.onclick = () => { state.selected = a.id; renderTerminal(); renderDesks(); };
    const running = a.status === 'working';
    desk.innerHTML = `
      <div class="desk-head">
        <div class="avatar">${esc(initials(a.name))}</div>
        <div><div class="desk-name">${esc(a.name)}</div><div class="desk-role">${esc(a.role)} · ${esc(a.provider)}</div></div>
      </div>
      <div class="desk-meta"><span class="status-dot status-${a.status}"></span>${a.status}${a.currentTaskId ? ' · on task' : ''}</div>
      <div class="desk-actions">
        <button data-act="start" ${running ? 'disabled' : ''}>▶ Start</button>
        <button data-act="stop" ${running ? '' : 'disabled'}>■ Stop</button>
      </div>`;
    desk.querySelector('[data-act=start]').onclick = (e) => { e.stopPropagation(); send({ type: 'agent:start', agentId: a.id }); };
    desk.querySelector('[data-act=stop]').onclick = (e) => { e.stopPropagation(); send({ type: 'agent:stop', agentId: a.id }); };
    el.appendChild(desk);
  }
}

function renderBoard() {
  for (const col of ['todo', 'doing', 'done']) $(`col-${col}`).innerHTML = '';
  const tasks = [...state.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const t of tasks) {
    const card = document.createElement('div');
    card.className = 'card';
    const assignee = t.assignee ? (state.agents.get(t.assignee)?.name ?? t.assignee) : null;
    const opts = ['<option value="">— assign —</option>']
      .concat([...state.agents.values()].map((a) => `<option value="${a.id}" ${a.id === t.assignee ? 'selected' : ''}>${esc(a.name)}</option>`))
      .join('');
    card.innerHTML = `
      <div class="card-title">${esc(t.title)}</div>
      ${assignee ? `<div class="card-assignee">@ ${esc(assignee)}</div>` : ''}
      <select>${opts}</select>`;
    card.querySelector('select').onchange = (e) => send({ type: 'task:assign', taskId: t.id, agentId: e.target.value || null });
    $(`col-${t.column}`).appendChild(card);
  }
}

function renderAssigneeOptions() {
  const sel = $('task-assignee');
  sel.innerHTML = '<option value="">— assign later —</option>' +
    [...state.agents.values()].map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
}

function renderTerminal() {
  $('term-agent').textContent = state.selected ? `· ${state.agents.get(state.selected)?.name ?? ''}` : '';
  const term = $('terminal');
  term.textContent = state.selected ? (state.term.get(state.selected) ?? '(no output yet)') : 'Select a desk to watch its terminal.';
  term.scrollTop = term.scrollHeight;
}

function addLog(entry) {
  const ul = $('log');
  const li = document.createElement('li');
  const ts = new Date(entry.ts).toLocaleTimeString();
  li.innerHTML = `<span class="ts">${ts}</span><span class="lvl-${entry.level}">${esc(entry.text)}</span>`;
  ul.prepend(li);
  while (ul.children.length > 200) ul.lastChild.remove();
}

// ---- input ----------------------------------------------------------------
$('add-task').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) return;
  send({ type: 'task:add', title, body: $('task-body').value, assignee: $('task-assignee').value || null });
  $('task-title').value = '';
  $('task-body').value = '';
});

connect();
