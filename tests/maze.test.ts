import { describe, expect, it } from "vitest";
import { parseMazeProject, runMazeProject, projectMazeLanguages } from "../src/index.js";

const scene = { columns: 5, rows: 5, start: { x: 1, y: 1, direction: "east" },
  goal: { x: 3, y: 2 }, walls: [], explorers: [] };
const encode = (program: unknown[], routines = {}) => JSON.stringify({ program, routines });
const move = { do: "forward" };
const right = { do: "right" };
const collect = { do: "collect" };
const route = encode([{ do: "repeat", times: 2, body: [move] }, right, move]);

describe("bounded Robot Maze project", () => {
  it("runs a repeated route and ends the rescue immediately on the pad", () => {
    const result = runMazeProject(route, scene);
    expect(result).toMatchObject({ outcome: "rescued", position: scene.goal, direction: "south", rescued: 0, remaining: 0 });
    expect(result.trace.map(frame => frame.kind)).toContain("repeat");
    expect(runMazeProject(encode([move]), scene).outcome).toBe("program-ended");
    expect(runMazeProject(encode([move, move, right, move, right, move]), scene).position).toEqual(scene.goal);
  });
  it("takes fresh wall readings in named routines and counts each explorer once", () => {
    const source = encode([collect, collect, { do: "repeat", times: 20, body: [{ do: "call", name: "search" }] }], {
      search: [{ do: "if-clear", then: [move, collect], else: [right] }],
    });
    const corridor = { ...scene, walls: [{ x: 4, y: 1 }], explorers: [{ x: 1, y: 1 }, { x: 2, y: 1 }] };
    const result = runMazeProject(source, corridor);
    expect(result.outcome).toBe("rescued");
    expect(result.rescued).toBe(2);
    expect(result.trace.filter(frame => frame.kind === "collect").map(frame => frame.rescued).slice(0, 2)).toEqual([1, 1]);
    expect(result.trace.filter(frame => frame.kind === "if-clear").map(frame => frame.clear)).toEqual([true, true, false, true]);
    expect(runMazeProject(source, corridor)).toEqual(result);
  });
  it("does not finish before all explorers are collected and respects every wall and boundary", () => {
    const populated = { ...scene, explorers: [{ x: 3, y: 2 }] };
    expect(runMazeProject(route, populated).outcome).toBe("program-ended");
    expect(runMazeProject(encode([move, move, right, move, collect]), populated).outcome).toBe("rescued");
    expect(runMazeProject(encode([{ do: "left" }, move, move]), scene).outcome).toBe("blocked");
    expect(runMazeProject(encode([move]), { ...scene, walls: [{ x: 2, y: 1 }] }).position).toEqual({ x: 1, y: 1 });
  });
  it("bounds expanded steps and recursive calls without a JavaScript stack overflow", () => {
    const repeated = encode([{ do: "repeat", times: 20, body: [{ do: "repeat", times: 20, body: [right, right] }] }]);
    expect(runMazeProject(repeated, scene)).toMatchObject({ outcome: "step-limit", steps: 512 });
    expect(runMazeProject(encode([{ do: "call", name: "again" }], { again: [{ do: "call", name: "again" }] }), scene).outcome).toBe("call-depth");
    expect(runMazeProject(route, scene, { maximumSteps: 2 }).outcome).toBe("step-limit");
    expect(() => runMazeProject(route, scene, { maximumSteps: 513 })).toThrow();
    const controller = new AbortController(); controller.abort();
    expect(() => runMazeProject(route, scene, { signal: controller.signal })).toThrow();
  });
  it("rejects unknown instructions, fields, routine references, malformed values and source limits", () => {
    const invalid = ["bad json", "null", "[]", " ".repeat(16001),
      encode([{ do: "fetch", url: "https://example.invalid" }]), encode([{ do: "forward", x: 2 }]),
      encode([{ do: "repeat", times: 0, body: [move] }]), encode([{ do: "repeat", times: 21, body: [move] }]),
      encode([{ do: "repeat", times: 1.5, body: [move] }]), encode([{ do: "repeat", times: 2, body: "wrong" }]),
      encode([{ do: "if-clear", then: [move] }]), encode([{ do: "call", name: "missing" }]),
      JSON.stringify({ program: [], routines: {}, completed: true }),
      encode([], { "not a name": [move] }), encode(Array.from({ length: 65 }, () => move)),
      encode([], Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`routine-${i}`, [move]])))];
    // JSON.parse is used to retain this special own property; object literal syntax would change its prototype instead.
    invalid.push('{"program":[],"routines":{"__proto__":[]}}');
    for (const value of invalid) expect(() => parseMazeProject(value)).toThrow();
    let nested: unknown = move;
    for (let i = 0; i < 13; i++) nested = { do: "repeat", times: 1, body: [nested] };
    expect(() => parseMazeProject(encode([nested]))).toThrow();
  });
  it("validates world dimensions, positions, collisions and unique explorer markers", () => {
    for (const value of [null, {}, { ...scene, columns: 21 }, { ...scene, rows: 0 },
      { ...scene, start: { x: 1, y: 1, direction: "up" } }, { ...scene, goal: { x: 7, y: 2 } },
      { ...scene, walls: [{ x: 1, y: 1 }] }, { ...scene, walls: [{ x: 3, y: 2 }] },
      { ...scene, explorers: [{ x: 2, y: 1 }, { x: 2, y: 1 }] },
      { ...scene, walls: [{ x: 2, y: 1 }], explorers: [{ x: 2, y: 1 }] },
      { ...scene, explorers: "invalid" }, { ...scene, network: true }]) expect(() => runMazeProject(route, value)).toThrow();
  });
  it("produces matching explanatory JavaScript, Python and C++ views from the same blocks", () => {
    const source = encode([{ do: "repeat", times: 2, body: [{ do: "call", name: "search-right" }] }], {
      "search-right": [{ do: "if-clear", then: [move, collect], else: [right] }],
    });
    const views = projectMazeLanguages(source);
    expect(views.javascript).toContain("function route_search_right()");
    expect(views.javascript).toContain("if (isClear())");
    expect(views.python).toContain("def route_search_right():");
    expect(views.python).toContain("for count0 in range(2):");
    expect(views.cpp).toContain("void route_search_right();");
    expect(views.cpp).toContain("collectExplorer();");
    expect(projectMazeLanguages(encode([])).python).toContain("pass");
  });
});
