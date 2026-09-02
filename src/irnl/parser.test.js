import { describe, it, expect } from 'vitest';
import { parse, IrnlSyntaxError } from './parser.js';

const first = (src) => parse(src).decls[0];

describe('IRNL parser', () => {
  it('parses each declaration kind', () => {
    expect(first('vault A { recovery none }').kind).toBe('vault');
    expect(first('entity E { id Ulid }').kind).toBe('entity');
    expect(first('boundary b { deny sink(cloud) }').kind).toBe('boundary');
    expect(first('policy p { min_cell_size 5 }').kind).toBe('policy');
  });

  it('parses fields with parametric types and annotations', () => {
    const f = first('entity R {\n body Ciphertext @phi @aad(client.id)\n kind Enum(a, b)\n client Ref(C)\n}').fields;
    expect(f[0].type.name).toBe('Ciphertext');
    expect(f[0].annotations.map((a) => a.name)).toEqual(['phi', 'aad']);
    expect(f[0].annotations[1].args[0].name).toBe('client.id');
    expect(f[1].type.args.map((a) => a.name)).toEqual(['a', 'b']);
    expect(f[2].type.name).toBe('Ref');
  });

  it('parses comparisons as a single value', () => {
    const d = first('policy p { require source_count >= 5 }').directives[0];
    expect(d.args[0]).toMatchObject({ v: 'compare', left: 'source_count', op: '>=', right: 5 });
  });

  it('parses `when` as a guard rather than an argument', () => {
    const d = first('boundary b { allow sink(local_disk) when encrypted }').directives[0];
    expect(d.args).toHaveLength(1);
    expect(d.guard).toMatchObject({ v: 'ident', name: 'encrypted' });
  });

  it('parses lists', () => {
    const d = first('policy p { precedence [crisis, escalation] }').directives[0];
    expect(d.args[0].items.map((i) => i.name)).toEqual(['crisis', 'escalation']);
  });

  it('allows several directives on separate lines and none on an empty block', () => {
    expect(first('policy p {\n a 1\n b 2\n c 3\n}').directives).toHaveLength(3);
    expect(first('policy p {\n}').directives).toHaveLength(0);
  });

  it('rejects an unknown declaration keyword', () => {
    expect(() => parse('widget W { }')).toThrow(/unknown declaration "widget"/);
  });

  it('rejects an unterminated block', () => {
    expect(() => parse('policy p {\n a 1\n')).toThrow(IrnlSyntaxError);
  });

  it('rejects a comparison with no right-hand side', () => {
    expect(() => parse('policy p { require n >= }')).toThrow(/comparison needs a number or name/);
  });
});
