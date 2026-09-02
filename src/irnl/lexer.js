// lexer.js — IRNL tokenizer.
//
// IRNL ("IRN Language") is the declarative system language for IRN. It exists
// because our invariants — k-anonymity floors, vault separation, the PHI
// boundary, hive-mind admission — were living as PROSE in six different places
// (CLAUDE.md, memory files, system prompts, code comments) and being
// re-implemented by hand in each codebase. Prose drifts silently; the
// ai-twin-custom persona forking from zee_persona is exactly that failure.
// IRNL makes the invariants a single parsed artifact that code is tested
// against, so drift becomes a failing test instead of a quiet weakening.
//
// This module is PURE (no node:fs, no globals) so it is safe to import from
// browser/app code as well as from the CLI.

export const TOK = {
  IDENT: 'IDENT',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  OP: 'OP',
  AT: 'AT',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF'
};

// Multi-character operators must be tried before single-character ones.
const OPERATORS = ['>=', '<=', '==', '!=', '>', '<'];

const SINGLES = {
  '{': TOK.LBRACE,
  '}': TOK.RBRACE,
  '[': TOK.LBRACKET,
  ']': TOK.RBRACKET,
  '(': TOK.LPAREN,
  ')': TOK.RPAREN,
  ',': TOK.COMMA,
  '@': TOK.AT
};

export class IrnlSyntaxError extends Error {
  constructor(message, line, column) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'IrnlSyntaxError';
    this.line = line;
    this.column = column;
  }
}

const isIdentStart = (c) => /[A-Za-z_]/.test(c);
// Dots are part of identifiers so annotations like @aad(client.id) read as one
// path token rather than three; the validator splits on '.' when resolving.
const isIdentPart = (c) => /[A-Za-z0-9_.]/.test(c);
const isDigit = (c) => /[0-9]/.test(c);

/**
 * Tokenize IRNL source.
 *
 * Newlines are significant: a directive ends at end-of-line, which keeps the
 * grammar terminator-free without making the language whitespace-indented.
 * Runs of blank lines collapse to a single NEWLINE token so the parser never
 * has to skip them by hand.
 *
 * @param {string} source
 * @returns {Array<{type: string, value: string, line: number, column: number}>}
 */
export function tokenize(source) {
  const src = String(source ?? '');
  const tokens = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const col = () => i - lineStart + 1;
  const push = (type, value, startCol) => {
    tokens.push({ type, value, line, column: startCol ?? col() });
  };

  while (i < src.length) {
    const c = src[i];

    // Horizontal whitespace is insignificant.
    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
      continue;
    }

    // Comments run to end of line. Both '#' and '//' are accepted: '#' reads
    // naturally in a policy file, '//' is what the rest of this repo uses.
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    if (c === '\n') {
      // Collapse blank-line runs: only emit a NEWLINE if the last token wasn't one.
      const last = tokens[tokens.length - 1];
      if (last && last.type !== TOK.NEWLINE) push(TOK.NEWLINE, '\n');
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }

    if (c === '"') {
      const startCol = col();
      i += 1;
      let value = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) {
          const esc = src[i + 1];
          value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
          i += 2;
          continue;
        }
        if (src[i] === '\n') {
          throw new IrnlSyntaxError('unterminated string literal', line, startCol);
        }
        value += src[i];
        i += 1;
      }
      if (i >= src.length) {
        throw new IrnlSyntaxError('unterminated string literal', line, startCol);
      }
      i += 1; // closing quote
      push(TOK.STRING, value, startCol);
      continue;
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      const startCol = col();
      i += op.length;
      push(TOK.OP, op, startCol);
      continue;
    }

    if (SINGLES[c]) {
      const startCol = col();
      i += 1;
      push(SINGLES[c], c, startCol);
      continue;
    }

    if (isDigit(c)) {
      const startCol = col();
      let value = '';
      while (i < src.length && (isDigit(src[i]) || src[i] === '.')) {
        value += src[i];
        i += 1;
      }
      push(TOK.NUMBER, value, startCol);
      continue;
    }

    if (isIdentStart(c)) {
      const startCol = col();
      let value = '';
      while (i < src.length && isIdentPart(src[i])) {
        value += src[i];
        i += 1;
      }
      push(TOK.IDENT, value, startCol);
      continue;
    }

    throw new IrnlSyntaxError(`unexpected character ${JSON.stringify(c)}`, line, col());
  }

  // A trailing NEWLINE lets the parser treat every directive uniformly.
  const last = tokens[tokens.length - 1];
  if (last && last.type !== TOK.NEWLINE) push(TOK.NEWLINE, '\n');
  push(TOK.EOF, '');
  return tokens;
}
