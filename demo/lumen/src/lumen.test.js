import { describe, it, expect } from 'vitest';
import { tokenize, T } from './lexer.js';
import { parse } from './parser.js';
import { run, RuntimeError } from './interpreter.js';

const out = (src) => run(src).output;
const val = (src) => run(src).value;

describe('lexer', () => {
  it('tokenizes numbers, idents, keywords', () => {
    const t = tokenize('let x = 42;');
    expect(t.map((x) => x.type)).toEqual([T.LET, T.IDENT, T.ASSIGN, T.NUM, T.SEMI, T.EOF]);
    expect(t[3].value).toBe(42);
  });
  it('handles two-char operators and comments', () => {
    const t = tokenize('a >= b # trailing\n!= c');
    const types = t.filter((x) => x.type !== T.EOF).map((x) => x.type);
    expect(types).toEqual([T.IDENT, T.GE, T.IDENT, T.NEQ, T.IDENT]);
  });
  it('parses string escapes', () => {
    const t = tokenize('"a\\nb"');
    expect(t[0].value).toBe('a\nb');
  });
});

describe('parser', () => {
  it('respects precedence: 2 + 3 * 4', () => {
    const ast = parse(tokenize('2 + 3 * 4;'));
    const expr = ast.body[0].expr;
    expect(expr.op).toBe('+');
    expect(expr.right.op).toBe('*'); // multiplication binds tighter
  });
  it('left-associates subtraction', () => {
    const ast = parse(tokenize('10 - 3 - 2;'));
    const e = ast.body[0].expr;
    expect(e.op).toBe('-');
    expect(e.left.op).toBe('-'); // (10-3)-2
  });
});

describe('arithmetic & precedence', () => {
  it('evaluates with correct precedence', () => { expect(val('2 + 3 * 4;')).toBe(14); });
  it('parens override precedence', () => { expect(val('(2 + 3) * 4;')).toBe(20); });
  it('unary minus', () => { expect(val('-5 + 3;')).toBe(-2); });
  it('modulo and division', () => { expect(val('17 % 5;')).toBe(2); expect(val('20 / 4;')).toBe(5); });
});

describe('variables & assignment', () => {
  it('let and reassign', () => { expect(val('let x = 1; x = x + 4; x;')).toBe(5); });
  it('string concat with +', () => { expect(val('"foo" + "bar";')).toBe('foobar'); });
  it('coerces on concat', () => { expect(val('"n=" + 42;')).toBe('n=42'); });
});

describe('control flow', () => {
  it('if / else', () => { expect(val('if (3 > 2) { 10; } else { 20; }')).toBe(10); });
  it('else branch', () => { expect(val('if (1 > 2) { 10; } else { 20; }')).toBe(20); });
  it('while loop accumulates', () => {
    expect(val('let s = 0; let i = 1; while (i <= 5) { s = s + i; i = i + 1; } s;')).toBe(15);
  });
  it('short-circuit and/or', () => {
    expect(val('false and (1/0);')).toBe(false); // right side never evaluated
    expect(val('true or (1/0);')).toBe(true);
  });
});

describe('functions & closures', () => {
  it('basic function call', () => {
    expect(val('let add = fn(a, b) { return a + b; }; add(3, 4);')).toBe(7);
  });
  it('closures capture environment', () => {
    const src = `
      let makeAdder = fn(n) { return fn(x) { return x + n; }; };
      let add10 = makeAdder(10);
      add10(5);
    `;
    expect(val(src)).toBe(15);
  });
  it('counter closure keeps private state', () => {
    const src = `
      let makeCounter = fn() {
        let count = 0;
        return fn() { count = count + 1; return count; };
      };
      let c = makeCounter();
      c(); c(); c();
    `;
    expect(val(src)).toBe(3);
  });
  it('recursion: factorial', () => {
    const src = 'let fact = fn(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }; fact(6);';
    expect(val(src)).toBe(720);
  });
  it('mutual recursion: even/odd', () => {
    const src = `
      let isEven = fn(n) { if (n == 0) { return true; } return isOdd(n - 1); };
      let isOdd = fn(n) { if (n == 0) { return false; } return isEven(n - 1); };
      isEven(10);
    `;
    expect(val(src)).toBe(true);
  });
});

describe('arrays & builtins', () => {
  it('array literal + index', () => { expect(val('let a = [10, 20, 30]; a[1];')).toBe(20); });
  it('len of array and string', () => { expect(val('len([1,2,3]) + len("ab");')).toBe(5); });
  it('push returns new array', () => { expect(val('let a = push([1,2], 3); a[2];')).toBe(3); });
  it('deep equality of arrays', () => { expect(val('[1, [2,3]] == [1, [2,3]];')).toBe(true); });
  it('print collects output', () => {
    expect(out('print("hello", 42); print(1 + 1);')).toEqual(['hello 42', '2']);
  });
});

describe('a real program: fibonacci + map-like loop', () => {
  it('computes fib(10)=55 and builds a list', () => {
    const src = `
      let fib = fn(n) { if (n < 2) { return n; } return fib(n-1) + fib(n-2); };
      let results = [];
      let i = 0;
      while (i < 8) { results = push(results, fib(i)); i = i + 1; }
      results;
    `;
    expect(val(src)).toEqual([0, 1, 1, 2, 3, 5, 8, 13]);
  });
});

describe('runtime errors', () => {
  it('division by zero', () => { expect(() => run('1 / 0;')).toThrow(RuntimeError); });
  it('undefined variable', () => { expect(() => run('nope;')).toThrow(RuntimeError); });
  it('index out of range', () => { expect(() => run('[1,2][5];')).toThrow(RuntimeError); });
  it('arity mismatch', () => { expect(() => run('let f = fn(a){return a;}; f(1,2);')).toThrow(RuntimeError); });
  it('calling a non-function', () => { expect(() => run('let x = 5; x();')).toThrow(RuntimeError); });
});
