import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ parentPort: { postMessage: vi.fn() } as object | null,
  workerData: { source: "", options: {} }, start: vi.fn(async () => undefined) }));
vi.mock("node:worker_threads", () => ({ get parentPort() { return mocks.parentPort; }, workerData: mocks.workerData }));
vi.mock("../src/server-worker.js", () => ({ startProjectWorker: mocks.start }));
describe("compiled worker entry boundary", () => {
  it("hands the private port and bootstrap data to the worker handler", async () => {
    await import("../src/javascript.worker.js");
    expect(mocks.start).toHaveBeenCalledWith(mocks.parentPort, mocks.workerData);
  });
  it("refuses to execute as an ordinary host module without a private port", async () => {
    vi.resetModules(); mocks.parentPort = null;
    await expect(import("../src/javascript.worker.js")).rejects.toThrow("private message port");
  });
});
