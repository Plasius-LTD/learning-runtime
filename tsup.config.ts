import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "src/maze.ts", "src/cpp.ts", "src/web.ts", "src/javascript.ts", "src/server.ts", "src/javascript.worker.ts"],
  dts: true, sourcemap: true, clean: true, format: ["esm", "cjs"], target: "es2022",
  esbuildOptions(options, context) {
    options.define = { ...options.define, __PLASIUS_MODULE_FORMAT__: JSON.stringify(context.format),
      ...(context.format === "cjs" ? { "import.meta.url": "undefined" } : {}) };
  },
});
