import { CppProjectError, parseCppProject, type CppExpression, type CppStatement, type CppType, type CppValue } from "./cpp-parser.js";
export { CppProjectError } from "./cpp-parser.js";

export type CppOutputType = "number" | "boolean" | "string";
export interface CppProjectOptions {
  outputs: Readonly<Record<string, readonly CppOutputType[]>>;
  signal?: AbortSignal;
}
export interface CppProjectInput { timeMs: number; sensors: Readonly<Record<string, CppValue>> }
export interface CppProjectCommand { name: string; args: CppValue[] }
export interface CppProjectResult { commands: CppProjectCommand[]; globals: Record<string, CppValue> }
export interface CppProjectSession {
  readonly closed: boolean;
  run(input: CppProjectInput): CppProjectResult;
  dispose(): void;
}
interface Value { type: Exclude<CppType, "void">; value: CppValue }
interface Binding { type: Exclude<CppType, "void">; value: Value; constant: boolean }
interface Scope { bindings: Map<string, Binding>; parent?: Scope }
type Flow = { kind: "return"; value?: Value } | { kind: "break" | "continue" } | undefined;
const BUILTINS = new Set(["millis", "numberSensor", "boolSensor", "textSensor", "min", "max", "abs"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;
function fail(code: ConstructorParameters<typeof CppProjectError>[0] = "EXECUTION_FAILED"): never { throw new CppProjectError(code); }

/** Snapshot data properties only; callers cannot smuggle accessor execution through inputs. */
function record(value: unknown, maximum: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("INVALID_INPUT");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > maximum) fail("INVALID_INPUT");
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || !NAME.test(key)) fail("INVALID_INPUT");
    const descriptor = descriptors[key]!;
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail("INVALID_INPUT");
    result[key] = descriptor.value;
  }
  return result;
}
function primitive(value: unknown): CppValue {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e9) return value;
  if (typeof value === "string" && value.length <= 256 && !value.includes("\0")) return value;
  return fail("INVALID_INPUT");
}
function numeric(value: Value | undefined): number {
  if (!value || (value.type !== "int" && value.type !== "double") || typeof value.value !== "number") fail();
  return value.value;
}
function boolean(value: Value | undefined): boolean { if (!value || value.type !== "bool") fail(); return value.value as boolean; }
function number(value: number, type: "int" | "double" = "double"): Value {
  if (!Number.isFinite(value) || Math.abs(value) > 1e9) fail();
  return { type, value: type === "int" ? Math.trunc(value) : value };
}
function convert(type: CppType, value: Value | undefined): Value | undefined {
  if (type === "void") { if (value !== undefined) fail(); return undefined; }
  if (!value) fail();
  if (type === "int" || type === "double") return number(numeric(value), type);
  if (value.type !== type) fail();
  return value;
}
function lookup(scope: Scope, name: string): Binding {
  const binding = scope.bindings.get(name);
  if (binding) return binding;
  if (scope.parent) return lookup(scope.parent, name);
  return fail();
}
function outputSignatures(value: unknown): Map<string, CppOutputType[]> {
  const entries = record(value, 16);
  const result = new Map<string, CppOutputType[]>();
  for (const [name, signature] of Object.entries(entries)) {
    if (BUILTINS.has(name) || name === "loop" || name === "setup"
      || !Array.isArray(signature) || Object.getPrototypeOf(signature) !== Array.prototype || signature.length > 8) fail("INVALID_INPUT");
    const descriptors = Object.getOwnPropertyDescriptors(signature);
    if (Reflect.ownKeys(descriptors).length !== signature.length + 1) fail("INVALID_INPUT");
    const types: CppOutputType[] = [];
    for (let index = 0; index < signature.length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !["number", "boolean", "string"].includes(descriptor.value)) fail("INVALID_INPUT");
      types.push(descriptor.value as CppOutputType);
    }
    result.set(name, types);
  }
  return result;
}

/** Execute the closed C++ simulator subset with primitive input and structured output only. */
export function createCppProjectSession(source: string, options: CppProjectOptions): CppProjectSession {
  const program = parseCppProject(source);
  const configuration = record(options, 2);
  if (!Object.hasOwn(configuration, "outputs") || Object.keys(configuration).some(key => key !== "outputs" && key !== "signal")
    || (configuration.signal !== undefined && !(configuration.signal instanceof AbortSignal))) fail("INVALID_INPUT");
  const signal = configuration.signal as AbortSignal | undefined;
  const outputs = outputSignatures(configuration.outputs);
  for (const name of program.functions.keys()) if (BUILTINS.has(name) || outputs.has(name)) fail("INVALID_SOURCE");
  for (const node of program.globals) if (node.kind === "declare" && (BUILTINS.has(node.name) || outputs.has(node.name))) fail("INVALID_SOURCE");
  const globals: Scope = { bindings: new Map() };
  let closed = false;
  let initialized = false;
  let lastTime = -1;
  let timeMs = 0;
  let sensors: Record<string, CppValue> = Object.create(null) as Record<string, CppValue>;
  let commands: CppProjectCommand[] = [];
  let remaining = 2000;
  let depth = 0;
  function step(): void {
    if (closed || signal?.aborted) fail("CLOSED");
    if (--remaining < 0) fail("BUDGET_EXCEEDED");
  }
  function declare(scope: Scope, name: string, type: CppType, constant: boolean, value: Value | undefined): void {
    if (type === "void" || scope.bindings.has(name) || scope.bindings.size >= 64) fail();
    scope.bindings.set(name, { type, constant, value: convert(type, value)! });
  }
  function expression(node: CppExpression, scope: Scope): Value | undefined {
    step();
    if (node.kind === "literal") {
      if (typeof node.value === "number") return number(node.value, node.numberType ?? "int");
      return { type: typeof node.value === "boolean" ? "bool" : "string", value: node.value };
    }
    if (node.kind === "variable") return lookup(scope, node.name).value;
    if (node.kind === "call") return call(node.name, node.args.map(argument => expression(argument, scope)));
    if (node.kind === "unary") {
      const value = expression(node.value, scope);
      if (node.operator === "!") return { type: "bool", value: !boolean(value) };
      return number(numeric(value) * (node.operator === "-" ? -1 : 1), value!.type as "int" | "double");
    }
    const left = expression(node.left, scope);
    if (node.operator === "&&") return { type: "bool", value: boolean(left) && boolean(expression(node.right, scope)) };
    if (node.operator === "||") return { type: "bool", value: boolean(left) || boolean(expression(node.right, scope)) };
    const right = expression(node.right, scope);
    if (!left || !right) fail();
    if (node.operator === "==" || node.operator === "!=") {
      if (typeof left.value !== typeof right.value) fail();
      const equal = left.value === right.value;
      return { type: "bool", value: node.operator === "==" ? equal : !equal };
    }
    const a = numeric(left); const b = numeric(right);
    const type = left.type === "int" && right.type === "int" ? "int" : "double";
    switch (node.operator) {
      case "<": return { type: "bool", value: a < b };
      case "<=": return { type: "bool", value: a <= b };
      case ">": return { type: "bool", value: a > b };
      case ">=": return { type: "bool", value: a >= b };
      case "+": return number(a + b, type);
      case "-": return number(a - b, type);
      case "*": return number(a * b, type);
      case "/": return number(a / b, type);
      case "%": if (type !== "int") fail(); return number(a % b, "int");
      default: return fail();
    }
  }
  function call(name: string, args: (Value | undefined)[]): Value | undefined {
    step();
    if (args.some(argument => !argument)) fail();
    if (name === "millis") { if (args.length !== 0) fail(); return number(timeMs, "int"); }
    if (name === "numberSensor" || name === "boolSensor" || name === "textSensor") {
      if (args.length !== 1 || args[0]!.type !== "string") fail();
      const value = sensors[args[0]!.value as string];
      const type = name === "numberSensor" ? "number" : name === "boolSensor" ? "boolean" : "string";
      if (typeof value !== type) fail();
      return { type: type === "number" ? "double" : type === "boolean" ? "bool" : "string", value: value! };
    }
    if (name === "min" || name === "max" || name === "abs") {
      if (args.length !== (name === "abs" ? 1 : 2)) fail();
      const values = args.map(numeric);
      return number(name === "abs" ? Math.abs(values[0]!) : name === "min" ? Math.min(...values) : Math.max(...values), args.every(arg => arg!.type === "int") ? "int" : "double");
    }
    const signature = outputs.get(name);
    if (signature) {
      if (signature.length !== args.length || signature.some((type, index) => typeof args[index]!.value !== type)) fail();
      if (commands.length >= 64) fail("BUDGET_EXCEEDED");
      commands.push({ name, args: args.map(arg => arg!.value) });
      return undefined;
    }
    const fn = program.functions.get(name);
    if (!fn || fn.parameters.length !== args.length) fail();
    if (++depth > 16) fail("BUDGET_EXCEEDED");
    try {
      const scope: Scope = { bindings: new Map(), parent: globals };
      fn.parameters.forEach((parameter, index) => declare(scope, parameter.name, parameter.type, false, args[index]));
      const flow = statement(fn.body, scope);
      if (flow && flow.kind !== "return") fail();
      return convert(fn.type, flow?.kind === "return" ? flow.value : undefined);
    } finally { depth--; }
  }
  function statement(node: CppStatement, scope: Scope): Flow {
    step();
    switch (node.kind) {
      case "block": {
        const child: Scope = { bindings: new Map(), parent: scope };
        for (const item of node.statements) { const flow = statement(item, child); if (flow) return flow; }
        return undefined;
      }
      case "declare": {
        const initial: Value = node.type === "bool" ? { type: "bool", value: false } : node.type === "string" ? { type: "string", value: "" } : number(0, node.type === "int" ? "int" : "double");
        declare(scope, node.name, node.type, node.constant, node.value ? expression(node.value, scope) : initial);
        return undefined;
      }
      case "assign": {
        const binding = lookup(scope, node.name); if (binding.constant) fail();
        binding.value = convert(binding.type, expression(node.value, scope))!; return undefined;
      }
      case "expression": expression(node.value, scope); return undefined;
      case "if": {
        const branch = boolean(expression(node.condition, scope)) ? node.then : node.otherwise;
        return branch ? statement(branch, { bindings: new Map(), parent: scope }) : undefined;
      }
      case "for":
      case "while": {
        const loopScope: Scope = { bindings: new Map(), parent: scope };
        if (node.kind === "for" && node.initial) statement(node.initial, loopScope);
        while (!node.condition || boolean(expression(node.condition, loopScope))) {
          step();
          const flow = statement(node.body, { bindings: new Map(), parent: loopScope });
          if (flow?.kind === "return") return flow;
          if (flow?.kind === "break") return undefined;
          if (node.kind === "for" && node.increment) statement(node.increment, loopScope);
        }
        return undefined;
      }
      case "return": return { kind: "return", value: node.value ? expression(node.value, scope) : undefined };
      case "break": case "continue": return { kind: node.kind };
    }
  }
  function dispose(): void {
    closed = true; commands = []; sensors = Object.create(null) as Record<string, CppValue>;
    globals.bindings.clear(); program.functions.clear(); program.globals.length = 0;
    signal?.removeEventListener("abort", dispose);
  }
  signal?.addEventListener("abort", dispose, { once: true });
  if (signal?.aborted) dispose();
  return {
    get closed() { return closed; }, dispose,
    run(rawInput) {
      try {
        remaining = 2000;
        step();
        const input = record(rawInput, 2);
        if (Object.keys(input).length !== 2 || !Object.hasOwn(input, "timeMs") || !Object.hasOwn(input, "sensors")
          || !Number.isSafeInteger(input.timeMs) || (input.timeMs as number) < lastTime || (input.timeMs as number) < 0 || (input.timeMs as number) > 1e9) fail("INVALID_INPUT");
        const snapshot = record(input.sensors, 32);
        sensors = Object.fromEntries(Object.entries(snapshot).map(([name, value]) => [name, primitive(value)]));
        // Null prototype prevents inherited names from masquerading as sensor samples.
        Object.setPrototypeOf(sensors, null);
        timeMs = input.timeMs as number; lastTime = timeMs; remaining = 2000; commands = [];
        if (!initialized) {
          for (const global of program.globals) statement(global, globals);
          if (program.functions.has("setup")) call("setup", []);
          initialized = true;
        }
        call("loop", []);
        return { commands: commands.map(command => ({ name: command.name, args: [...command.args] })),
          globals: Object.fromEntries([...globals.bindings].map(([name, binding]) => [name, binding.value.value])) };
      } catch (error) {
        dispose();
        if (error instanceof CppProjectError) throw error;
        throw new CppProjectError("EXECUTION_FAILED");
      }
    },
  };
}
