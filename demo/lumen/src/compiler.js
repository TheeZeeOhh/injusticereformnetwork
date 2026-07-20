// Lumen compiler: AST -> bytecode Chunk. Single pass.
// Resolves locals (slots), upvalues (closure capture), and globals.
import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { OP, Chunk, FnProto } from './opcodes.js';

export class CompileError extends Error {}

// One FunctionCompiler per function body (and one for the top-level script).
class FunctionCompiler {
  constructor(name, enclosing) {
    this.name = name;
    this.enclosing = enclosing;       // parent FunctionCompiler or null
    this.chunk = new Chunk(name);
    this.locals = [];                 // { name, depth } — index === slot
    this.upvalues = [];               // { isLocal, index, name }
    this.scopeDepth = 0;
  }

  addLocal(name) {
    this.locals.push({ name, depth: this.scopeDepth });
    return this.locals.length - 1;
  }
  resolveLocal(name) {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i].name === name) return i;
    }
    return -1;
  }
  addUpvalue(index, isLocal, name) {
    // dedupe
    for (let i = 0; i < this.upvalues.length; i++) {
      const u = this.upvalues[i];
      if (u.index === index && u.isLocal === isLocal) return i;
    }
    this.upvalues.push({ isLocal, index, name });
    return this.upvalues.length - 1;
  }
  // Resolve `name` as an upvalue: find it as a local in an enclosing fn, or
  // recursively as an upvalue of the enclosing fn.
  resolveUpvalue(name) {
    if (!this.enclosing) return -1;
    const local = this.enclosing.resolveLocal(name);
    if (local !== -1) return this.addUpvalue(local, true, name);
    const up = this.enclosing.resolveUpvalue(name);
    if (up !== -1) return this.addUpvalue(up, false, name);
    return -1;
  }
}

export function compile(src) {
  const ast = parse(tokenize(src));
  const top = new FunctionCompiler('<script>', null);
  const cc = { current: top };

  function chunk() { return cc.current.chunk; }

  function beginScope() { cc.current.scopeDepth++; }
  function endScope() {
    const c = cc.current;
    c.scopeDepth--;
    // pop locals that fall out of scope
    while (c.locals.length && c.locals[c.locals.length - 1].depth > c.scopeDepth) {
      c.locals.pop();
      chunk().emit(OP.POP);
    }
  }

  function compileNode(node) {
    switch (node.type) {
      case 'Program': {
        for (const s of node.body) compileStmt(s);
        return;
      }
      default: compileStmt(node);
    }
  }

  function compileStmt(node) {
    switch (node.type) {
      case 'Let': {
        compileExpr(node.value);
        const c = cc.current;
        if (c.scopeDepth === 0 && c.enclosing === null) {
          const k = chunk().addConstant(node.name);
          chunk().emit(OP.DEF_GLOBAL, k);
        } else {
          c.addLocal(node.name); // value already on stack occupies the slot
        }
        return;
      }
      case 'ExprStatement': {
        compileExpr(node.expr);
        chunk().emit(OP.POP);
        return;
      }
      case 'Return': {
        if (node.value) compileExpr(node.value); else chunk().emit(OP.NULL);
        chunk().emit(OP.RETURN);
        return;
      }
      case 'Block': {
        beginScope();
        for (const s of node.body) compileStmt(s);
        endScope();
        return;
      }
      case 'If': {
        compileExpr(node.cond);
        const elseJump = chunk().emit(OP.JUMP_IF_FALSE, -1);
        compileStmt(node.consequent);
        const endJump = chunk().emit(OP.JUMP, -1);
        chunk().patch(elseJump, chunk().code.length);
        if (node.alternate) compileStmt(node.alternate);
        chunk().patch(endJump, chunk().code.length);
        return;
      }
      case 'While': {
        const loopStart = chunk().code.length;
        compileExpr(node.cond);
        const exitJump = chunk().emit(OP.JUMP_IF_FALSE, -1);
        compileStmt(node.body);
        chunk().emit(OP.JUMP, loopStart);
        chunk().patch(exitJump, chunk().code.length);
        return;
      }
      default:
        // bare expression used as statement (defensive)
        compileExpr(node);
        chunk().emit(OP.POP);
    }
  }

  function compileExpr(node) {
    switch (node.type) {
      case 'Num': chunk().emit(OP.CONST, chunk().addConstant(node.value)); return;
      case 'Str': chunk().emit(OP.CONST, chunk().addConstant(node.value)); return;
      case 'Bool': chunk().emit(node.value ? OP.TRUE : OP.FALSE); return;
      case 'Null': chunk().emit(OP.NULL); return;

      case 'Array': {
        for (const el of node.elements) compileExpr(el);
        chunk().emit(OP.ARRAY, node.elements.length);
        return;
      }

      case 'Ident': {
        emitVarGet(node.name);
        return;
      }

      case 'Assign': {
        compileExpr(node.value);
        emitVarSet(node.name); // leaves value on stack (assignment is an expression)
        return;
      }

      case 'Prefix': {
        compileExpr(node.operand);
        chunk().emit(node.op === '-' ? OP.NEG : OP.NOT);
        return;
      }

      case 'Infix': {
        if (node.op === 'and') { compileAnd(node); return; }
        if (node.op === 'or') { compileOr(node); return; }
        compileExpr(node.left);
        compileExpr(node.right);
        const map = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD,
          '==': OP.EQ, '!=': OP.NEQ, '<': OP.LT, '>': OP.GT, '<=': OP.LE, '>=': OP.GE };
        const op = map[node.op];
        if (!op) throw new CompileError(`unknown operator ${node.op}`);
        chunk().emit(op);
        return;
      }

      case 'Index': {
        compileExpr(node.target);
        compileExpr(node.index);
        chunk().emit(OP.INDEX);
        return;
      }

      case 'Call': {
        compileExpr(node.callee);
        for (const a of node.args) compileExpr(a);
        chunk().emit(OP.CALL, node.args.length);
        return;
      }

      case 'Fn': {
        compileFunction(node);
        return;
      }

      default: throw new CompileError(`cannot compile expr ${node.type}`);
    }
  }

  // `and`: if left falsy, result is left; else result is right.  (matches interpreter)
  function compileAnd(node) {
    compileExpr(node.left);
    // need value AND branch decision. JUMP_IF_FALSE pops; we want to keep left if false.
    // Strategy: duplicate not available; recompute via conditional.
    // Emit: left ; JUMP_IF_FALSE_KEEP? -- simpler: use a small dance with locals-free logic.
    // We implement: [left] ; JIF end_keep_left  -> but JIF pops. So instead:
    //   left ; JUMP_IF_FALSE L1 ; POP ; right ; JUMP L2 ; L1: <left already popped> push?
    // To keep semantics exact and simple, use JUMP_IF_FALSE_PEEK-like via NOT trick:
    // Easiest correct approach: compile as if-expression using a temp is overkill.
    // Use dedicated peeking jumps:
    const jumpIfFalse = chunk().emit('JUMP_IF_FALSE_PEEK', -1);
    chunk().emit(OP.POP);          // discard left (was truthy)
    compileExpr(node.right);        // result = right
    chunk().patch(jumpIfFalse, chunk().code.length);
  }

  // `or`: if left truthy, result is left; else result is right.
  function compileOr(node) {
    compileExpr(node.left);
    const jumpIfTrue = chunk().emit('JUMP_IF_TRUE_PEEK', -1);
    chunk().emit(OP.POP);          // discard left (was falsy)
    compileExpr(node.right);
    chunk().patch(jumpIfTrue, chunk().code.length);
  }

  function emitVarGet(name) {
    const c = cc.current;
    const local = c.resolveLocal(name);
    if (local !== -1) { chunk().emit(OP.GET_LOCAL, local); return; }
    const up = c.resolveUpvalue(name);
    if (up !== -1) { chunk().emit(OP.GET_UPVALUE, up); return; }
    const k = chunk().addConstant(name);
    chunk().emit(OP.GET_GLOBAL, k);
  }

  function emitVarSet(name) {
    const c = cc.current;
    const local = c.resolveLocal(name);
    if (local !== -1) { chunk().emit(OP.SET_LOCAL, local); return; }
    const up = c.resolveUpvalue(name);
    if (up !== -1) { chunk().emit(OP.SET_UPVALUE, up); return; }
    const k = chunk().addConstant(name);
    chunk().emit(OP.SET_GLOBAL, k);
  }

  function compileFunction(node) {
    const fc = new FunctionCompiler('<fn>', cc.current);
    cc.current = fc;
    fc.scopeDepth++; // params live in scope depth 1
    for (const p of node.params) fc.addLocal(p);
    // body is a Block; compile its statements directly in the function scope
    for (const s of node.body.body) compileStmt(s);
    // implicit return null
    fc.chunk.emit(OP.NULL);
    fc.chunk.emit(OP.RETURN);

    const proto = new FnProto(node.params.length ? '<fn>' : '<fn>', node.params.length, fc.chunk, fc.upvalues);
    cc.current = fc.enclosing;

    const k = chunk().addConstant(proto);
    chunk().emit(OP.CLOSURE, k, { upvalues: proto.upvalues });
  }

  compileNode(ast);
  chunk().emit(OP.NULL);
  chunk().emit(OP.RETURN);
  return top.chunk;
}
