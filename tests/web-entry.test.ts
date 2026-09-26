import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type * as WebModule from "../src/web.js";

describe("published web project entry points", () => {
  it("projects the same inert form data through built ESM and CommonJS", async () => {
    const esm = await import(new URL("../dist/web.js", import.meta.url).href) as typeof WebModule;
    const cjs = createRequire(import.meta.url)("../dist/web.cjs") as typeof WebModule;
    const results = [];
    for (const runtime of [esm, cjs]) {
      const project = runtime.createWebProject({ html: '<form data-action="add"><label for="title">Title</label><input id="title" name="title" data-value="title"><button type="submit">Add</button></form>', css: "form { display: grid; gap: 8px; }" });
      results.push(project.render({ title: "Fictional mission" }));
      project.dispose();
      expect(project.closed).toBe(true);
    }
    expect(results[0]).toEqual(results[1]);
    expect(JSON.stringify(results[0])).toContain('"action":{"type":"add"}');
  });
});
