// Lumen stack VM: executes bytecode chunks produced by the compiler.
// Reuses shared semantics so behavior matches the tree-walking interpreter.
import { compile } from './compiler.js';
import { OP } from './opcodes.js';
import {
  RuntimeError, isTruthy, evalInfix, evalNeg, indexInto, makeBuiltins,
} from './semantics.js';

// An upvalue is a boxed reference to a variable that may outlive its frame.
// For simplicity (and correctness) we box captured variables in a 1-cell object.
class Upvalue { constructor(get, set) { this.get = get; this.set = set; } }

// A runtime closure: a FnProto plus its captured upvalues.
class Closure {
  constructor(proto, upvalues) { this.__closure = true; this.proto = proto; this.upvalues = upvalues; }
}

class Frame {
  constructor(closure, base) {
    this.closure = closure;    // Closure being executed
    this.ip = 0;               // instruction pointer
    this.base = base;          // stack index where this frame's slot 0 lives
  }
}

const INFIX_OP = {
  [OP.ADD]: '+', [OP.SUB]: '-', [OP.MUL]: '*', [OP.DIV]: '/', [OP.MOD]: '%',
  [OP.EQ]: '==', [OP.NEQ]: '!=', [OP.LT]: '<', [OP.GT]: '>', [OP.LE]: '<=', [OP.GE]: '>=',
};

export function runVM(src) {
  const topChunk = compile(src);
  const output = [];
  const builtins = makeBuiltins(output);
  const globals = new Map();

  const stack = [];
  const frames = [];

  // Slot storage: we keep locals in `stack` addressed by frame.base + slot.
  // Captured locals need to survive; we lift them into boxes lazily via upvalues
  // that read/write the stack cell (closures capture live cells within lifetime,
  // and because functions return copies of the value, we box on capture).

  // Top-level "script" runs as a closure with no upvalues.
  const scriptClosure = new Closure({ chunk: topChunk, arity: 0, upvalues: [] }, []);
  frames.push(new Frame(scriptClosure, 0));

  // Boxes: map from stack index -> Upvalue box, created when a local is captured,
  // so both the frame and the closure see the same cell.
  const openBoxes = new Map(); // stackIndex -> {cell}

  function boxFor(stackIndex) {
    let box = openBoxes.get(stackIndex);
    if (!box) {
      box = { cell: stack[stackIndex] };
      openBoxes.set(stackIndex, box);
    }
    return box;
  }

  function readLocal(base, slot) {
    const idx = base + slot;
    const box = openBoxes.get(idx);
    return box ? box.cell : stack[idx];
  }
  function writeLocal(base, slot, value) {
    const idx = base + slot;
    const box = openBoxes.get(idx);
    if (box) box.cell = value; else stack[idx] = value;
  }

  let guard = 0;
  const GUARD_MAX = 5_000_000;
  let programValue = null; // value of last top-level expression statement

  while (frames.length) {
    const frame = frames[frames.length - 1];
    const code = frame.closure.proto.chunk.code;
    const constants = frame.closure.proto.chunk.constants;

    if (frame.ip >= code.length) { frames.pop(); continue; }
    if (++guard > GUARD_MAX) throw new RuntimeError('execution limit exceeded');

    const instr = code[frame.ip++];
    switch (instr.op) {
      case OP.CONST: stack.push(constants[instr.operand]); break;
      case OP.NULL: stack.push(null); break;
      case OP.TRUE: stack.push(true); break;
      case OP.FALSE: stack.push(false); break;
      case OP.POP: {
        const popped = stack.pop();
        // Program value = value of the last top-level expression statement,
        // matching the tree-walker for the common case. Only the script frame
        // (bottom frame) contributes.
        if (frames.length === 1) programValue = popped;
        break;
      }

      case OP.GET_LOCAL: stack.push(readLocal(frame.base, instr.operand)); break;
      case OP.SET_LOCAL: writeLocal(frame.base, instr.operand, stack[stack.length - 1]); break;

      case OP.GET_GLOBAL: {
        const name = constants[instr.operand];
        if (globals.has(name)) { stack.push(globals.get(name)); break; }
        if (name in builtins) { stack.push({ __builtin: true, name }); break; }
        throw new RuntimeError(`Undefined variable '${name}'`);
      }
      case OP.DEF_GLOBAL: {
        const name = constants[instr.operand];
        globals.set(name, stack.pop());
        break;
      }
      case OP.SET_GLOBAL: {
        const name = constants[instr.operand];
        if (!globals.has(name)) throw new RuntimeError(`Cannot assign to undefined variable '${name}'`);
        globals.set(name, stack[stack.length - 1]); // assignment leaves value
        break;
      }

      case OP.GET_UPVALUE: {
        const uv = frame.closure.upvalues[instr.operand];
        stack.push(uv.get());
        break;
      }
      case OP.SET_UPVALUE: {
        const uv = frame.closure.upvalues[instr.operand];
        uv.set(stack[stack.length - 1]);
        break;
      }

      case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.MOD:
      case OP.EQ: case OP.NEQ: case OP.LT: case OP.GT: case OP.LE: case OP.GE: {
        const r = stack.pop(), l = stack.pop();
        stack.push(evalInfix(INFIX_OP[instr.op], l, r));
        break;
      }
      case OP.NEG: stack.push(evalNeg(stack.pop())); break;
      case OP.NOT: stack.push(!isTruthy(stack.pop())); break;

      case OP.JUMP: frame.ip = instr.operand; break;
      case OP.JUMP_IF_FALSE: if (!isTruthy(stack.pop())) frame.ip = instr.operand; break;
      case OP.JUMP_IF_FALSE_PEEK: if (!isTruthy(stack[stack.length - 1])) frame.ip = instr.operand; break;
      case OP.JUMP_IF_TRUE_PEEK: if (isTruthy(stack[stack.length - 1])) frame.ip = instr.operand; break;

      case OP.ARRAY: {
        const n = instr.operand;
        const arr = stack.splice(stack.length - n, n);
        stack.push(arr);
        break;
      }
      case OP.INDEX: {
        const idx = stack.pop(), target = stack.pop();
        stack.push(indexInto(target, idx));
        break;
      }

      case OP.CLOSURE: {
        const proto = constants[instr.operand];
        const upvalues = (instr.upvalues || []).map((u) => {
          if (u.isLocal) {
            // capture a local of the CURRENT frame -> box that stack cell
            const stackIndex = frame.base + u.index;
            const box = boxFor(stackIndex);
            return new Upvalue(() => box.cell, (v) => { box.cell = v; });
          }
          // capture an upvalue of the current closure (pass-through)
          const parentUv = frame.closure.upvalues[u.index];
          return new Upvalue(parentUv.get, parentUv.set);
        });
        stack.push(new Closure(proto, upvalues));
        break;
      }

      case OP.CALL: {
        const argc = instr.operand;
        const callee = stack[stack.length - 1 - argc];
        const args = stack.slice(stack.length - argc);

        if (callee && callee.__builtin) {
          const fn = builtins[callee.name];
          const result = fn(...args);
          stack.splice(stack.length - argc - 1, argc + 1); // pop callee + args
          stack.push(result);
          break;
        }
        if (callee && callee.__closure) {
          if (args.length !== callee.proto.arity)
            throw new RuntimeError(`expected ${callee.proto.arity} args, got ${args.length}`);
          // New frame: base points at first arg (slot 0). Callee sits just below base.
          const base = stack.length - argc;
          frames.push(new Frame(callee, base));
          break;
        }
        throw new RuntimeError('not a function');
      }

      case OP.RETURN: {
        const result = stack.pop();
        const finished = frames.pop();
        // clear this frame's slots (from just-below-base callee up to top),
        // releasing any open boxes for those cells.
        for (let idx = finished.base; idx < stack.length; idx++) openBoxes.delete(idx);
        // remove callee slot too (finished.base - 1) for non-script frames
        const cutFrom = frames.length ? finished.base - 1 : finished.base;
        stack.length = Math.max(cutFrom, 0);
        openBoxes.delete(finished.base - 1);
        if (frames.length) { stack.push(result); break; }
        // Top-level script return: mirror the tree-walker, whose program value
        // is the last top-level statement value (tracked as programValue for
        // expression statements; the trailing implicit NULL is ignored).
        return { output, value: programValue };
      }

      default: throw new RuntimeError(`unknown opcode ${instr.op}`);
    }
  }
  return { output, value: null };
}
