import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { startServerProjectSession, type ServerProjectOptions, type ServerProjectSession } from "./server-session.js";
export { ServerProjectRuntimeError, type ServerProjectOptions, type ServerProjectSession } from "./server-session.js";

declare const __PLASIUS_MODULE_FORMAT__: "esm" | "cjs";

/** Start a bounded private worker using the package's exact compiled entry point. */
export function createServerProjectSession(source: string, options: ServerProjectOptions = {}): Promise<ServerProjectSession> {
  return startServerProjectSession(source, options, data => {
    const extension = __PLASIUS_MODULE_FORMAT__ === "cjs" ? "cjs" : "js";
    const moduleUrl = __PLASIUS_MODULE_FORMAT__ === "cjs" ? pathToFileURL(__filename) : new URL(import.meta.url);
    return new Worker(new URL(`./javascript.worker.${extension}`, moduleUrl), {
      workerData: data, env: {}, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
    });
  });
}
