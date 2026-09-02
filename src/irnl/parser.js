// parser.js — IRNL recursive-descent parser: tokens -> AST.
//
// Grammar (newline-terminated directives):
//
//   program     := decl*
//   decl        := ('vault' | 'boundary' | 'policy') IDENT block
//                | 'entity' IDENT '{' field* '}'
//   block       := '{' directive* '}'
//   directive   := IDENT value* ('when' value)? NEWLINE
//   field       := IDENT typeref annotation* NEWLINE
//   typeref     := IDENT ('(' valueList ')')?
//   annotation  := '@' IDENT ('(' valueList ')')?
//   value       := STRING | NUMBER | list | call | comparison | IDENT
//   list        := '[' (value (',' value)*)? ']'
//   call        := IDENT '(' valueList ')'
//   comparison  := IDENT OP (NUMBER | IDENT)
//
// Pure module: no filesystem, safe to import anywhere.

import { tokenize, TOK, IrnlSyntaxError } from './lexer.js';

const BLOCK_DECLS = new Set(['vault', 'boundary', 'policy']);

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  next() {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return t;
  }

  at(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  expect(type, what) {
    const t = this.peek();
    if (t.type !== type) {
      throw new IrnlSyntaxError(
        `expected ${what ?? type} but found ${t.type === TOK.EOF ? 'end of file' : JSON.stringify(t.value)}`,
        t.line,
        t.column
      );
    }
    return this.next();
  }

  skipNewlines() {
    while (this.at(TOK.NEWLINE)) this.next();
  }

  parseProgram() {
    const decls = [];
    this.skipNewlines();
    while (!this.at(TOK.EOF)) {
      decls.push(this.parseDecl());
      this.skipNewlines();
    }
    return { kind: 'program', decls };
  }

  parseDecl() {
    const head = this.expect(TOK.IDENT, 'a declaration keyword');
    const keyword = head.value;
    if (keyword === 'entity') return this.parseEntity(head);
    if (BLOCK_DECLS.has(keyword)) return this.parseBlockDecl(keyword, head);
    throw new IrnlSyntaxError(
      `unknown declaration ${JSON.stringify(keyword)}; expected vault, entity, boundary, or policy`,
      head.line,
      head.column
    );
  }

  parseBlockDecl(keyword, head) {
    const name = this.expect(TOK.IDENT, `a name for the ${keyword}`).value;
    this.expect(TOK.LBRACE, '"{"');
    const directives = [];
    this.skipNewlines();
    while (!this.at(TOK.RBRACE)) {
      if (this.at(TOK.EOF)) {
        throw new IrnlSyntaxError(`unterminated ${keyword} ${JSON.stringify(name)}`, head.line, head.column);
      }
      directives.push(this.parseDirective());
      this.skipNewlines();
    }
    this.expect(TOK.RBRACE, '"}"');
    return { kind: keyword, name, directives, line: head.line };
  }

  parseDirective() {
    const verb = this.expect(TOK.IDENT, 'a directive');
    const args = [];
    let guard = null;
    while (!this.at(TOK.NEWLINE) && !this.at(TOK.RBRACE) && !this.at(TOK.EOF)) {
      // `when` introduces a conditional guard for the directive rather than a
      // plain argument: `allow sink(local_disk) when encrypted`.
      if (this.at(TOK.IDENT, 'when')) {
        this.next();
        guard = this.parseValue();
        continue;
      }
      args.push(this.parseValue());
    }
    return { kind: 'directive', verb: verb.value, args, guard, line: verb.line };
  }

  parseEntity(head) {
    const name = this.expect(TOK.IDENT, 'an entity name').value;
    this.expect(TOK.LBRACE, '"{"');
    const fields = [];
    this.skipNewlines();
    while (!this.at(TOK.RBRACE)) {
      if (this.at(TOK.EOF)) {
        throw new IrnlSyntaxError(`unterminated entity ${JSON.stringify(name)}`, head.line, head.column);
      }
      fields.push(this.parseField());
      this.skipNewlines();
    }
    this.expect(TOK.RBRACE, '"}"');
    return { kind: 'entity', name, fields, line: head.line };
  }

  parseField() {
    const fname = this.expect(TOK.IDENT, 'a field name');
    const typeTok = this.expect(TOK.IDENT, `a type for field ${JSON.stringify(fname.value)}`);
    const type = { name: typeTok.value, args: [] };
    if (this.at(TOK.LPAREN)) {
      this.next();
      type.args = this.parseValueList(TOK.RPAREN);
      this.expect(TOK.RPAREN, '")"');
    }
    const annotations = [];
    while (this.at(TOK.AT)) {
      this.next();
      const aname = this.expect(TOK.IDENT, 'an annotation name');
      const ann = { name: aname.value, args: [] };
      if (this.at(TOK.LPAREN)) {
        this.next();
        ann.args = this.parseValueList(TOK.RPAREN);
        this.expect(TOK.RPAREN, '")"');
      }
      annotations.push(ann);
    }
    return { kind: 'field', name: fname.value, type, annotations, line: fname.line };
  }

  parseValueList(closer) {
    const items = [];
    this.skipNewlines();
    while (!this.at(closer)) {
      items.push(this.parseValue());
      this.skipNewlines();
      if (this.at(TOK.COMMA)) {
        this.next();
        this.skipNewlines();
      }
    }
    return items;
  }

  parseValue() {
    const t = this.peek();
    if (t.type === TOK.STRING) {
      this.next();
      return { v: 'string', value: t.value, line: t.line };
    }
    if (t.type === TOK.NUMBER) {
      this.next();
      return { v: 'number', value: Number(t.value), line: t.line };
    }
    if (t.type === TOK.LBRACKET) {
      this.next();
      const items = this.parseValueList(TOK.RBRACKET);
      this.expect(TOK.RBRACKET, '"]"');
      return { v: 'list', items, line: t.line };
    }
    if (t.type === TOK.IDENT) {
      this.next();
      if (this.at(TOK.LPAREN)) {
        this.next();
        const args = this.parseValueList(TOK.RPAREN);
        this.expect(TOK.RPAREN, '")"');
        return { v: 'call', name: t.value, args, line: t.line };
      }
      if (this.at(TOK.OP)) {
        const op = this.next().value;
        const rhs = this.peek();
        if (rhs.type !== TOK.NUMBER && rhs.type !== TOK.IDENT) {
          throw new IrnlSyntaxError('comparison needs a number or name on the right', rhs.line, rhs.column);
        }
        this.next();
        return {
          v: 'compare',
          left: t.value,
          op,
          right: rhs.type === TOK.NUMBER ? Number(rhs.value) : rhs.value,
          line: t.line
        };
      }
      return { v: 'ident', name: t.value, line: t.line };
    }
    throw new IrnlSyntaxError(`unexpected ${JSON.stringify(t.value || t.type)} in value position`, t.line, t.column);
  }
}

/**
 * Parse IRNL source into an AST.
 * @param {string} source
 * @returns {{kind: 'program', decls: object[]}}
 */
export function parse(source) {
  return new Parser(tokenize(source)).parseProgram();
}

export { IrnlSyntaxError };
