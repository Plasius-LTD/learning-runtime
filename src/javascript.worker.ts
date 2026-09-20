import { parentPort, workerData } from "node:worker_threads";
import { startProjectWorker } from "./server-worker.js";

if (!parentPort) throw new Error("A project worker requires a private message port.");
void startProjectWorker(parentPort, workerData);
