// Lumen lexer: source string -> array of tokens.

export const T = {
  NUM: 'NUM', STR: 'STR', IDENT: 'IDENT', TRUE: 'TRUE', FALSE: 'FALSE', NULL: 'NULL',
  LET: 'LET', FN: 'FN', IF: 'IF', ELSE: 'ELSE', RETURN: 'RETURN', WHILE: 'WHILE',
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH', PERCENT: 'PERCENT',
  ASSIGN: 'ASSIGN', EQ: 'EQ', NEQ: 'NEQ', LT: 'LT', GT: 'GT', LE: 'LE', GE: 'GE',
  AND: 'AND', OR: 'OR', BANG: 'BANG',
  LPAREN: 'LPAREN', RPAREN: 'RPAREN', LBRACE: 'LBRACE', RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  COMMA: 'COMMA', SEMI: 'SEMI', EOF: 'EOF',
};

const KEYWORDS = {
  let: T.LET, fn: T.FN, if: T.IF, else: T.ELSE, return: T.RETURN, while: T.WHILE,
  true: T.TRUE, false: T.FALSE, null: T.NULL, and: T.AND, or: T.OR,
};

export class LexError extends Error {}

export function tokenize(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const peek = (o = 0) => src[i + o];
  const adv = () => { const c = src[i++]; if (c === '\n') { line++; col = 1; } else col++; return c; };
  const push = (type, value) => toks.push({ type, value, line, col });

  const isDigit = (c) => c >= '0' && c <= '9';
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  const isAlnum = (c) => isAlpha(c) || isDigit(c);

  while (i < src.length) {
    const c = peek();
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }
    // comments: # to end of line
    if (c === '#') { while (i < src.length && peek() !== '\n') adv(); continue; }
    const startLine = line, startCol = col;

    if (isDigit(c)) {
      let n = '';
      while (i < src.length && isDigit(peek())) n += adv();
      if (peek() === '.' && isDigit(peek(1))) { n += adv(); while (i < src.length && isDigit(peek())) n += adv(); }
      toks.push({ type: T.NUM, value: Number(n), line: startLine, col: startCol });
      continue;
    }
    if (isAlpha(c)) {
      let s = '';
      while (i < src.length && isAlnum(peek())) s += adv();
      const kw = KEYWORDS[s];
      toks.push({ type: kw || T.IDENT, value: s, line: startLine, col: startCol });
      continue;
    }
    if (c === '"') {
      adv(); let s = '';
      while (i < src.length && peek() !== '"') {
        let ch = adv();
        if (ch === '\\') {
          const e = adv();
          ch = e === 'n' ? '\n' : e === 't' ? '\t' : e === '"' ? '"' : e === '\\' ? '\\' : e;
        }
        s += ch;
      }
      if (peek() !== '"') throw new LexError(`Unterminated string at line ${startLine}`);
      adv();
      toks.push({ type: T.STR, value: s, line: startLine, col: startCol });
      continue;
    }

    // two-char operators
    const two = c + (peek(1) || '');
    const twoMap = { '==': T.EQ, '!=': T.NEQ, '<=': T.LE, '>=': T.GE };
    if (twoMap[two]) { adv(); adv(); push(twoMap[two], two); continue; }

    const one = {
      '+': T.PLUS, '-': T.MINUS, '*': T.STAR, '/': T.SLASH, '%': T.PERCENT,
      '=': T.ASSIGN, '<': T.LT, '>': T.GT, '!': T.BANG,
      '(': T.LPAREN, ')': T.RPAREN, '{': T.LBRACE, '}': T.RBRACE,
      '[': T.LBRACKET, ']': T.RBRACKET, ',': T.COMMA, ';': T.SEMI,
    };
    if (one[c]) { adv(); push(one[c], c); continue; }

    throw new LexError(`Unexpected character '${c}' at line ${line}, col ${col}`);
  }
  toks.push({ type: T.EOF, value: null, line, col });
  return toks;
}
