// Lumen bytecode opcodes + Chunk container.

export const OP = {
  CONST: 'CONST',        // push constants[operand]
  NULL: 'NULL',
  TRUE: 'TRUE',
  FALSE: 'FALSE',
  POP: 'POP',            // discard top of stack

  GET_LOCAL: 'GET_LOCAL',   // push locals[operand] (slot in current frame)
  SET_LOCAL: 'SET_LOCAL',   // locals[operand] = peek (leaves value on stack)
  GET_GLOBAL: 'GET_GLOBAL', // push globals[name=constants[operand]]
  SET_GLOBAL: 'SET_GLOBAL', // assign existing global
  DEF_GLOBAL: 'DEF_GLOBAL', // define new global
  GET_UPVALUE: 'GET_UPVALUE',
  SET_UPVALUE: 'SET_UPVALUE',

  ADD: 'ADD', SUB: 'SUB', MUL: 'MUL', DIV: 'DIV', MOD: 'MOD',
  EQ: 'EQ', NEQ: 'NEQ', LT: 'LT', GT: 'GT', LE: 'LE', GE: 'GE',
  NEG: 'NEG', NOT: 'NOT',

  JUMP: 'JUMP',                 // ip = operand
  JUMP_IF_FALSE: 'JUMP_IF_FALSE', // pop; if falsy ip = operand
  JUMP_IF_FALSE_PEEK: 'JUMP_IF_FALSE_PEEK', // if top falsy jump (leave value); used by `and`
  JUMP_IF_TRUE_PEEK: 'JUMP_IF_TRUE_PEEK',   // if top truthy jump (leave value); used by `or`

  ARRAY: 'ARRAY',   // pop operand elements -> array
  INDEX: 'INDEX',   // pop index, target -> element

  CLOSURE: 'CLOSURE', // build closure from constants[operand] (a FnProto) + capture upvalues
  CALL: 'CALL',       // call with operand args
  RETURN: 'RETURN',   // return top of stack from current frame
};

// A compiled function/program body.
export class Chunk {
  constructor(name = '<script>') {
    this.name = name;
    this.code = [];        // array of { op, operand } and for CLOSURE: { op, operand, upvalues }
    this.constants = [];   // constant pool (numbers, strings, FnProto, etc.)
  }
  emit(op, operand = null, extra = null) {
    const instr = { op, operand };
    if (extra) Object.assign(instr, extra);
    this.code.push(instr);
    return this.code.length - 1; // index, for jump patching
  }
  addConstant(value) {
    this.constants.push(value);
    return this.constants.length - 1;
  }
  patch(index, operand) { this.code[index].operand = operand; }
}

// Compiled function prototype (before closure capture).
export class FnProto {
  constructor(name, arity, chunk, upvalues) {
    this.name = name;
    this.arity = arity;
    this.chunk = chunk;
    this.upvalues = upvalues; // [{ isLocal, index }]
  }
}
