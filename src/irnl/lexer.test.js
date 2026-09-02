import { describe, it, expect } from 'vitest';
import { tokenize, TOK, IrnlSyntaxError } from './lexer.js';

const types = (src) => tokenize(src).map((t) => t.type);
const values = (src) => tokenize(src).filter((t) => t.type !== TOK.EOF && t.type !== TOK.NEWLINE).map((t) => t.value);

describe('IRNL lexer', () => {
  it('tokenizes a directive', () => {
    expect(values('min_cell_size 5')).toEqual(['min_cell_size', '5']);
  });

  it('treats both # and // as comments to end of line', () => {
    expect(values('a 1 # ignored\nb 2 // also ignored')).toEqual(['a', '1', 'b', '2']);
  });

  it('collapses blank-line runs into a single NEWLINE', () => {
    expect(types('a\n\n\n\nb')).toEqual([TOK.IDENT, TOK.NEWLINE, TOK.IDENT, TOK.NEWLINE, TOK.EOF]);
  });

  it('always terminates with NEWLINE then EOF', () => {
    expect(types('a').slice(-2)).toEqual([TOK.NEWLINE, TOK.EOF]);
  });

  it('reads multi-character operators before single-character ones', () => {
    expect(values('source_count >= 5')).toEqual(['source_count', '>=', '5']);
    expect(values('n > 5')).toEqual(['n', '>', '5']);
  });

  it('keeps dotted paths as one identifier', () => {
    expect(values('@aad(client.id)')).toEqual(['@', 'aad', '(', 'client.id', ')']);
  });

  it('handles escapes inside strings', () => {
    expect(values('label "a \\"quoted\\" b"')).toEqual(['label', 'a "quoted" b']);
  });

  it('reports unterminated strings with a line and column', () => {
    expect(() => tokenize('label "oops\nmore')).toThrow(IrnlSyntaxError);
    expect(() => tokenize('label "oops\nmore')).toThrow(/line 1, column 7/);
  });

  it('rejects characters that are not part of the language', () => {
    expect(() => tokenize('a ; b')).toThrow(/unexpected character/);
  });

  it('tolerates empty and whitespace-only input', () => {
    expect(types('')).toEqual([TOK.EOF]);
    expect(types('   \t  ')).toEqual([TOK.EOF]);
  });
});
