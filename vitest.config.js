import { defineConfig } from "vitest/config";
export default defineConfig({ test: { coverage: { include: ["src/**/*.ts"], reporter: ["text", "lcov"], thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } } } });
