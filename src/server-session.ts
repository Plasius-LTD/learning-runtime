import type { Worker } from "node:worker_threads";
import { serializeProjectJson, type ProjectJsonValue, JAVASCRIPT_PROJECT_LIMITS } from "./javascript.js";

export class ServerProjectRuntimeError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "BUSY" | "DEADLINE" | "CLOSED" | "WORKER_FAILED") {
    super(`Learning worker: ${code}`); this.name = "ServerProjectRuntimeError";
  }
}
export interface ServerProjectSession {
  readonly closed: boolean;
  call(entry: string, args: ProjectJsonValue[]): Promise<ProjectJsonValue>;
  dispose(): Promise<void>;
}
export interface ServerProjectOptions {
  signal?: AbortSignal;
  executionMs?: number;
  maximumCalls?: number;
  seed?: number;
  startupDeadlineMs?: number;
  callDeadlineMs?: number;
}
const MAX_ACTIVE_WORKERS = 4;
let activeWorkers = 0;
const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Server-only hard deadline and admission boundary. One in-flight call per worker,
 * at most four workers per process, and no inherited environment or retry loops.
 */
export async function startServerProjectSession(source: string, options: ServerProjectOptions,
  createWorker: (data: { source: string; options: { executionMs: number; maximumCalls: number; seed: number } }) => Pick<Worker, "on" | "once" | "terminate" | "postMessage">,
): Promise<ServerProjectSession> {
  const startupDeadlineMs = options.startupDeadlineMs ?? 1500;
  const callDeadlineMs = options.callDeadlineMs ?? 500;
  const executionMs = options.executionMs ?? JAVASCRIPT_PROJECT_LIMITS.executionMs;
  const maximumCalls = options.maximumCalls ?? JAVASCRIPT_PROJECT_LIMITS.calls;
  const seed = options.seed ?? 1;
  if (typeof source !== "string" || source.length > JAVASCRIPT_PROJECT_LIMITS.sourceCharacters
    || !integer(startupDeadlineMs, 50, 5000) || !integer(callDeadlineMs, 10, 2000)
    || !integer(executionMs, 1, JAVASCRIPT_PROJECT_LIMITS.maximumExecutionMs)
    || !integer(maximumCalls, 1, JAVASCRIPT_PROJECT_LIMITS.calls) || !integer(seed, 1, 0xffffffff)) throw new ServerProjectRuntimeError("INVALID_INPUT");
  options.signal?.throwIfAborted();
  if (activeWorkers >= MAX_ACTIVE_WORKERS) throw new ServerProjectRuntimeError("BUSY");
  const worker = createWorker({ source, options: { executionMs, maximumCalls, seed } });
  activeWorkers++;
  let closed = false;
  let sequence = 0;
  let termination: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { id: number; resolve: (value: ProjectJsonValue) => void; reject: (error: Error) => void } | undefined;
  let readyResolve: () => void;
  let readyReject: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const stop = (code: ServerProjectRuntimeError["code"]): Promise<void> => {
    if (termination) return termination;
    closed = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    const error = new ServerProjectRuntimeError(code);
    readyReject(error);
    pending?.reject(error); pending = undefined;
    termination = worker.terminate().then(() => undefined);
    return termination;
  };
  const abort = () => { void stop("CLOSED"); };
  worker.once("exit", () => {
    activeWorkers--;
    if (!closed) void stop("WORKER_FAILED");
  });
  worker.once("error", () => { void stop("WORKER_FAILED"); });
  worker.on("message", (message: unknown) => {
    if (closed) return;
    if (!record(message)) { void stop("WORKER_FAILED"); return; }
    if (message.type === "ready" && sequence === 0 && !pending) { clearTimeout(timer); readyResolve(); return; }
    if (message.type === "result" && pending && message.id === pending.id) {
      try { serializeProjectJson(message.value); }
      catch { void stop("WORKER_FAILED"); return; }
      clearTimeout(timer);
      pending.resolve(message.value as ProjectJsonValue); pending = undefined; return;
    }
    void stop("WORKER_FAILED");
  });
  options.signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => { void stop("DEADLINE"); }, startupDeadlineMs);
  try { await ready; }
  catch (error) { await termination; throw error; }
  return {
    get closed() { return closed; },
    dispose: () => stop("CLOSED"),
    async call(entry, args) {
      if (closed) throw new ServerProjectRuntimeError("CLOSED");
      if (pending) throw new ServerProjectRuntimeError("BUSY");
      if (typeof entry !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(entry)
        || !Array.isArray(args) || args.length > JAVASCRIPT_PROJECT_LIMITS.arguments) throw new ServerProjectRuntimeError("INVALID_INPUT");
      try { serializeProjectJson(args); } catch { throw new ServerProjectRuntimeError("INVALID_INPUT"); }
      const id = ++sequence;
      return new Promise<ProjectJsonValue>((resolve, reject) => {
        pending = { id, resolve, reject };
        timer = setTimeout(() => { void stop("DEADLINE"); }, callDeadlineMs);
        try { worker.postMessage({ type: "call", id, entry, args }); }
        catch { void stop("WORKER_FAILED"); }
      });
    },
  };
}
