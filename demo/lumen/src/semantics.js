// Shared value semantics for Lumen — used by BOTH the tree-walking interpreter
// and the bytecode VM, so the two engines are guaranteed to agree on the
// meaning of values, operators, truthiness, equality, and builtins.

export class RuntimeError extends Error {}

export const isTruthy = (v) => v !== null && v !== false && v !== 0 && v !== '';

export function stringify(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(stringify).join(', ') + ']';
  if (v && v.__fn) return '<fn>';
  if (v && v.__closure) return '<fn>';
  if (v && v.__builtin) return '<builtin>';
  return String(v);
}

export function deepEq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  return a === b;
}

const num = (v) => { if (typeof v !== 'number') throw new RuntimeError(`expected number, got ${stringify(v)}`); return v; };

export function evalInfix(op, l, r) {
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

export function evalNeg(v) { if (typeof v !== 'number') throw new RuntimeError('unary - expects number'); return -v; }

export function indexInto(target, idx) {
  if (Array.isArray(target) || typeof target === 'string') {
    if (typeof idx !== 'number') throw new RuntimeError('index must be a number');
    if (idx < 0 || idx >= target.length) throw new RuntimeError(`index ${idx} out of range`);
    return target[idx];
  }
  throw new RuntimeError('cannot index this value');
}

// Builtins keyed by name; each returns a value. `output` array collects prints.
export function makeBuiltins(output) {
  const b = {};
  b.print = (...args) => { output.push(args.map(stringify).join(' ')); return null; };
  b.len = (x) => { if (typeof x === 'string' || Array.isArray(x)) return x.length; throw new RuntimeError('len() expects string or array'); };
  b.push = (arr, v) => { if (!Array.isArray(arr)) throw new RuntimeError('push() expects array'); return [...arr, v]; };
  b.str = (x) => stringify(x);
  b.int = (x) => { const n = parseInt(x, 10); if (Number.isNaN(n)) throw new RuntimeError('int() failed'); return n; };
  return b;
}
