import { describe, it, expect } from 'vitest';
import { compile } from './compiler.js';
import { disassemble } from './disassembler.js';
import { OP } from './opcodes.js';

const dis = (src) => disassemble(compile(src));
const joined = (src) => dis(src).join('\n');

describe('disassembler: constant resolution', () => {
  it('CONST shows the resolved literal', () => {
    const lines = dis('42;');
    expect(lines.some((l) => /CONST\s+\d+\s+# 42/.test(l))).toBe(true);
  });
  it('GET_GLOBAL/DEF_GLOBAL show the variable name as a string', () => {
    const lines = dis('let name = 1; name;');
    expect(lines.some((l) => /DEF_GLOBAL\s+\d+\s+# "name"/.test(l))).toBe(true);
    expect(lines.some((l) => /GET_GLOBAL\s+\d+\s+# "name"/.test(l))).toBe(true);
  });
  it('string constants are quoted', () => {
    expect(joined('"hi";')).toContain('# "hi"');
  });
});

describe('disassembler: jumps show targets', () => {
  it('if emits JUMP_IF_FALSE and JUMP with numeric targets', () => {
    const lines = dis('if (1 > 0) { 2; } else { 3; }');
    const jif = lines.find((l) => l.includes('JUMP_IF_FALSE'));
    const jmp = lines.find((l) => /\bJUMP\b/.test(l) && l.includes('->'));
    expect(jif).toMatch(/-> \d+/);
    expect(jmp).toMatch(/-> \d+/);
  });
  it('while loops back to an earlier address', () => {
    const lines = dis('let i=0; while(i<3){ i=i+1; }');
    // the back-edge JUMP target must be <= its own address (loop back)
    const backEdge = lines.find((l) => /\bJUMP\b/.test(l) && l.includes('->') && !l.includes('IF'));
    expect(backEdge).toBeTruthy();
    const selfAddr = parseInt(backEdge.slice(0, 4), 10);
    const target = parseInt(backEdge.match(/-> (\d+)/)[1], 10);
    expect(target).toBeLessThan(selfAddr); // it jumps backward
  });
});

describe('disassembler: locals & calls', () => {
  it('function body uses GET_LOCAL with slot numbers', () => {
    const j = joined('let f = fn(a,b){ return a+b; }; f(1,2);');
    expect(j).toMatch(/GET_LOCAL\s+0/);
    expect(j).toMatch(/GET_LOCAL\s+1/);
    expect(j).toMatch(/CALL\s+2/);
  });
});

describe('disassembler: closures', () => {
  it('CLOSURE annotates captured upvalues', () => {
    const j = joined('let mk = fn(n){ return fn(x){ return x+n; }; }; mk(1);');
    // inner closure captures `n` as a local of the enclosing fn
    expect(j).toMatch(/CLOSURE .*captures \[local 0\]/);
    // the getter for the captured var is GET_UPVALUE
    expect(j).toMatch(/GET_UPVALUE\s+0/);
  });
  it('recurses into nested function chunks (prints multiple headers)', () => {
    const lines = dis('let mk = fn(n){ return fn(x){ return x+n; }; }; mk(1);');
    const headers = lines.filter((l) => l.startsWith('== '));
    expect(headers.length).toBeGreaterThanOrEqual(3); // script + outer fn + inner fn
  });
});

describe('disassembler: robustness', () => {
  it('formats every opcode the compiler emits without throwing', () => {
    const src = `
      let g = 1;
      let f = fn(a, b) {
        let arr = [a, b, 3];
        if (a and b or false) { return arr[0]; }
        let i = 0;
        while (i < b) { i = i + 1; }
        return -i + !a;
      };
      g = f(2, 3);
      print(g);
    `;
    const lines = dis(src);
    // sanity: no line is undefined/empty-op, every non-blank/non-header line starts with a 4-digit address
    for (const l of lines) {
      if (l === '' || l.startsWith('== ')) continue;
      expect(l).toMatch(/^\d{4}  \S+/);
    }
    // and it actually contains a spread of opcode families
    const j = lines.join('\n');
    for (const op of [OP.CONST, OP.ARRAY, OP.CALL, OP.RETURN, OP.CLOSURE, OP.JUMP]) {
      expect(j).toContain(op);
    }
  });
});
