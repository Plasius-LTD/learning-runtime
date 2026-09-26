import { describe, expect, it } from "vitest";
import { createCppProjectSession, CppProjectError } from "../src/cpp.js";

const options = { outputs: { signal: ["string"], servo: ["number"] } } as const;

describe("robot language boundary cases", () => {
  it.each([
    'void loop() {} /* unfinished',
    `int ${'a'.repeat(65)} = 0; void loop() {}`,
    `void loop() { ${';'.repeat(4100)} }`,
    'void loop() {', 'void if() {}', 'void 2() {}',
    'const void helper() {} void loop() {}',
    `${Array.from({ length: 33 }, (_, i) => `void f${i}() {}`).join(' ')} void loop() {}`,
    'void helper(void x) {} void loop() {}',
    'void helper(int x, int x) {} void loop() {}',
    `void helper(${Array.from({ length: 9 }, (_, i) => `int x${i}`).join(',')}) {} void loop() {}`,
    'void helper(); void loop() {}', 'void value; void loop() {}',
    'const int value; void loop() {}', 'void loop() { void value; }',
    'void loop() { const int value; }', 'void loop() { 1 = 2; }',
    'void loop() { helper(1,2,3,4,5,6,7,8,9); }',
    'void loop() { signal("\\q"); }', 'void loop() { signal("\\u0000"); }',
    `void loop() { signal("${'x'.repeat(257)}"); }`,
    'int millis = 0; void loop() {}', 'void signal() {} void loop() {}',
    'void millis() {} void loop() {}', 'int signal = 0; void loop() {}',
  ])("rejects ambiguous syntax, unsupported declarations and publication limits", source => {
    expect(() => createCppProjectSession(source, options)).toThrow(CppProjectError);
  });
  it.each([
    'void loop() { if (signal("off")) {} }', 'void loop() { if (1) {} }',
    'void loop() { bool value = 1; }', 'void loop() { string value = 1; }',
    'int missingReturn() {} void loop() { missingReturn(); }',
    'void wrongReturn() { return 1; } void loop() { wrongReturn(); }',
    'void loop() { int x = signal("off"); }',
    'void loop() { int x; int x; }',
    `void loop() { ${Array.from({ length: 65 }, (_, i) => `int x${i};`).join(' ')} }`,
    'void loop() { bool different = 1 != "one"; }',
    'void loop() { servo(signal("off") + 1); }',
    'void loop() { servo(1 + signal("off")); }',
    'void loop() { servo(2.5 % 2); }',
    'void loop() { servo(signal("off")); }',
    'void loop() { servo(millis(1)); }',
    'void loop() { servo(numberSensor()); }',
    'void loop() { servo(numberSensor(1)); }',
    'void loop() { servo(min(1)); }',
    'void loop() { break; }', 'void loop() { continue; }',
  ])("rejects invalid typed execution and closes the session", source => {
    const session = createCppProjectSession(source, options);
    expect(() => session.run({ timeMs: 0, sensors: {} })).toThrow(CppProjectError);
    expect(session.closed).toBe(true);
  });
  it("supports omitted for clauses, default globals, parentheses and typed helper results", () => {
    const session = createCppProjectSession(`
      int count;
      int once() { for (;;) { return 3; } }
      void loop() {
        ;
        for (;;) { break; }
        for (int i=0; i<2;) { i++; count++; }
        if (false || true) count += (once() + 1);
        if (count != 0) servo(max(2.5, 1.0));
        servo(count);
      } // final comment`, options);
    expect(session.run({ timeMs: 0, sensors: {} }).commands).toEqual([
      { name: "servo", args: [2.5] }, { name: "servo", args: [6] },
    ]);
  });
  it("rejects excessive, symbolic and malformed input fields", () => {
    const inputs = [
      { timeMs: 0, sensors: {}, extra: true },
      { timeMs: 0, sensors: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`x${i}`, i])) },
      { timeMs: 0, sensors: { [Symbol('sample')]: true } },
      { timeMs: 0, sensors: { 'bad-name': true } },
    ];
    for (const input of inputs) {
      const session = createCppProjectSession('void loop() {}', options);
      expect(() => session.run(input as never)).toThrow(CppProjectError);
      expect(session.closed).toBe(true);
    }
  });
});
