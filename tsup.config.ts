import { defineConfig } from "tsup";
export default defineConfig({ entry: ["src/index.ts", "src/maze.ts", "src/javascript.ts"], dts: true, sourcemap: true, clean: true, format: ["esm", "cjs"], target: "es2022" });
