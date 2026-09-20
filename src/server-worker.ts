import { createJavaScriptProjectSession, type JavaScriptProjectSession, type ProjectJsonValue } from "./javascript.js";

/** Small message-port boundary, independently testable without running unbounded source in the test process. */
export interface ProjectWorkerPort {
  postMessage(value: unknown): void;
  on(event: "message", listener: (message: unknown) => void): unknown;
  once(event: "close", listener: () => void): unknown;
  close(): void;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Internal worker bootstrap. Fixed message errors never include source or runtime stacks. */
export async function startProjectWorker(port: ProjectWorkerPort, input: unknown): Promise<void> {
  let session: JavaScriptProjectSession | undefined;
  const fail = () => { session?.dispose(); port.postMessage({ type: "failed" }); port.close(); };
  try {
    if (!record(input) || typeof input.source !== "string" || !record(input.options)) { fail(); return; }
    const { executionMs, maximumCalls, seed } = input.options;
    session = await createJavaScriptProjectSession(input.source, {
      executionMs: executionMs as number, maximumCalls: maximumCalls as number, seed: seed as number,
    });
    port.once("close", () => session?.dispose());
    port.on("message", message => {
      try {
        if (!record(message) || message.type !== "call" || !Number.isSafeInteger(message.id)
          || typeof message.entry !== "string" || !Array.isArray(message.args)) { fail(); return; }
        const value = session!.call(message.entry, message.args as ProjectJsonValue[]);
        port.postMessage({ type: "result", id: message.id, value });
      } catch { fail(); }
    });
    port.postMessage({ type: "ready" });
  } catch { fail(); }
}
