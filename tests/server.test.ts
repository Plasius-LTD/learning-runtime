import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { createServerProjectSession as compiledSession } from "../dist/server.js";
import { startServerProjectSession, type ServerProjectOptions } from "../src/server-session.js";
const createServerProjectSession = (source: string, options: ServerProjectOptions = {}) => startServerProjectSession(source, options,
  data => new Worker(new URL("../dist/javascript.worker.js", import.meta.url), { workerData: data, env: {}, execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 } }));

describe("hard server execution boundary", () => {
  it("runs real compiled workers for ESM and CommonJS consumers", async () => {
    const commonjs = createRequire(import.meta.url)("../dist/server.cjs") as typeof import("../dist/server.js");
    for (const create of [compiledSession, commonjs.createServerProjectSession, createServerProjectSession]) {
      const session = await create("let n = 0; function update(input) { return { n: ++n, input }; }");
      try {
        expect(await session.call("update", [3])).toEqual({ n: 1, input: 3 });
        expect(await session.call("update", [7])).toEqual({ n: 2, input: 7 });
      } finally { await session.dispose(); }
      expect(session.closed).toBe(true);
      await session.dispose();
      await expect(session.call("update", [])).rejects.toMatchObject({ code: "CLOSED" });
    }
  });
  it("terminates the original excessive-allocation case instead of blocking the host", async () => {
    const started = performance.now();
    let heartbeat = false;
    const tick = setTimeout(() => { heartbeat = true; }, 50);
    await expect(createServerProjectSession("const blocks = []; while (true) blocks.push('x'.repeat(1024 * 1024));", { startupDeadlineMs: 600 })).rejects.toMatchObject({ code: "DEADLINE" });
    clearTimeout(tick);
    expect(heartbeat).toBe(true);
    expect(performance.now() - started).toBeLessThan(2000);
  });
  it("terminates a stuck call and allows the process to run another project", async () => {
    const session = await createServerProjectSession("function update() { const a = []; while (true) a.push('x'.repeat(1024 * 1024)); }", { callDeadlineMs: 200 });
    await expect(session.call("update", [])).rejects.toMatchObject({ code: "DEADLINE" });
    await session.dispose();
    const next = await createServerProjectSession("function update() { return 8; }");
    try { expect(await next.call("update", [])).toBe(8); } finally { await next.dispose(); }
  });
  it("rejects malformed source, failed execution and invalid protocol inputs", async () => {
    await expect(createServerProjectSession("function (")).rejects.toMatchObject({ code: "WORKER_FAILED" });
    await expect(createServerProjectSession(" ".repeat(64001))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createServerProjectSession("", { callDeadlineMs: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const session = await createServerProjectSession("function update(x) { return x; }");
    try {
      await expect(session.call("eval();", [])).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(session.call("update", ["x".repeat(64001)])).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(session.call("missing", [])).rejects.toMatchObject({ code: "WORKER_FAILED" });
    } finally { await session.dispose(); }
  });
  it("bounds admission to four workers and rejects overlapping requests", async () => {
    const sessions = [];
    try {
      for (let i = 0; i < 4; i++) sessions.push(await createServerProjectSession("function update() { return 1; }"));
      await expect(createServerProjectSession("")).rejects.toMatchObject({ code: "BUSY" });
      const first = sessions[0]!.call("update", []);
      await expect(sessions[0]!.call("update", [])).rejects.toMatchObject({ code: "BUSY" });
      expect(await first).toBe(1);
    } finally { await Promise.all(sessions.map(session => session.dispose())); }
  });
  it("terminates active work on cancellation and refuses already-cancelled work", async () => {
    const controller = new AbortController();
    const session = await createServerProjectSession("function update() { return 1; }", { signal: controller.signal });
    controller.abort();
    await session.dispose();
    expect(session.closed).toBe(true);
    await expect(createServerProjectSession("", { signal: controller.signal })).rejects.toThrow();
  });
});
