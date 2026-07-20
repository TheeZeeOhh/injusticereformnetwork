// Lumen interpreter: tree-walking evaluator with lexical scope + closures.
import { tokenize } from './lexer.js';
import { parse } from './parser.js';

export class RuntimeError extends Error {}

// Environment: lexical scope chain.
class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  define(name, value) { this.vars.set(name, value); }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new RuntimeError(`Undefined variable '${name}'`);
  }
  assign(name, value) {
    if (this.vars.has(name)) { this.vars.set(name, value); return value; }
    if (this.parent) return this.parent.assign(name, value);
    throw new RuntimeError(`Cannot assign to undefined variable '${name}'`);
  }
}

// Signal used to unwind the stack on `return`.
class ReturnSignal { constructor(value) { this.value = value; } }

const isTruthy = (v) => v !== null && v !== false && v !== 0 && v !== '';

function makeGlobals(output) {
  const env = new Env();
  const builtin = (fn) => ({ __builtin: true, call: fn });
  env.define('print', builtin((...args) => { output.push(args.map(stringify).join(' ')); return null; }));
  env.define('len', builtin((x) => {
    if (typeof x === 'string' || Array.isArray(x)) return x.length;
    throw new RuntimeError('len() expects string or array');
  }));
  env.define('push', builtin((arr, v) => { if (!Array.isArray(arr)) throw new RuntimeError('push() expects array'); return [...arr, v]; }));
  env.define('str', builtin((x) => stringify(x)));
  env.define('int', builtin((x) => { const n = parseInt(x, 10); if (Number.isNaN(n)) throw new RuntimeError('int() failed'); return n; }));
  return env;
}

export function stringify(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(stringify).join(', ') + ']';
  if (v && v.__fn) return '<fn>';
  if (v && v.__builtin) return '<builtin>';
  return String(v);
}

function evalNode(node, env) {
  switch (node.type) {
    case 'Program': case 'Block': {
      const scope = node.type === 'Block' ? new Env(env) : env;
      let result = null;
      for (const stmt of node.body) result = evalNode(stmt, scope);
      return result;
    }
    case 'Let': { env.define(node.name, evalNode(node.value, env)); return null; }
    case 'Assign': return env.assign(node.name, evalNode(node.value, env));
    case 'ExprStatement': return evalNode(node.expr, env);
    case 'Return': throw new ReturnSignal(node.value ? evalNode(node.value, env) : null);
    case 'Num': return node.value;
    case 'Str': return node.value;
    case 'Bool': return node.value;
    case 'Null': return null;
    case 'Ident': return env.get(node.name);
    case 'Array': return node.elements.map((e) => evalNode(e, env));

    case 'If':
      if (isTruthy(evalNode(node.cond, env))) return evalNode(node.consequent, env);
      if (node.alternate) return evalNode(node.alternate, env);
      return null;

    case 'While': {
      let result = null;
      while (isTruthy(evalNode(node.cond, env))) result = evalNode(node.body, env);
      return result;
    }

    case 'Fn': return { __fn: true, params: node.params, body: node.body, closure: env };

    case 'Prefix': {
      const v = evalNode(node.operand, env);
      if (node.op === '-') { if (typeof v !== 'number') throw new RuntimeError('unary - expects number'); return -v; }
      if (node.op === '!') return !isTruthy(v);
      throw new RuntimeError(`unknown prefix ${node.op}`);
    }

    case 'Infix': {
      // short-circuit logical ops
      if (node.op === 'and') return isTruthy(evalNode(node.left, env)) ? evalNode(node.right, env) : evalNode(node.left, env);
      if (node.op === 'or') { const l = evalNode(node.left, env); return isTruthy(l) ? l : evalNode(node.right, env); }
      return evalInfix(node.op, evalNode(node.left, env), evalNode(node.right, env));
    }

    case 'Index': {
      const target = evalNode(node.target, env);
      const idx = evalNode(node.index, env);
      if (Array.isArray(target) || typeof target === 'string') {
        if (typeof idx !== 'number') throw new RuntimeError('index must be a number');
        if (idx < 0 || idx >= target.length) throw new RuntimeError(`index ${idx} out of range`);
        return target[idx];
      }
      throw new RuntimeError('cannot index this value');
    }

    case 'Call': {
      const callee = evalNode(node.callee, env);
      const args = node.args.map((a) => evalNode(a, env));
      return applyFn(callee, args);
    }

    default: throw new RuntimeError(`unknown node type ${node.type}`);
  }
}

function applyFn(callee, args) {
  if (callee && callee.__builtin) return callee.call(...args);
  if (callee && callee.__fn) {
    if (args.length !== callee.params.length)
      throw new RuntimeError(`expected ${callee.params.length} args, got ${args.length}`);
    const scope = new Env(callee.closure);
    callee.params.forEach((p, i) => scope.define(p, args[i]));
    try {
      evalNode(callee.body, scope);
      return null;
    } catch (sig) {
      if (sig instanceof ReturnSignal) return sig.value;
      throw sig;
    }
  }
  throw new RuntimeError('not a function');
}

function evalInfix(op, l, r) {
  switch (op) {
    case '+':
      if (typeof l === 'string' || typeof r === 'string') return stringify(l) + stringify(r);
      return num(l) + num(r);
    case '-': return num(l) - num(r);
    case '*': return num(l) * num(r);
    case '/': if (num(r) === 0) throw new RuntimeError('division by zero'); return num(l) / num(r);
    case '%': if (num(r) === 0) throw new RuntimeError('modulo by zero'); return num(l) % num(r);
    case '==': return deepEq(l, r);
    case '!=': return !deepEq(l, r);
    case '<': return num(l) < num(r);
    case '>': return num(l) > num(r);
    case '<=': return num(l) <= num(r);
    case '>=': return num(l) >= num(r);
    default: throw new RuntimeError(`unknown operator ${op}`);
  }
}

const num = (v) => { if (typeof v !== 'number') throw new RuntimeError(`expected number, got ${stringify(v)}`); return v; };
function deepEq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  return a === b;
}

// Public API: run source, return { output: string[], value }
export function run(src) {
  const ast = parse(tokenize(src));
  const output = [];
  const env = makeGlobals(output);
  const value = evalNode(ast, env);
  return { output, value };
}
