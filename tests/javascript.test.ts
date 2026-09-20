import { describe, expect, it } from "vitest";
import { createJavaScriptProjectSession } from "../src/javascript.js";

describe("isolated JavaScript project sessions", () => {
  it("runs a persistent learner state machine with detached JSON arguments/results", async () => {
    const session = await createJavaScriptProjectSession('let count = 0; function initialState() { return { x: 0 }; } function update(state, input) { count++; return { x: state.x + input.dx, count }; }');
    try {
      expect(session.call("initialState", [])).toEqual({ x: 0 });
      const input = { x: 2 };
      expect(session.call("update", [input, { dx: 3 }])).toEqual({ x: 5, count: 1 });
      expect(session.call("update", [{ x: 5 }, { dx: -1 }])).toEqual({ x: 4, count: 2 });
      expect(input).toEqual({ x: 2 });
    } finally { session.dispose(); }
    expect(() => session.call("initialState", [])).toThrow();
    session.dispose();
  });
  it("provides no browser, network, timer, process or module loader capabilities", async () => {
    const session = await createJavaScriptProjectSession('function inspect() { return [typeof fetch, typeof window, typeof document, typeof process, typeof require, typeof setTimeout, typeof WebSocket]; }');
    try { expect(session.call("inspect", [])).toEqual(Array(7).fill("undefined")); }
    finally { session.dispose(); }
  });
  it("closes on infinite source evaluation and infinite update functions", async () => {
    await expect(createJavaScriptProjectSession("while (true) {}", { executionMs: 10 })).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
    const session = await createJavaScriptProjectSession("function update() { while (true) {} }", { executionMs: 10 });
    expect(() => session.call("update", [])).toThrow();
    expect(session.closed).toBe(true);
  });
  it("limits input/output, source, calls, entries and structured values", async () => {
    await expect(createJavaScriptProjectSession(" ".repeat(64001))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createJavaScriptProjectSession("function broken( {")).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
    const sources = [
      "function update() { return 'x'.repeat(64001); }",
      "function update() { const a = {}; a.self = a; return a; }",
      "function update() { return undefined; }",
      "function update() { throw new Error('private learner text'); }",
    ];
    for (const source of sources) {
      const session = await createJavaScriptProjectSession(source);
      try { session.call("update", []); throw new Error("Expected rejection"); }
      catch (error) { expect(String(error)).not.toContain("private learner text"); }
      expect(session.closed).toBe(true);
    }
    const session = await createJavaScriptProjectSession("function update(x) { return x; }", { maximumCalls: 2 });
    expect(() => session.call("update); process.exit();//", [])).toThrow();
    expect(() => session.call("update", ["x".repeat(64001)])).toThrow();
    expect(session.call("update", [1])).toBe(1);
    expect(session.call("update", [2])).toBe(2);
    expect(() => session.call("update", [3])).toThrow();
    expect(session.closed).toBe(true);
  });
  it("keeps JSON intrinsics private and isolates sessions from one another", async () => {
    const first = await createJavaScriptProjectSession('globalThis.marker = 5; JSON.parse = () => ({ hacked: true }); JSON.stringify = () => "false"; function update(x) { return { x }; }');
    const second = await createJavaScriptProjectSession('function update() { return typeof marker; }');
    try {
      expect(first.call("update", [7])).toEqual({ x: 7 });
      expect(second.call("update", [])).toBe("undefined");
    } finally { first.dispose(); second.dispose(); }
  });
  it("replays seeded randomness and supplies no ambient wall clock", async () => {
    const source = "function update() { return [Math.random(), typeof Date, typeof Intl]; }";
    const first = await createJavaScriptProjectSession(source, { seed: 17 });
    const second = await createJavaScriptProjectSession(source, { seed: 17 });
    const different = await createJavaScriptProjectSession(source, { seed: 19 });
    try {
      const result = first.call("update", []);
      expect(result).toEqual(second.call("update", []));
      expect(result).not.toEqual(different.call("update", []));
      expect(result).toEqual([expect.any(Number), "undefined", "undefined"]);
      expect(first.call("update", [])).toEqual(second.call("update", []));
    } finally { first.dispose(); second.dispose(); different.dispose(); }
    await expect(createJavaScriptProjectSession(source, { seed: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects accessor/cyclic/non-JSON input without invoking learner or host callbacks", async () => {
    const session = await createJavaScriptProjectSession("function update(x) { return x; }");
    let accessed = false;
    const getter = Object.defineProperty({}, "value", { enumerable: true, get() { accessed = true; return 1; } });
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    let deep: unknown = 1; for (let i = 0; i < 22; i++) deep = { child: deep };
    try {
      for (const value of [getter, cyclic, deep, NaN, Infinity, undefined, () => 3, new Date(), Array(3),
        { [Symbol("test")]: 1 }, Array(4097).fill(1), { ["x".repeat(161)]: 1 }]) {
        expect(() => session.call("update", [value as never])).toThrow();
      }
      expect(accessed).toBe(false);
      expect(session.call("update", [null])).toBeNull();
      expect(session.call("update", [true])).toBe(true);
      expect(() => session.call("missingFunction", [])).toThrow();
      expect(session.closed).toBe(true);
    } finally { session.dispose(); }
  });
  it("stops excessive allocation and recursion inside the realm", async () => {
    await expect(createJavaScriptProjectSession("const blocks = []; while (true) blocks.push('x'.repeat(1024 * 1024));")).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
    const session = await createJavaScriptProjectSession("function update() { return update(); }");
    expect(() => session.call("update", [])).toThrow();
    expect(session.closed).toBe(true);
  });
  it("cancels a session and does not create one with already cancelled input", async () => {
    const controller = new AbortController();
    const session = await createJavaScriptProjectSession("function update() { return 1; }", { signal: controller.signal });
    controller.abort();
    expect(session.closed).toBe(true);
    expect(() => session.call("update", [])).toThrow();
    await expect(createJavaScriptProjectSession("", { signal: controller.signal })).rejects.toThrow();
    for (const options of [{ executionMs: 0 }, { executionMs: 501 }, { maximumCalls: 10001 }]) {
      await expect(createJavaScriptProjectSession("", options)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
  });
});
