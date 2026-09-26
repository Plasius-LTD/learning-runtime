import { describe, expect, it, vi } from "vitest";
import { createCppProjectSession, CppProjectError } from "../src/cpp.js";

const options = { outputs: { signal: ["string"], servo: ["number"], motors: ["number", "number"] } } as const;

describe("bounded C++ robot simulator", () => {
  it("runs setup once and persistent timing logic against fresh simulated sensors", () => {
    const session = createCppProjectSession(`
      int last = 0;
      bool lit = false;
      void setup() { signal("off"); }
      void loop() {
        if (boolSensor("stop")) { signal("off"); return; }
        if (millis() - last >= 500) {
          lit = !lit;
          if (lit) signal("green"); else signal("off");
          last = millis();
        }
      }`, options);
    expect(session.run({ timeMs: 0, sensors: { stop: false } }).commands).toEqual([{ name: "signal", args: ["off"] }]);
    expect(session.run({ timeMs: 499, sensors: { stop: false } }).commands).toEqual([]);
    expect(session.run({ timeMs: 500, sensors: { stop: false } }).commands).toEqual([{ name: "signal", args: ["green"] }]);
    expect(session.run({ timeMs: 1000, sensors: { stop: false } }).commands).toEqual([{ name: "signal", args: ["off"] }]);
    expect(session.run({ timeMs: 1001, sensors: { stop: true } }).commands).toEqual([{ name: "signal", args: ["off"] }]);
    session.dispose();
    expect(session.closed).toBe(true);
    expect(() => session.run({ timeMs: 1002, sensors: {} })).toThrow(CppProjectError);
  });
  it("supports typed helper functions, scopes, loops and bounded numeric calculations", () => {
    const session = createCppProjectSession(`
      int clampAngle(int value) { return max(30, min(150, value)); }
      void loop() {
        int total = 0;
        for (int i = 0; i < 6; i++) {
          if (i == 1) continue;
          if (i == 5) break;
          total += i;
        }
        { int total = 100; servo(total); }
        double angle = numberSensor("angle") + total;
        servo(clampAngle(angle));
      }`, options);
    expect(session.run({ timeMs: 0, sensors: { angle: 143.5 } }).commands).toEqual([
      { name: "servo", args: [100] }, { name: "servo", args: [150] },
    ]);
  });
  it("does not evaluate short-circuited operands and keeps sessions independent", () => {
    const source = 'int count = 0; void loop() { if (false && numberSensor("absent") > 0) count = 99; if (true || 1 / 0 > 1) count++; servo(count); }';
    const first = createCppProjectSession(source, options);
    const second = createCppProjectSession(source, options);
    expect(first.run({ timeMs: 0, sensors: {} }).commands[0]!.args).toEqual([1]);
    expect(first.run({ timeMs: 1, sensors: {} }).commands[0]!.args).toEqual([2]);
    expect(second.run({ timeMs: 0, sensors: {} }).commands[0]!.args).toEqual([1]);
  });
  it.each([
    'void loop() { while (true) {} }',
    'void recurse() { recurse(); } void loop() { recurse(); }',
    'void loop() { for (int i=0; i<100; i++) signal("red"); }',
  ])("bounds loops, recursion and emitted commands", source => {
    const session = createCppProjectSession(source, options);
    expect(() => session.run({ timeMs: 0, sensors: {} })).toThrow(CppProjectError);
    expect(session.closed).toBe(true);
  });
  it.each([
    'void loop() { process.exit(); }', 'void loop() { #include "x"; }',
    'void loop() { int x = ; }', 'void loop( { }', 'int loop() { return 1; }',
    'void loop() {} void loop() {}', 'void loop() { "unterminated; }',
  ])("rejects unsupported or malformed source", source => {
    expect(() => createCppProjectSession(source, options)).toThrow(CppProjectError);
  });
  it.each([
    'void loop() { servo("wrong"); }', 'void loop() { missing(); }',
    'void loop() { int x = 1 / 0; }', 'void loop() { int x = true; }',
    'void loop() { const int x = 1; x = 2; }',
    'void loop() { servo(numberSensor("missing")); }',
  ])("fails closed on invalid execution without returning partial commands", source => {
    const session = createCppProjectSession(source, options);
    expect(() => session.run({ timeMs: 0, sensors: {} })).toThrow(CppProjectError);
    expect(session.closed).toBe(true);
  });
  it("rejects hostile inputs without invoking getters and prevents time reversal", () => {
    const getter = vi.fn(() => { throw new Error("must not execute"); });
    const session = createCppProjectSession('void loop() {}', options);
    expect(() => session.run({ timeMs: 0, sensors: Object.defineProperty({}, "x", { get: getter, enumerable: true }) })).toThrow(CppProjectError);
    expect(getter).not.toHaveBeenCalled();
    const other = createCppProjectSession('void loop() {}', options);
    other.run({ timeMs: 20, sensors: {} });
    expect(() => other.run({ timeMs: 19, sensors: {} })).toThrow(CppProjectError);
  });
  it("implements integer versus floating arithmetic, typed text and terminating while loops", () => {
    const session = createCppProjectSession(`
      /* Each loop reads a fresh label rather than a host clock. */
      int choose(int value) { while (value > 0) { return value; } return 0; }
      void loop() {
        int count; bool done; string label; double fractional;
        while (count < 3) { count++; }
        label = textSensor("label");
        fractional = 5.0 / 2;
        if (5 / 2 == 2 && fractional > 2.0 && count <= 3) signal(label);
        int remainder = 7 % 3;
        int negative = -choose(count) * 2;
        servo(+abs(negative) + remainder);
        if (done) signal("wrong");
      }`, options);
    expect(session.run({ timeMs: 0, sensors: { label: "ready" } }).commands).toEqual([
      { name: "signal", args: ["ready"] }, { name: "servo", args: [7] },
    ]);
  });
  it("rejects invalid sensor values and undeclared variables", () => {
    for (const value of [undefined, null, Infinity, NaN, 1e10, {}, [], "x".repeat(257), "bad\0text"]) {
      const session = createCppProjectSession('void loop() {}', options);
      expect(() => session.run({ timeMs: 0, sensors: { sample: value } } as never)).toThrow(CppProjectError);
      expect(session.closed).toBe(true);
    }
    const missing = createCppProjectSession('void loop() { servo(undeclared); }', options);
    expect(() => missing.run({ timeMs: 0, sensors: {} })).toThrow(CppProjectError);
  });
  it("validates output metadata without accepting host functions or accessor signatures", () => {
    for (const metadata of [undefined, {}, { outputs: {}, extra: true }, { outputs: {}, signal: {} },
      { outputs: { millis: [] } }, { outputs: { loop: [] } }, { outputs: { print: () => undefined } },
      { outputs: { signal: ["object"] } }, { outputs: { signal: new Array(1) } }]) {
      expect(() => createCppProjectSession('void loop() {}', metadata as never)).toThrow(CppProjectError);
    }
    const getter = vi.fn(() => ["string"]);
    expect(() => createCppProjectSession('void loop() {}', { outputs: Object.defineProperty({}, "signal", { get: getter, enumerable: true }) })).toThrow(CppProjectError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected caller failures and handles already-cancelled sessions", () => {
    const session = createCppProjectSession('void loop() {}', options);
    const input = new Proxy({}, { getPrototypeOf() { throw new Error("private caller detail"); } });
    expect(() => session.run(input as never)).toThrow("Robot program execution failed.");
    expect(session.closed).toBe(true);
    const controller = new AbortController(); controller.abort();
    const cancelled = createCppProjectSession('void loop() {}', { ...options, signal: controller.signal });
    expect(cancelled.closed).toBe(true);
  });
  it("cancels before execution and limits source and parse nesting", () => {
    const controller = new AbortController();
    const session = createCppProjectSession('void loop() {}', { ...options, signal: controller.signal });
    controller.abort();
    expect(() => session.run({ timeMs: 0, sensors: {} })).toThrow(CppProjectError);
    expect(session.closed).toBe(true);
    expect(() => createCppProjectSession(' '.repeat(32769), options)).toThrow(CppProjectError);
    expect(() => createCppProjectSession(`void loop() { ${'{'.repeat(150)} ${'}'.repeat(150)} }`, options)).toThrow(CppProjectError);
  });
});
