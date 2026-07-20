// Lumen parser: tokens -> AST. Pratt (precedence-climbing) for expressions.
import { T } from './lexer.js';

export class ParseError extends Error {}

// precedence levels
const P = { LOWEST: 1, OR: 2, AND: 3, EQ: 4, CMP: 5, SUM: 6, PROD: 7, PREFIX: 8, CALL: 9, INDEX: 10 };

const INFIX_PREC = {
  [T.OR]: P.OR, [T.AND]: P.AND,
  [T.EQ]: P.EQ, [T.NEQ]: P.EQ,
  [T.LT]: P.CMP, [T.GT]: P.CMP, [T.LE]: P.CMP, [T.GE]: P.CMP,
  [T.PLUS]: P.SUM, [T.MINUS]: P.SUM,
  [T.STAR]: P.PROD, [T.SLASH]: P.PROD, [T.PERCENT]: P.PROD,
  [T.LPAREN]: P.CALL, [T.LBRACKET]: P.INDEX,
};

export function parse(tokens) {
  let pos = 0;
  const cur = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    if (cur().type !== type) throw new ParseError(`Expected ${type} but got ${cur().type} (${cur().value}) at line ${cur().line}`);
    return next();
  };

  function parseProgram() {
    const stmts = [];
    while (cur().type !== T.EOF) stmts.push(parseStatement());
    return { type: 'Program', body: stmts };
  }

  function parseStatement() {
    switch (cur().type) {
      case T.LET: return parseLet();
      case T.RETURN: return parseReturn();
      case T.IF: return parseIf();
      case T.WHILE: return parseWhile();
      case T.LBRACE: return parseBlock();
      default: return parseExprStatement();
    }
  }

  function parseLet() {
    expect(T.LET);
    const name = expect(T.IDENT).value;
    expect(T.ASSIGN);
    const value = parseExpression(P.LOWEST);
    if (cur().type === T.SEMI) next();
    return { type: 'Let', name, value };
  }

  function parseReturn() {
    expect(T.RETURN);
    let value = null;
    if (cur().type !== T.SEMI && cur().type !== T.RBRACE) value = parseExpression(P.LOWEST);
    if (cur().type === T.SEMI) next();
    return { type: 'Return', value };
  }

  function parseBlock() {
    expect(T.LBRACE);
    const stmts = [];
    while (cur().type !== T.RBRACE && cur().type !== T.EOF) stmts.push(parseStatement());
    expect(T.RBRACE);
    return { type: 'Block', body: stmts };
  }

  function parseIf() {
    expect(T.IF);
    expect(T.LPAREN);
    const cond = parseExpression(P.LOWEST);
    expect(T.RPAREN);
    const consequent = parseBlock();
    let alternate = null;
    if (cur().type === T.ELSE) {
      next();
      alternate = cur().type === T.IF ? parseIf() : parseBlock();
    }
    return { type: 'If', cond, consequent, alternate };
  }

  function parseWhile() {
    expect(T.WHILE);
    expect(T.LPAREN);
    const cond = parseExpression(P.LOWEST);
    expect(T.RPAREN);
    const body = parseBlock();
    return { type: 'While', cond, body };
  }

  function parseExprStatement() {
    const expr = parseExpression(P.LOWEST);
    if (cur().type === T.SEMI) next();
    return { type: 'ExprStatement', expr };
  }

  function parseExpression(prec) {
    let left = parsePrefix();
    while (cur().type !== T.SEMI && prec < (INFIX_PREC[cur().type] || 0)) {
      left = parseInfix(left);
    }
    return left;
  }

  function parsePrefix() {
    const t = cur();
    switch (t.type) {
      case T.NUM: next(); return { type: 'Num', value: t.value };
      case T.STR: next(); return { type: 'Str', value: t.value };
      case T.TRUE: next(); return { type: 'Bool', value: true };
      case T.FALSE: next(); return { type: 'Bool', value: false };
      case T.NULL: next(); return { type: 'Null' };
      case T.IDENT: {
        next();
        // assignment: IDENT = expr
        if (cur().type === T.ASSIGN) { next(); const value = parseExpression(P.LOWEST); return { type: 'Assign', name: t.value, value }; }
        return { type: 'Ident', name: t.value };
      }
      case T.BANG: case T.MINUS: {
        next();
        const operand = parseExpression(P.PREFIX);
        return { type: 'Prefix', op: t.value, operand };
      }
      case T.LPAREN: {
        next();
        const e = parseExpression(P.LOWEST);
        expect(T.RPAREN);
        return e;
      }
      case T.LBRACKET: return parseArray();
      case T.FN: return parseFn();
      default:
        throw new ParseError(`Unexpected token ${t.type} (${t.value}) at line ${t.line}`);
    }
  }

  function parseArray() {
    expect(T.LBRACKET);
    const elements = [];
    while (cur().type !== T.RBRACKET) {
      elements.push(parseExpression(P.LOWEST));
      if (cur().type === T.COMMA) next(); else break;
    }
    expect(T.RBRACKET);
    return { type: 'Array', elements };
  }

  function parseFn() {
    expect(T.FN);
    expect(T.LPAREN);
    const params = [];
    while (cur().type !== T.RPAREN) {
      params.push(expect(T.IDENT).value);
      if (cur().type === T.COMMA) next(); else break;
    }
    expect(T.RPAREN);
    const body = parseBlock();
    return { type: 'Fn', params, body };
  }

  function parseInfix(left) {
    const t = cur();
    if (t.type === T.LPAREN) return parseCall(left);
    if (t.type === T.LBRACKET) return parseIndex(left);
    const prec = INFIX_PREC[t.type];
    next();
    const right = parseExpression(prec);
    return { type: 'Infix', op: t.value, left, right };
  }

  function parseCall(callee) {
    expect(T.LPAREN);
    const args = [];
    while (cur().type !== T.RPAREN) {
      args.push(parseExpression(P.LOWEST));
      if (cur().type === T.COMMA) next(); else break;
    }
    expect(T.RPAREN);
    return { type: 'Call', callee, args };
  }

  function parseIndex(target) {
    expect(T.LBRACKET);
    const index = parseExpression(P.LOWEST);
    expect(T.RBRACKET);
    return { type: 'Index', target, index };
  }

  return parseProgram();
}
