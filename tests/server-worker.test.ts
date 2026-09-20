import { describe, expect, it, vi } from "vitest";
import { startProjectWorker, type ProjectWorkerPort } from "../src/server-worker.js";

function portFixture() {
  let receive: ((message: unknown) => void) | undefined;
  let close: (() => void) | undefined;
  const port: ProjectWorkerPort = {
    postMessage: vi.fn(),
    on: (_event, handler) => { receive = handler; },
    once: (_event, handler) => { close = handler; },
    close: vi.fn(() => close?.()),
  };
  return { port, send: (message: unknown) => receive?.(message) };
}
describe("worker protocol and session lifecycle", () => {
  it("initializes the realm and exposes only structured function results", async () => {
    const { port, send } = portFixture();
    await startProjectWorker(port, { source: "function update(x) { return x + 1; }", options: {} });
    expect(port.postMessage).toHaveBeenCalledWith({ type: "ready" });
    send({ type: "call", id: 1, entry: "update", args: [4] });
    expect(port.postMessage).toHaveBeenCalledWith({ type: "result", id: 1, value: 5 });
    port.close();
  });
  it("rejects malformed bootstrap data and source without reflecting it in errors", async () => {
    for (const input of [null, { source: 1, options: {} }, { source: "", options: null }, { source: "throw new Error('private text');", options: {} }]) {
      const { port } = portFixture();
      await startProjectWorker(port, input);
      expect(port.postMessage).toHaveBeenCalledWith({ type: "failed" });
      expect(port.close).toHaveBeenCalledOnce();
      expect(JSON.stringify(vi.mocked(port.postMessage).mock.calls)).not.toContain("private text");
    }
  });
  it("closes the realm on invalid messages and runtime failures", async () => {
    for (const message of [null, { type: "other" }, { type: "call", id: 1, entry: 4, args: [] },
      { type: "call", id: 1, entry: "update", args: "invalid" },
      { type: "call", id: 1, entry: "missing", args: [] }]) {
      const { port, send } = portFixture();
      await startProjectWorker(port, { source: "function update() { return 1; }", options: {} });
      send(message);
      expect(port.postMessage).toHaveBeenLastCalledWith({ type: "failed" });
      expect(port.close).toHaveBeenCalledOnce();
    }
  });
});
