// Lumen disassembler: Chunk -> human-readable bytecode listing.
import { OP, FnProto } from './opcodes.js';
import { stringify } from './semantics.js';

// Opcodes whose operand indexes the constant pool (show the resolved constant).
const CONST_OPS = new Set([OP.CONST, OP.GET_GLOBAL, OP.SET_GLOBAL, OP.DEF_GLOBAL]);
// Opcodes whose operand is a jump target (absolute instruction index).
const JUMP_OPS = new Set([OP.JUMP, OP.JUMP_IF_FALSE, OP.JUMP_IF_FALSE_PEEK, OP.JUMP_IF_TRUE_PEEK]);
// Opcodes whose operand is a raw slot/count (show as-is).
const SLOT_OPS = new Set([OP.GET_LOCAL, OP.SET_LOCAL, OP.GET_UPVALUE, OP.SET_UPVALUE, OP.CALL, OP.ARRAY]);

function constRepr(value) {
  if (value instanceof FnProto) return `<fn/${value.arity}>`;
  if (typeof value === 'string') return JSON.stringify(value);
  return stringify(value);
}

// Format a single instruction line. `chunk` supplies the constant pool.
function formatInstr(chunk, ip, instr) {
  const addr = String(ip).padStart(4, '0');
  const op = instr.op.padEnd(20, ' ');
  let detail = '';
  if (CONST_OPS.has(instr.op)) {
    detail = `${instr.operand}  # ${constRepr(chunk.constants[instr.operand])}`;
  } else if (JUMP_OPS.has(instr.op)) {
    detail = `-> ${instr.operand}`;
  } else if (instr.op === OP.CLOSURE) {
    const proto = chunk.constants[instr.operand];
    const ups = (instr.upvalues || []).map((u) => `${u.isLocal ? 'local' : 'upval'} ${u.index}`).join(', ');
    detail = `${instr.operand}  # ${constRepr(proto)}${ups ? ` captures [${ups}]` : ''}`;
  } else if (SLOT_OPS.has(instr.op)) {
    detail = String(instr.operand);
  }
  return `${addr}  ${op}${detail}`.trimEnd();
}

// Disassemble a chunk (recursively into nested function protos).
export function disassemble(chunk, seen = new Set()) {
  const lines = [`== ${chunk.name} ==`];
  chunk.code.forEach((instr, ip) => lines.push(formatInstr(chunk, ip, instr)));

  // Recurse into any FnProto constants (nested functions), once each.
  chunk.constants.forEach((k) => {
    if (k instanceof FnProto && !seen.has(k)) {
      seen.add(k);
      lines.push('');
      lines.push(...disassemble(k.chunk, seen));
    }
  });
  return lines;
}
