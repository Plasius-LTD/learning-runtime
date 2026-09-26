import { describe, expect, it, vi } from "vitest";
import { createWebProject, WebProjectError } from "../src/web.js";

describe("bounded semantic web projects", () => {
  it("projects a semantic form, live message and repeated identified cards without executing source", () => {
    const project = createWebProject({ html: `<main><h1 data-text="title"></h1>
      <form data-action="add"><label for="title">Mission title</label><input id="title" name="title" type="text" maxlength="80" data-value="draft.title"><button type="submit" data-disabled="addDisabled">Add mission</button></form>
      <p role="status" aria-live="polite" data-text="message"></p>
      <ul><li data-repeat="missions"><span data-text="title"></span><button type="button" data-action="toggle" data-id="id" data-pressed="done" data-label="toggleLabel">Toggle</button></li></ul></main>`,
      css: 'main { display: grid; gap: 1rem; color: #123456; } @media (max-width: 480px) { main { padding: 8px; } }' });
    const result = project.render({ title: "Mission planner", draft: { title: "Scout" }, addDisabled: false, message: "Ready.",
      missions: [{ id: "m1", title: "Find the bridge", done: false, toggleLabel: "Complete Find the bridge" }] });
    expect(JSON.stringify(result.nodes)).toContain("Mission planner");
    expect(JSON.stringify(result.nodes)).toContain('"action":{"type":"toggle","id":"m1"}');
    expect(JSON.stringify(result.nodes)).toContain('"aria-pressed":"false"');
    expect(JSON.stringify(result.nodes)).toContain('"field":{"name":"title","type":"text"}');
    expect(result.css).toContain("display:grid");
    expect(result.css).toContain("@media");
    project.dispose();
  });
  it("returns detached projections and templates, with text values kept as inert data", () => {
    const project = createWebProject({ html: '<section><p data-text="message"></p></section>', css: "" });
    const view = { message: '<img src=x onerror="alert(1)">' };
    const first = project.render(view);
    expect(first.nodes).toEqual([{ kind: "element", tag: "section", attributes: {}, children: [
      { kind: "element", tag: "p", attributes: {}, children: [{ kind: "text", text: view.message }] },
    ] }]);
    first.nodes.length = 0;
    const template = project.template; template.length = 0;
    expect(project.render(view).nodes).toHaveLength(1);
    expect(project.template).toHaveLength(1);
    expect(view.message).toContain("onerror");
  });
  it("supports native checkbox/progress projection and conditional content", () => {
    const project = createWebProject({ html: '<label><input name="paused" type="checkbox" data-checked="paused">Pause</label><progress max="100" data-value="energy"></progress><p data-if="hasError" data-text="error"></p>', css: "" });
    const value = project.render({ paused: true, energy: 70, hasError: false, error: "" });
    expect(JSON.stringify(value.nodes)).toContain('"checked":""');
    expect(JSON.stringify(value.nodes)).toContain('"value":"70"');
    expect(value.nodes).toHaveLength(2);
    expect(project.render({ paused: false, energy: 0, hasError: true, error: "Stopped" }).nodes).toHaveLength(3);
  });
  it("projects accessible custom form validation without relying on native popups", () => {
    const project = createWebProject({ html: '<form novalidate data-action="add"><label for="title">Title</label><input id="title" name="title" aria-required="true" aria-describedby="title-error" data-invalid="titleInvalid"><p id="title-error" role="alert" data-text="titleError"></p><button type="submit">Add</button></form>', css: "" });
    expect(JSON.stringify(project.render({ titleInvalid: true, titleError: "Enter a mission title." }))).toContain('"aria-invalid":"true"');
    expect(JSON.stringify(project.render({ titleInvalid: false, titleError: "" }))).toContain('"aria-invalid":"false"');
    expect(() => createWebProject({ html: '<p novalidate>x</p>', css: "" })).toThrow(WebProjectError);
    expect(() => createWebProject({ html: '<p data-invalid="flag">x</p>', css: "" })).toThrow(WebProjectError);
  });
  it("has no evaluation, network, storage or DOM capabilities", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const project = createWebProject({ html: '<p data-text="text"></p>', css: "p { margin: 0; }" });
    project.render({ text: 'fetch("https://example.invalid")' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it.each([
    '<script>alert(1)</script>', '<img src="https://example.invalid/pixel">', '<iframe srcdoc="x"></iframe>',
    '<a href="javascript:alert(1)">Link</a>', '<meta http-equiv="refresh" content="0;url=https://example.invalid">',
    '<svg><script>alert(1)</script></svg>', '<math><mtext>x</mtext></math>', '<style>p{color:red}</style>',
    '<button onclick="alert(1)">Go</button>', '<form action="https://example.invalid">x</form>',
    '<input type="file">', '<input type="password">', '<div is="custom-widget">x</div>', '<custom-widget>x</custom-widget>',
    '<input name="__proto__">', '<p data-text="constructor.prototype"></p>', '<p data-text="x[0]"></p>',
    '<p id="same">a</p><p id="same">b</p>', '<li data-repeat="items"><span id="repeated">x</span></li>',
    '<button data-action="window.open">x</button>', '<p style="color:red">x</p>',
    '<button type="button" data-action="x" data-action="y">x</button>',
  ])("rejects unsupported or ambiguous markup", html => {
    expect(() => createWebProject({ html, css: "" })).toThrow(WebProjectError);
  });
  it.each([
    '@import "https://example.invalid/x.css";', 'p { background: url(https://example.invalid/x); }',
    'p { background: u\\72l(https://example.invalid/x); }', '@font-face { font-family:x; src:url(x); }',
    'p { behavior: url(x); }', 'p { color: expression(alert(1)); }', 'p { color: red !important; }',
    '@keyframes spin { from { opacity:0; } to { opacity:1; } }', 'p { position: fixed; }',
  ])("rejects styles with resources, unsupported effects or global priority", css => {
    expect(() => createWebProject({ html: "<p>Text</p>", css })).toThrow(WebProjectError);
  });
  it("bounds parsing, repeated output and JSON view data", () => {
    expect(() => createWebProject({ html: "x".repeat(24001), css: "" })).toThrow(WebProjectError);
    expect(() => createWebProject({ html: "<div>".repeat(25) + "x" + "</div>".repeat(25), css: "" })).toThrow(WebProjectError);
    expect(() => createWebProject({ html: "<p>x</p>".repeat(300), css: "" })).toThrow(WebProjectError);
    expect(() => createWebProject({ html: "<p>x</p>", css: " ".repeat(16001) })).toThrow(WebProjectError);
    const project = createWebProject({ html: '<ul><li data-repeat="items" data-text="title"></li></ul>', css: "" });
    expect(() => project.render({ items: Array.from({ length: 51 }, (_, index) => ({ id: String(index), title: "x" })) })).toThrow(WebProjectError);
    expect(() => project.render({ items: [{ id: "same", title: "x" }, { id: "same", title: "y" }] })).toThrow(WebProjectError);
    const getter = vi.fn(() => []);
    expect(() => project.render(Object.defineProperty({}, "items", { enumerable: true, get: getter }))).toThrow(WebProjectError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("refuses wrong binding types instead of coercing records into markup", () => {
    for (const [html, view] of [
      ['<p data-text="x"></p>', { x: {} }], ['<button data-disabled="x">Go</button>', { x: "false" }],
      ['<p data-text="missing"></p>', {}], ['<li data-repeat="items">Item</li>', { items: [1] }],
    ] as const) expect(() => createWebProject({ html, css: "" }).render(view)).toThrow(WebProjectError);
  });
  it("honours cancellation and idempotent disposal with fixed errors", () => {
    const controller = new AbortController();
    const project = createWebProject({ html: "<p>Text</p>", css: "" }, { signal: controller.signal });
    controller.abort(new Error("private abort detail"));
    expect(project.closed).toBe(true);
    expect(() => project.render({})).toThrow("Web project: CLOSED");
    project.dispose(); project.dispose();
    expect(() => createWebProject({ html: "<p>Text</p>", css: "" }, { signal: controller.signal })).toThrow("Web project: CLOSED");
  });
});
