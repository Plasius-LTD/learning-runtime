export type CppType = "int" | "double" | "bool" | "string" | "void";
export type CppValue = number | boolean | string;
export type CppExpression =
  | { kind: "literal"; value: CppValue; numberType?: "int" | "double" }
  | { kind: "variable"; name: string }
  | { kind: "call"; name: string; args: CppExpression[] }
  | { kind: "unary"; operator: string; value: CppExpression }
  | { kind: "binary"; operator: string; left: CppExpression; right: CppExpression };
export type CppStatement =
  | { kind: "block"; statements: CppStatement[] }
  | { kind: "declare"; type: CppType; constant: boolean; name: string; value?: CppExpression }
  | { kind: "assign"; name: string; value: CppExpression }
  | { kind: "expression"; value: CppExpression }
  | { kind: "if"; condition: CppExpression; then: CppStatement; otherwise?: CppStatement }
  | { kind: "while"; condition: CppExpression; body: CppStatement }
  | { kind: "for"; initial?: CppStatement; condition?: CppExpression; increment?: CppStatement; body: CppStatement }
  | { kind: "return"; value?: CppExpression }
  | { kind: "break" | "continue" };
export interface CppFunction { name: string; type: CppType; parameters: { name: string; type: CppType }[]; body: CppStatement }
export interface CppProgram { globals: CppStatement[]; functions: Map<string, CppFunction> }
export class CppProjectError extends Error {
  constructor(readonly code: "INVALID_SOURCE" | "INVALID_INPUT" | "BUDGET_EXCEEDED" | "EXECUTION_FAILED" | "CLOSED") {
    super(`Robot program ${code.toLowerCase().replaceAll("_", " ")}.`); this.name = "CppProjectError";
  }
}
interface Token { text: string; value?: CppValue; numberType?: "int" | "double"; kind: "symbol" | "identifier" | "literal" }
const TYPES = new Set(["int", "double", "bool", "string", "void"]);
const RESERVED = new Set([...TYPES, "const", "if", "else", "while", "for", "return", "break", "continue", "true", "false"]);
const PRECEDENCE: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
function invalid(): never { throw new CppProjectError("INVALID_SOURCE"); }

function tokenize(source: string): Token[] {
  if (typeof source !== "string" || source.length > 32768 || source.includes("\0")) invalid();
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset);
    if (/^\s/u.test(rest)) { offset++; continue; }
    if (rest.startsWith("//")) { const end = source.indexOf("\n", offset); offset = end < 0 ? source.length : end + 1; continue; }
    if (rest.startsWith("/*")) { const end = source.indexOf("*/", offset + 2); if (end < 0) invalid(); offset = end + 2; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(rest);
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(rest);
    if (number) { tokens.push({ text: number[0], kind: "literal", value: Number(number[0]), numberType: /[.eE]/u.test(number[0]) ? "double" : "int" }); offset += number[0].length; }
    else if (identifier) {
      if (identifier[0].length > 64) invalid();
      tokens.push({ text: identifier[0], kind: "identifier" }); offset += identifier[0].length;
    } else if (rest[0] === '"') {
      const quoted = /^"(?:[^"\\\r\n]|\\.)*"/u.exec(rest);
      if (!quoted) invalid();
      let value: unknown;
      try { value = JSON.parse(quoted[0]); } catch { invalid(); }
      if (typeof value !== "string" || value.length > 256 || value.includes("\0")) invalid();
      tokens.push({ text: quoted[0], kind: "literal", value }); offset += quoted[0].length;
    } else {
      const operator = /^(?:==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|[{}();,=+*/%!<>-])/u.exec(rest);
      if (!operator) invalid();
      tokens.push({ text: operator[0], kind: "symbol" }); offset += operator[0].length;
    }
    if (tokens.length > 4096) invalid();
  }
  tokens.push({ text: "<end>", kind: "symbol" });
  return tokens;
}

class Parser {
  #offset = 0;
  #depth = 0;
  constructor(private readonly tokens: Token[]) {}
  current(): Token { return this.tokens[this.#offset]!; }
  is(text: string): boolean { return this.current().text === text; }
  take(): Token { if (this.is("<end>")) invalid(); return this.tokens[this.#offset++]!; }
  accept(text: string): boolean { if (!this.is(text)) return false; this.take(); return true; }
  expect(text: string): void { if (!this.accept(text)) invalid(); }
  name(): string { const token = this.take(); if (token.kind !== "identifier" || RESERVED.has(token.text)) invalid(); return token.text; }
  type(): CppType { const token = this.take(); if (!TYPES.has(token.text)) invalid(); return token.text as CppType; }
  nested<T>(operation: () => T): T {
    if (++this.#depth > 64) invalid();
    try { return operation(); } finally { this.#depth--; }
  }
  program(): CppProgram {
    const globals: CppStatement[] = [];
    const functions = new Map<string, CppFunction>();
    const names = new Set<string>();
    while (!this.is("<end>")) {
      const constant = this.accept("const");
      const type = this.type();
      const name = this.name();
      if (names.has(name) || names.size >= 64) invalid();
      names.add(name);
      if (this.accept("(")) {
        if (constant || functions.size >= 32) invalid();
        const parameters: CppFunction["parameters"] = [];
        if (!this.is(")")) {
          do {
            const parameterType = this.type(); const parameterName = this.name();
            if (parameterType === "void" || parameters.some(parameter => parameter.name === parameterName) || parameters.length >= 8) invalid();
            parameters.push({ type: parameterType, name: parameterName });
          } while (this.accept(","));
        }
        this.expect(")");
        if (!this.is("{")) invalid();
        functions.set(name, { name, type, parameters, body: this.statement() });
      } else {
        if (type === "void") invalid();
        const value = this.accept("=") ? this.expression() : undefined;
        if (constant && !value) invalid();
        this.expect(";"); globals.push({ kind: "declare", type, constant, name, value });
      }
    }
    const loop = functions.get("loop"); const setup = functions.get("setup");
    if (!loop || loop.type !== "void" || loop.parameters.length !== 0
      || (setup && (setup.type !== "void" || setup.parameters.length !== 0))) invalid();
    return { globals, functions };
  }
  declaration(): CppStatement {
    const constant = this.accept("const"); const type = this.type(); const name = this.name();
    if (type === "void") invalid();
    const value = this.accept("=") ? this.expression() : undefined;
    if (constant && !value) invalid();
    return { kind: "declare", type, constant, name, value };
  }
  simple(): CppStatement {
    if (this.is("const") || TYPES.has(this.current().text)) return this.declaration();
    const value = this.expression();
    const operator = this.current().text;
    if (["=", "+=", "-=", "*=", "/=", "%=", "++", "--"].includes(operator)) {
      this.take(); if (value.kind !== "variable") invalid();
      const right: CppExpression = operator === "++" || operator === "--" ? { kind: "literal", value: 1 } : this.expression();
      return { kind: "assign", name: value.name, value: operator === "=" ? right : { kind: "binary", operator: operator[0]!, left: value, right } };
    }
    return { kind: "expression", value };
  }
  statement(): CppStatement {
    return this.nested(() => {
      if (this.accept("{")) {
        const statements: CppStatement[] = [];
        while (!this.accept("}")) statements.push(this.statement());
        return { kind: "block", statements };
      }
      if (this.accept("if")) {
        this.expect("("); const condition = this.expression(); this.expect(")"); const then = this.statement();
        const otherwise = this.accept("else") ? this.statement() : undefined;
        return { kind: "if", condition, then, otherwise };
      }
      if (this.accept("while")) {
        this.expect("("); const condition = this.expression(); this.expect(")");
        return { kind: "while", condition, body: this.statement() };
      }
      if (this.accept("for")) {
        this.expect("("); const initial = this.is(";") ? undefined : this.simple(); this.expect(";");
        const condition = this.is(";") ? undefined : this.expression(); this.expect(";");
        const increment = this.is(")") ? undefined : this.simple(); this.expect(")");
        return { kind: "for", initial, condition, increment, body: this.statement() };
      }
      if (this.accept("return")) {
        const value = this.is(";") ? undefined : this.expression(); this.expect(";"); return { kind: "return", value };
      }
      if (this.is("break") || this.is("continue")) { const kind = this.take().text as "break" | "continue"; this.expect(";"); return { kind }; }
      if (this.accept(";")) return { kind: "block", statements: [] };
      const result = this.simple(); this.expect(";"); return result;
    });
  }
  expression(minimum = 0): CppExpression {
    return this.nested(() => {
      let left: CppExpression;
      const token = this.take();
      if (["!", "-", "+"].includes(token.text)) left = { kind: "unary", operator: token.text, value: this.expression(7) };
      else if (token.text === "(") { left = this.expression(); this.expect(")"); }
      else if (token.kind === "literal") left = { kind: "literal", value: token.value!, numberType: token.numberType };
      else if (token.text === "true" || token.text === "false") left = { kind: "literal", value: token.text === "true" };
      else if (token.kind === "identifier" && !RESERVED.has(token.text)) {
        if (this.accept("(")) {
          const args: CppExpression[] = [];
          if (!this.is(")")) do { if (args.length >= 8) invalid(); args.push(this.expression()); } while (this.accept(","));
          this.expect(")"); left = { kind: "call", name: token.text, args };
        } else left = { kind: "variable", name: token.text };
      } else invalid();
      while ((PRECEDENCE[this.current().text] ?? -1) >= minimum) {
        const operator = this.take().text;
        left = { kind: "binary", operator, left, right: this.expression(PRECEDENCE[operator]! + 1) };
      }
      return left;
    });
  }
}

/** Parse only the documented simulator grammar, with no host evaluation. */
export function parseCppProject(source: string): CppProgram { return new Parser(tokenize(source)).program(); }
