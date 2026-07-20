import { describe, it, expect } from 'vitest';
import { run as runInterp } from './interpreter.js';
import { runVM } from './vm.js';

// Programs exercised through BOTH engines. The VM is correct iff it agrees
// with the tree-walking interpreter on every one.
const PROGRAMS = {
  'arith precedence': '2 + 3 * 4;',
  'parens': '(2 + 3) * 4;',
  'unary + sub assoc': '-5 + 3; 10 - 3 - 2;',
  'mod/div': '17 % 5; 20 / 4;',
  'let + reassign': 'let x = 1; x = x + 4; print(x);',
  'string concat': 'print("foo" + "bar"); print("n=" + 42);',
  'if': 'if (3 > 2) { print("a"); } else { print("b"); }',
  'else': 'if (1 > 2) { print("a"); } else { print("b"); }',
  'while sum': 'let s = 0; let i = 1; while (i <= 5) { s = s + i; i = i + 1; } print(s);',
  'and short-circuit': 'print(false and 999); print(true and 7);',
  'or short-circuit': 'print(true or 999); print(false or 7);',
  'fn basic': 'let add = fn(a,b){ return a+b; }; print(add(3,4));',
  'closure adder': 'let mk = fn(n){ return fn(x){ return x+n; }; }; let a=mk(10); print(a(5));',
  'closure counter': 'let mk=fn(){ let c=0; return fn(){ c=c+1; return c; }; }; let f=mk(); print(f()); print(f()); print(f());',
  'recursion factorial': 'let fact=fn(n){ if(n<=1){return 1;} return n*fact(n-1); }; print(fact(6));',
  'mutual recursion': 'let ev=fn(n){ if(n==0){return true;} return od(n-1); }; let od=fn(n){ if(n==0){return false;} return ev(n-1); }; print(ev(10)); print(od(7));',
  'arrays': 'let a=[10,20,30]; print(a[1]); print(len(a)); print(push(a,40)[3]);',
  'deep eq': 'print([1,[2,3]] == [1,[2,3]]); print([1,2]==[1,3]);',
  'nested closures 3-deep': 'let a=fn(x){ return fn(y){ return fn(z){ return x+y+z; }; }; }; print(a(1)(2)(3));',
  'fib memo-ish loop': `
    let fib=fn(n){ if(n<2){return n;} return fib(n-1)+fib(n-2); };
    let r=[]; let i=0;
    while(i<8){ r=push(r,fib(i)); i=i+1; }
    print(str(r));
  `,
  'shadowing in blocks': 'let x=1; if(true){ let x=2; print(x); } print(x);',
  'higher-order map': `
    let map=fn(arr, f){
      let out=[]; let i=0;
      while(i<len(arr)){ out=push(out, f(arr[i])); i=i+1; }
      return out;
    };
    let sq=fn(n){ return n*n; };
    print(str(map([1,2,3,4], sq)));
  `,
};

function outcome(fn, src) {
  try { const { output, value } = fn(src); return { ok: true, output, value }; }
  catch (e) { return { ok: false, error: true }; }
}

describe('differential: VM must equal tree-walking interpreter', () => {
  for (const [name, src] of Object.entries(PROGRAMS)) {
    it(name, () => {
      const a = outcome(runInterp, src);
      const b = outcome(runVM, src);
      expect(b.ok).toBe(a.ok);            // both succeed or both throw
      if (a.ok) {
        expect(b.output).toEqual(a.output); // identical printed output
        expect(b.value).toEqual(a.value);   // identical final value
      }
    });
  }
});

describe('differential: runtime errors agree', () => {
  const ERR = {
    'div zero': '1/0;',
    'undefined var': 'nope;',
    'index oob': '[1,2][9];',
    'arity': 'let f=fn(a){return a;}; f(1,2);',
    'call non-fn': 'let x=5; x();',
  };
  for (const [name, src] of Object.entries(ERR)) {
    it(name + ' throws in both', () => {
      expect(outcome(runInterp, src).ok).toBe(false);
      expect(outcome(runVM, src).ok).toBe(false);
    });
  }
});
