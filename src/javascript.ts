import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten";

export type ProjectJsonValue = null | boolean | number | string | ProjectJsonValue[] | { [key: string]: ProjectJsonValue };
export const JAVASCRIPT_PROJECT_LIMITS = Object.freeze({ sourceCharacters: 64000, jsonCharacters: 64000,
  memoryBytes: 16 * 1024 * 1024, stackBytes: 256 * 1024, executionMs: 100, maximumExecutionMs: 500,
  calls: 10000, arguments: 8, jsonDepth: 20, jsonNodes: 4096 });
export class JavaScriptProjectRuntimeError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "EXECUTION_FAILED" | "OUTPUT_LIMIT" | "CALL_LIMIT" | "CLOSED") {
    super(`Learning project: ${code}`); this.name = "JavaScriptProjectRuntimeError";
  }
}
export interface JavaScriptProjectSession {
  readonly closed: boolean;
  /** Invoke a declared learner function with detached, bounded JSON data. */
  call(entry: string, args: ProjectJsonValue[]): ProjectJsonValue;
  /** Idempotent. Hosts must dispose on navigation, worker shutdown or cancellation. */
  dispose(): void;
}
export interface JavaScriptProjectSessionOptions {
  executionMs?: number;
  maximumCalls?: number;
  signal?: AbortSignal;
  /** Same source, inputs and seed reproduce the same pseudo-random sequence. */
  seed?: number;
}
const invalid = (): never => { throw new JavaScriptProjectRuntimeError("INVALID_INPUT"); };

/** Reject accessors, cycles and non-JSON values before host serialization. */
function checkedJson(value: unknown): string {
  const seen = new Set<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > JAVASCRIPT_PROJECT_LIMITS.jsonNodes || depth > JAVASCRIPT_PROJECT_LIMITS.jsonDepth) return invalid();
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") { if (value.length > JAVASCRIPT_PROJECT_LIMITS.jsonCharacters) return invalid(); return; }
    if (typeof value === "number") { if (!Number.isFinite(value)) return invalid(); return; }
    if (typeof value !== "object" || seen.has(value)) return invalid();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) return invalid();
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (Object.getOwnPropertySymbols(value).length || keys.length > JAVASCRIPT_PROJECT_LIMITS.jsonNodes) return invalid();
    if (array && (value.length > JAVASCRIPT_PROJECT_LIMITS.jsonNodes || keys.length !== value.length + 1)) return invalid();
    for (const key of keys) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key]!;
      if (key.length > 160 || descriptor.get || descriptor.set || !descriptor.enumerable) return invalid();
      if (array && !/^(0|[1-9][0-9]*)$/u.test(key)) return invalid();
      visit(descriptor.value, depth + 1);
    }
    seen.delete(value);
  }
  visit(value, 0);
  const json = JSON.stringify(value);
  if (json.length > JAVASCRIPT_PROJECT_LIMITS.jsonCharacters) return invalid();
  return json;
}

/**
 * Create a capability-free QuickJS session. Run this inside a disposable browser
 * worker on both browser and server, never on the browser UI or server event loop.
 * Each call gets a fresh cooperative deadline; the host must enforce its hard
 * deadline by terminating the worker. Runtime failures permanently close sessions.
 */
export async function createJavaScriptProjectSession(source: string, options: JavaScriptProjectSessionOptions = {}): Promise<JavaScriptProjectSession> {
  const executionMs = options.executionMs ?? JAVASCRIPT_PROJECT_LIMITS.executionMs;
  const maximumCalls = options.maximumCalls ?? JAVASCRIPT_PROJECT_LIMITS.calls;
  const seed = options.seed ?? 1;
  if (typeof source !== "string" || source.length > JAVASCRIPT_PROJECT_LIMITS.sourceCharacters
    || !Number.isInteger(executionMs) || executionMs < 1 || executionMs > JAVASCRIPT_PROJECT_LIMITS.maximumExecutionMs
    || !Number.isInteger(maximumCalls) || maximumCalls < 1 || maximumCalls > JAVASCRIPT_PROJECT_LIMITS.calls
    || !Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) return invalid();
  options.signal?.throwIfAborted();
  const { getQuickJS } = await import("quickjs-emscripten");
  const engine = await getQuickJS();
  options.signal?.throwIfAborted();
  let runtime: QuickJSRuntime | undefined;
  let context: QuickJSContext | undefined;
  const retained: QuickJSHandle[] = [];
  let closed = false;
  let deadline = Date.now() + executionMs;
  let calls = 0;
  const dispose = () => {
    if (closed) return;
    closed = true;
    options.signal?.removeEventListener("abort", dispose);
    for (const handle of retained.reverse()) if (handle.alive) handle.dispose();
    if (context?.alive) context.dispose();
    if (runtime?.alive) runtime.dispose();
  };
  try {
    runtime = engine.newRuntime();
    runtime.setMemoryLimit(JAVASCRIPT_PROJECT_LIMITS.memoryBytes);
    runtime.setMaxStackSize(JAVASCRIPT_PROJECT_LIMITS.stackBytes);
    runtime.setInterruptHandler(() => Date.now() >= deadline || options.signal?.aborted === true);
    context = runtime.newContext();
    const vm = context;
    const take = (result: ReturnType<QuickJSContext["evalCode"]>, handles: QuickJSHandle[]): QuickJSHandle => {
      if (result.error) { result.error.dispose(); throw new JavaScriptProjectRuntimeError("EXECUTION_FAILED"); }
      handles.push(result.value); return result.value;
    };
    // Captured before learner code; later replacement of global JSON/Number cannot
    // forge the transport. No handle or host callback is exposed in the realm.
    const transport = take(vm.evalCode(`((parse, stringify, finite) => ({
      parse,
      serialize: value => stringify(value, (_key, item) => {
        const kind = typeof item;
        if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint'
          || (kind === 'number' && !finite(item))) throw new Error('not-json');
        return item;
      })
    }))(JSON.parse, JSON.stringify, Number.isFinite)`), retained);
    const parse = vm.getProp(transport, "parse"); retained.push(parse);
    const serialize = vm.getProp(transport, "serialize"); retained.push(serialize);
    const deterministic = vm.evalCode(`(() => {
      let state = ${seed};
      Object.defineProperty(Math, 'random', { value: () => {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        return (state >>> 0) / 4294967296;
      }, writable: false, configurable: false });
      for (const name of ['Date', 'Intl']) Object.defineProperty(globalThis, name, {
        value: undefined, writable: false, configurable: false
      });
    })()`);
    if (deterministic.error) { deterministic.error.dispose(); throw new JavaScriptProjectRuntimeError("EXECUTION_FAILED"); }
    deterministic.value.dispose();
    const initialization = vm.evalCode(source, "project.js", { type: "global", strict: true });
    if (initialization.error) { initialization.error.dispose(); throw new JavaScriptProjectRuntimeError("EXECUTION_FAILED"); }
    initialization.value.dispose();
    options.signal?.addEventListener("abort", dispose, { once: true });
    return {
      get closed() { return closed; },
      dispose,
      call(entry, args) {
        if (closed) throw new JavaScriptProjectRuntimeError("CLOSED");
        if (typeof entry !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(entry)
          || !Array.isArray(args) || args.length > JAVASCRIPT_PROJECT_LIMITS.arguments) return invalid();
        const json = checkedJson(args);
        if (++calls > maximumCalls) { dispose(); throw new JavaScriptProjectRuntimeError("CALL_LIMIT"); }
        deadline = Date.now() + executionMs;
        const handles: QuickJSHandle[] = [];
        let failed = false;
        try {
          const encoded = vm.newString(json); handles.push(encoded);
          const parsed = take(vm.callFunction(parse, vm.undefined, encoded), handles);
          const parameters = args.map((_, index) => { const handle = vm.getProp(parsed, index); handles.push(handle); return handle; });
          const fn = take(vm.evalCode(entry, "entry.js", { type: "global", strict: true }), handles);
          const result = take(vm.callFunction(fn, vm.undefined, parameters), handles);
          const serialized = take(vm.callFunction(serialize, vm.undefined, result), handles);
          const output = vm.getString(serialized);
          if (output.length > JAVASCRIPT_PROJECT_LIMITS.jsonCharacters) throw new JavaScriptProjectRuntimeError("OUTPUT_LIMIT");
          const value: unknown = JSON.parse(output);
          checkedJson(value);
          return value as ProjectJsonValue;
        } catch (error) {
          failed = true;
          throw error instanceof JavaScriptProjectRuntimeError ? error : new JavaScriptProjectRuntimeError("EXECUTION_FAILED");
        } finally {
          for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
          if (failed) dispose();
        }
      },
    };
  } catch {
    dispose();
    throw new JavaScriptProjectRuntimeError("EXECUTION_FAILED");
  }
}
