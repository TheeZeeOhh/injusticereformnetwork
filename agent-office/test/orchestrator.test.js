import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Orchestrator } from '../server/orchestrator.js';

const CONFIG = {
  providers: {
    echo: { cmd: 'bash', args: ['-lc', 'printf "%s" "{prompt}"'] },
    slow: { cmd: 'bash', args: ['-lc', 'sleep 5; echo late'], caps: { maxRuntimeMs: 300 } },
    boom: { cmd: 'bash', args: ['-lc', 'exit 7'] },
  },
  agents: [
    { id: 'jim', name: 'Jim', role: 'worker', provider: 'echo' },
    { id: 'toby', name: 'Toby', role: 'worker', provider: 'slow' },
    { id: 'kevin', name: 'Kevin', role: 'worker', provider: 'boom' },
  ],
};

/** Wait for an agent to leave 'working'. */
async function runToCompletion(orch, agentId) {
  const agent = orch.agents.get(agentId);
  while (agent.status === 'working' || agent.isRunning()) {
    await once(orch, 'agent');
  }
  return agent;
}

test('a successful run moves the task to done and captures output', async () => {
  const orch = new Orchestrator(CONFIG);
  const task = orch.addTask({ title: 'say hi' });
  orch.assignTask(task.id, 'jim');
  orch.startAgent('jim');
  const agent = await runToCompletion(orch, 'jim');
  assert.equal(agent.status, 'done');
  assert.equal(orch.board.get(task.id).column, 'done');
  assert.match(orch.board.get(task.id).result ?? '', /say hi/);
});

test('runtime cap kills a slow agent and flags error', async () => {
  const orch = new Orchestrator(CONFIG);
  const task = orch.addTask({ title: 'stall' });
  orch.assignTask(task.id, 'toby');
  orch.startAgent('toby');
  const agent = await runToCompletion(orch, 'toby');
  assert.equal(agent.status, 'error');
  // task should NOT be marked done when the run was capped
  assert.notEqual(orch.board.get(task.id).column, 'done');
});

test('a non-zero exit flags error and leaves the task in doing', async () => {
  const orch = new Orchestrator(CONFIG);
  const task = orch.addTask({ title: 'break' });
  orch.assignTask(task.id, 'kevin');
  orch.startAgent('kevin');
  const agent = await runToCompletion(orch, 'kevin');
  assert.equal(agent.status, 'error');
  assert.equal(orch.board.get(task.id).column, 'doing');
});

test('starting an agent with no assigned task is a no-op warning', () => {
  const orch = new Orchestrator(CONFIG);
  const result = orch.startAgent('jim');
  assert.equal(result, null);
});
