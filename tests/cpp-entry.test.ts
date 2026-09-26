import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type * as CppModule from "../src/cpp.js";

describe("published robot runtime entry points", () => {
  it("executes the same typed program in built ESM and CommonJS exports", async () => {
    const esm = await import(new URL("../dist/cpp.js", import.meta.url).href) as typeof CppModule;
    const cjs = createRequire(import.meta.url)("../dist/cpp.cjs") as typeof CppModule;
    for (const runtime of [esm, cjs]) {
      const session = runtime.createCppProjectSession('int count = 0; void loop() { count++; setServoAngle(90 + count); }', {
        outputs: { setServoAngle: ["number"] },
      });
      expect(session.run({ timeMs: 0, sensors: {} })).toEqual({
        commands: [{ name: "setServoAngle", args: [91] }], globals: { count: 1 },
      });
      session.dispose();
      expect(session.closed).toBe(true);
    }
  });
});
