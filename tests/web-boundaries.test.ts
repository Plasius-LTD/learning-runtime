import { describe, expect, it, vi } from "vitest";
import { createWebProject, WebProjectError, type WebProjectOptions } from "../src/web.js";

describe("web project grammar and resource boundaries", () => {
  it("supports useful semantic form, table and disclosure attributes", () => {
    const html = `<main id="planner" class="planner narrow" title="Private planner" aria-description="Fictional tasks">
      <!-- a learner comment -->
      <fieldset><legend>Mission</legend><label for="minutes">Minutes</label>
      <input id="minutes" name="minutes" type="number" min="1" max="120" step="1" required readonly value="10" aria-describedby="help">
      <p id="help" role="note" tabindex="-1">Use whole minutes.</p>
      <textarea name="note" rows="3" cols="20" maxlength="1000" placeholder="A fictional note" data-value="note"></textarea>
      <select name="priority" data-value="priority"><option value="low">Low</option><option value="high" selected>High</option></select>
      <input name="power" type="range" min="0" max="100" data-value="power">
      <input name="paused" type="checkbox" checked data-checked="paused">
      <button type="button" disabled data-disabled="disabled" aria-label="Stop rover" aria-controls="planner">Stop</button></fieldset>
      <table><caption>History</caption><tr><th scope="col">State</th><td colspan="1" rowspan="1">Stopped</td></tr></table>
      <details open><summary>Help</summary><p aria-hidden="false">Read the status.</p></details>
      <p role="status" aria-live="assertive" aria-atomic="true">Ready.</p></main>`;
    const project = createWebProject({ html, css: "" });
    const result = project.render({ note: "Read the map", priority: "high", power: 30, paused: false, disabled: false });
    expect(JSON.stringify(result)).toContain('"tag":"tbody"');
    expect(JSON.stringify(result)).toContain('"field":{"name":"note","type":"textarea"}');
    expect(JSON.stringify(result)).not.toContain('"checked":""');
    expect(JSON.stringify(result)).not.toContain('"disabled":""');
  });
  it("supports bounded responsive styling, variables, focus and reduced motion", () => {
    const css = `:root { --accent: #123456; }
      main { color: var(--accent); display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
      p { margin: clamp(0px, 1rem, 20px); opacity: .9; }
      button:focus-visible { outline: 2px solid blue; }
      button[aria-pressed="true"] { font-weight: bold; }
      input[type=checkbox] { margin: 1px; }
      input[aria-invalid=true] { border: 1px solid red; }
      li:nth-child(2) { font-weight: bold; }
      @media (prefers-reduced-motion: reduce) { p { transition-duration: 0s; } }
      @media (prefers-color-scheme: dark) { main { color: white; background-color: black; } }
      @media (min-width: 40rem) { main { grid-template-columns: repeat(2, 1fr); } }`;
    expect(createWebProject({ html: "<main><p>Text</p></main>", css }).render({}).css).toContain("repeat(2,1fr)");
  });
  it.each([
    '<html><body onload="x">Hidden wrapper</body></html>', '<head><base href="https://example.invalid"></head>',
    '<p>Text</script>', '<!DOCTYPE html><p>Text</p>', '<p>&#0;</p>', '<p data-unknown="value"></p>',
    '<input data-checked="flag" type="text">', '<div data-disabled="flag"></div>', '<input data-text="text">',
    '<p data-value="value"></p>', '<p data-pressed="flag"></p>', '<p data-id="id"></p>',
    '<input data-repeat="items">', '<p name="field"></p>', '<p class="bad!class"></p>', '<p title=""></p>',
    '<label for="bad.name">Name</label>', '<p for="name">Name</p>', '<p disabled></p>', '<input checked="false" type="checkbox">',
    '<p checked></p>', '<p selected></p>', '<p open></p>', '<p type="text"></p>', '<button type="reset">Reset</button>',
    '<input min="Infinity">', '<input max="1001">', '<p role="application">Text</p>', '<p aria-live="loud">Text</p>',
    '<p aria-atomic="maybe">Text</p>', '<p tabindex="2">Text</p>', '<th scope="everything">Text</th>',
    '<button type="submit" data-action="add">Add</button>', '<p class="constructor">Text</p>',
    '<p data-text="a.b.c.d.e"></p>', '<p data-text="prototype"></p>',
  ])("refuses invalid semantics or tokens even when a browser would discard them", html => {
    expect(() => createWebProject({ html, css: "" })).toThrow(WebProjectError);
  });
  it.each([
    'p { color: definitely-not-a-colour; }', 'p::before { color: red; }', '[title] { color:red; }',
    'p:has(span) { color:red; }', '@media print { p { color:red; } }', '@media (max-width:1px);',
    'p { width: 5000px; }', 'p { width: 10vh; }', 'p { transition-duration: 3s; }', 'p { transition-duration: -1ms; }',
    'p { transition-duration: 2001ms; }', 'p { grid-template-columns: repeat(13,1fr); }',
    'p { grid-template-columns: repeat(0,1fr); }', 'p { grid-template-columns: repeat(1.5,1fr); }',
    'p { --x: url(data:text/plain,hello); }', 'p { color: var(--safe, url(x)); }', 'p { color: ; broken }',
    'button[aria-pressed=true i] { color:red; }', 'button[aria-pressed=maybe] { color:red; }',
    'input[type=file] { color:red; }', 'p[title=x] { color:red; }',
  ])("refuses unsupported CSS grammar and excessive layout or timing values", css => {
    expect(() => createWebProject({ html: "<p>Text</p>", css })).toThrow(WebProjectError);
  });
  it("counts expanded text nodes and the serialized output separately", () => {
    const manyNodes = createWebProject({ html: '<ul><li data-repeat="items">' + '<span data-text="title"></span>'.repeat(8) + '</li></ul>', css: "" });
    const items = Array.from({ length: 50 }, (_, index) => ({ id: String(index), title: "x" }));
    expect(() => manyNodes.render({ items })).toThrow("Web project: LIMIT_EXCEEDED");
    const manyText = createWebProject({ html: '<div>' + '<p data-text="text"></p>'.repeat(30) + '</div>', css: "" });
    expect(() => manyText.render({ text: "x".repeat(3000) })).toThrow("Web project: LIMIT_EXCEEDED");
    const input = createWebProject({ html: '<input name="value" data-value="value">', css: "" });
    expect(() => input.render({ value: "x".repeat(2001) })).toThrow("Web project: LIMIT_EXCEEDED");
    expect(input.render({ value: "corrected" }).nodes).toHaveLength(1);
  });
  it("bounds syntax expansion, attributes and binding-created text independently", () => {
    const attrs = 'id="n" name="n" type="number" class="n" title="n" aria-label="n" aria-description="n" aria-labelledby="n" aria-describedby="n" aria-controls="n" hidden disabled required readonly min="1" max="2" step="1"';
    expect(() => createWebProject({ html: `<input ${attrs}>`, css: "" })).toThrow("Web project: LIMIT_EXCEEDED");
    expect(() => createWebProject({ html: '<p title="' + 'x'.repeat(241) + '">x</p>', css: "" })).toThrow(WebProjectError);
    expect(() => createWebProject({ html: "<p>x</p>".repeat(150), css: "" })).toThrow("Web project: LIMIT_EXCEEDED");
    expect(() => createWebProject({ html: "<p>x</p>", css: "p{margin:0}".repeat(350) })).toThrow("Web project: LIMIT_EXCEEDED");
    expect(() => createWebProject({ html: "<p>x</p>", css: "@media(max-width:400px){".repeat(10) + "p{color:red}" + "}".repeat(10) })).toThrow("Web project: LIMIT_EXCEEDED");
    const project = createWebProject({ html: '<ul><li data-repeat="items">' + '<span data-text="title"></span>'.repeat(8) + '</li></ul><p data-text="tail"></p>', css: "" });
    expect(() => project.render({ items: Array.from({ length: 45 }, (_, index) => ({ id: String(index), title: "x" })), tail: "end" })).toThrow("Web project: LIMIT_EXCEEDED");
    expect(createWebProject({ html: '<p title="two\nlines">Text</p>', css: "" }).render({}).nodes).toHaveLength(1);
  });
  it("rejects malformed view roots, missing paths and invalid action/label bindings", () => {
    const action = createWebProject({ html: '<button type="button" data-action="edit" data-id="item.id" data-label="label">Edit</button>', css: "" });
    for (const view of [null, [], "text", { item: [], label: "Edit" }, { item: { id: 5 }, label: "Edit" },
      { item: { id: "" }, label: "Edit" }, { item: { id: "x".repeat(129) }, label: "Edit" },
      { item: { id: "ok" }, label: "" }, { item: { id: "ok" }, label: "x".repeat(241) }]) {
      expect(() => action.render(view)).toThrow(WebProjectError);
    }
    const repeated = createWebProject({ html: '<li data-repeat="items">Item</li>', css: "" });
    expect(() => repeated.render({ items: {} })).toThrow(WebProjectError);
    expect(() => repeated.render({ items: [{ id: "" }] })).toThrow(WebProjectError);
    expect(() => repeated.render({ items: [{ id: "x".repeat(129) }] })).toThrow(WebProjectError);
  });
  it("rejects invalid source/options without invoking accessors or disclosing thrown details", () => {
    for (const source of [null, [], {}, { html: "x", css: "", extra: true }, { html: "\0", css: "" }]) {
      expect(() => createWebProject(source as never)).toThrow(WebProjectError);
    }
    const getter = vi.fn(() => { throw new Error("private detail"); });
    for (const options of [[], { extra: true }, { signal: {} }, Object.create({ inherited: true }),
      { [Symbol("hidden")]: true }, Object.defineProperty({}, "signal", { enumerable: true, get: getter })]) {
      expect(() => createWebProject({ html: "<p>x</p>", css: "" }, options as WebProjectOptions)).toThrow("Web project: INVALID_SOURCE");
    }
    expect(getter).not.toHaveBeenCalled();
    expect(() => createWebProject(Object.defineProperty({ css: "" }, "html", { enumerable: true, get: getter }) as never)).toThrow(WebProjectError);
    expect(getter).not.toHaveBeenCalled();
  });
});
