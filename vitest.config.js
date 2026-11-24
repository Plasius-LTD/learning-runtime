import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], coverage: { include: ["src/**/*.ts", "scripts/verify-first-publication.mjs"], reporter: ["text", "lcov"], thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } } } });
