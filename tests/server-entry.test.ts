import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ workers: [] as { url: URL; options: unknown }[] }));
vi.mock("node:worker_threads", () => ({ Worker: class {
  constructor(url: URL, options: unknown) { state.workers.push({ url, options }); }
} }));
vi.mock("../src/server-session.js", () => ({ ServerProjectRuntimeError: class extends Error {},
  startServerProjectSession: vi.fn(async (_source, _options, createWorker) => { createWorker({ source: "bounded test", options: {} }); return { closed: false }; }) }));
import { createServerProjectSession } from "../src/server.js";
describe("package server entry resolution", () => {
  afterEach(() => { vi.unstubAllGlobals(); state.workers.length = 0; });
  it.each(["esm", "cjs"])("resolves the %s worker with an empty environment and resource limits", async format => {
    vi.stubGlobal("__PLASIUS_MODULE_FORMAT__", format);
    vi.stubGlobal("__filename", "/synthetic/package/server.cjs");
    await createServerProjectSession("");
    expect(state.workers[0]!.url.pathname).toMatch(new RegExp(`javascript\\.worker\\.${format === "cjs" ? "cjs" : "js"}$`, "u"));
    expect(state.workers[0]!.options).toMatchObject({ env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 32, stackSizeMb: 2 } });
  });
});
