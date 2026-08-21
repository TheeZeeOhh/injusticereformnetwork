/**
 * orchestrator.js — the "floor manager". Owns the agents, the board and the log,
 * turns board actions into agent runs, and emits events the transport layer
 * (server/index.js) rebroadcasts to every connected browser.
 *
 * Events: 'log'(entry) · 'term'({agentId, chunk}) · 'agent'(snapshot) ·
 *         'task'(task) · 'board'(void — full refresh hint)
 */
import { EventEmitter } from 'node:events';
import { Agent } from './agent.js';
import { Board } from './board.js';
import { ActivityLog } from './log.js';

export class Orchestrator extends EventEmitter {
  constructor(config, boardFile = null) {
    super();
    this.providers = config.providers ?? {};
    this.board = new Board(boardFile);
    this.log = new ActivityLog();
    /** @type {Map<string, Agent>} */
    this.agents = new Map();
    for (const def of config.agents ?? []) {
      this.agents.set(def.id, new Agent(def));
    }
  }

  #log(level, text, meta) {
    const entry = this.log.add(level, text, meta);
    this.emit('log', entry);
    return entry;
  }

  snapshot() {
    return {
      providers: Object.keys(this.providers),
      agents: [...this.agents.values()].map((a) => a.snapshot()),
      tasks: this.board.list(),
      log: this.log.list(),
    };
  }

  // ---- board actions -------------------------------------------------------

  addTask(input) {
    const task = this.board.add(input);
    this.#log('info', `task added: "${task.title}"`, { taskId: task.id });
    this.emit('task', task);
    return task;
  }

  assignTask(taskId, agentId) {
    if (agentId && !this.agents.has(agentId)) throw new Error(`no agent ${agentId}`);
    const task = this.board.assign(taskId, agentId);
    this.#log('info', `task "${task.title}" assigned to ${agentId ?? '(unassigned)'}`, {
      taskId,
      agentId,
    });
    this.emit('task', task);
    return task;
  }

  moveTask(taskId, column) {
    const task = this.board.move(taskId, column);
    this.emit('task', task);
    return task;
  }

  // ---- agent lifecycle -----------------------------------------------------

  startAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`no agent ${agentId}`);
    if (agent.isRunning()) throw new Error(`${agent.name} is already working`);

    const task = this.board.nextFor(agentId);
    if (!task) {
      this.#log('warn', `${agent.name} has no assigned task to start`, { agentId });
      return null;
    }

    this.board.move(task.id, 'doing');
    this.emit('task', this.board.get(task.id));

    const providerDef = this.providers[agent.provider];
    this.#log('info', `${agent.name} started "${task.title}" (${agent.provider})`, {
      agentId,
      taskId: task.id,
    });

    try {
      agent.start(
        providerDef,
        task,
        (chunk) => this.emit('term', { agentId, chunk }),
        (code, capped) => this.#onAgentExit(agent, task.id, code, capped)
      );
    } catch (err) {
      agent.status = 'error';
      this.#log('error', `${agent.name} failed to start: ${err.message}`, { agentId });
      this.emit('agent', agent.snapshot());
      return null;
    }

    this.emit('agent', agent.snapshot());
    return task;
  }

  #onAgentExit(agent, taskId, code, capped) {
    const task = this.board.get(taskId);
    if (capped) {
      this.#log('error', `${agent.name} halted by ${capped} on "${task?.title}"`, {
        agentId: agent.id,
        taskId,
      });
    } else if (code === 0) {
      if (task) {
        this.board.update(taskId, { column: 'done', result: agent.tail });
        this.emit('task', this.board.get(taskId));
      }
      this.#log('info', `${agent.name} finished "${task?.title}"`, {
        agentId: agent.id,
        taskId,
      });
    } else {
      this.#log('error', `${agent.name} exited ${code} on "${task?.title}"`, {
        agentId: agent.id,
        taskId,
      });
    }
    agent.currentTaskId = null;
    this.emit('agent', agent.snapshot());
  }

  stopAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`no agent ${agentId}`);
    agent.stop();
    this.#log('warn', `${agent.name} stopped by operator`, { agentId });
    this.emit('agent', agent.snapshot());
  }

  stopAll() {
    for (const agent of this.agents.values()) agent.stop();
  }
}
