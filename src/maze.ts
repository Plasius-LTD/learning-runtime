/** Closed visual instructions; source is data and is never evaluated as host code. */
export type MazeInstruction =
  | { do: "forward" | "left" | "right" | "collect" }
  | { do: "repeat"; times: number; body: MazeInstruction[] }
  | { do: "if-clear"; then: MazeInstruction[]; else: MazeInstruction[] }
  | { do: "call"; name: string };
export interface MazeProject { program: MazeInstruction[]; routines: Record<string, MazeInstruction[]> }
export interface MazePoint { x: number; y: number }
export type MazeDirection = "north" | "east" | "south" | "west";
export interface MazeScene {
  columns: number; rows: number;
  start: MazePoint & { direction: MazeDirection };
  goal: MazePoint;
  walls: MazePoint[];
  explorers: MazePoint[];
}
export interface MazeFrame {
  step: number;
  kind: MazeInstruction["do"] | "start";
  position: MazePoint;
  direction: MazeDirection;
  rescued: number;
  remaining: number;
  clear?: boolean;
}
export interface MazeRunResult {
  outcome: "rescued" | "program-ended" | "blocked" | "step-limit" | "call-depth";
  position: MazePoint;
  direction: MazeDirection;
  rescued: number;
  remaining: number;
  steps: number;
  trace: MazeFrame[];
}
export const MAZE_LIMITS = Object.freeze({ sourceCharacters: 16000, instructions: 256, nesting: 12,
  routines: 16, sequenceLength: 64, repeat: 20, steps: 512, callDepth: 16, dimension: 20, explorers: 64 });
export class LearningRuntimeInputError extends Error {
  constructor() { super("The learning project or scenario is invalid."); this.name = "LearningRuntimeInputError"; }
}
const invalid = (): never => { throw new LearningRuntimeInputError(); };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const routineName = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/u.test(value);
const DIRECTIONS: MazeDirection[] = ["north", "east", "south", "west"];
const DELTAS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const key = (point: MazePoint) => `${point.x},${point.y}`;

/** Validate the entire source before executing any instruction; return detached data. */
export function parseMazeProject(source: string): MazeProject {
  if (typeof source !== "string" || source.length > MAZE_LIMITS.sourceCharacters) return invalid();
  let value: unknown;
  try { value = JSON.parse(source); } catch { return invalid(); }
  if (!record(value) || !exact(value, ["program", "routines"]) || !record(value.routines)) return invalid();
  const routines = value.routines;
  const names = Object.keys(routines);
  if (names.length > MAZE_LIMITS.routines || names.some(name => !routineName(name))) return invalid();
  let nodes = 0;
  function sequence(value: unknown, depth: number): MazeInstruction[] {
    if (!Array.isArray(value) || value.length > MAZE_LIMITS.sequenceLength || depth > MAZE_LIMITS.nesting) return invalid();
    return value.map((node: unknown): MazeInstruction => {
      if (++nodes > MAZE_LIMITS.instructions || !record(node)) return invalid();
      switch (node.do) {
        case "forward": case "left": case "right": case "collect":
          if (!exact(node, ["do"])) return invalid();
          return { do: node.do };
        case "repeat":
          if (!exact(node, ["do", "times", "body"]) || !integer(node.times, 1, MAZE_LIMITS.repeat)) return invalid();
          return { do: "repeat", times: node.times, body: sequence(node.body, depth + 1) };
        case "if-clear":
          if (!exact(node, ["do", "then", "else"])) return invalid();
          return { do: "if-clear", then: sequence(node.then, depth + 1), else: sequence(node.else, depth + 1) };
        case "call":
          if (!exact(node, ["do", "name"]) || !routineName(node.name) || !names.includes(node.name)) return invalid();
          return { do: "call", name: node.name };
        default: return invalid();
      }
    });
  }
  return { program: sequence(value.program, 0), routines: Object.fromEntries(names.map(name => [name, sequence(routines[name], 0)])) };
}

/** Hosts supply trusted scenarios, but malformed or shared mutable worlds still fail closed. */
export function parseMazeScene(value: unknown): MazeScene {
  if (!record(value) || !exact(value, ["columns", "rows", "start", "goal", "walls", "explorers"])
    || !integer(value.columns, 3, MAZE_LIMITS.dimension) || !integer(value.rows, 3, MAZE_LIMITS.dimension)) return invalid();
  const columns = value.columns;
  const rows = value.rows;
  function point(input: unknown, start = false): MazePoint {
    if (!record(input) || !exact(input, start ? ["x", "y", "direction"] : ["x", "y"])
      || !integer(input.x, 0, columns - 1) || !integer(input.y, 0, rows - 1)) return invalid();
    return { x: input.x, y: input.y };
  }
  const start = point(value.start, true);
  if (!record(value.start) || !DIRECTIONS.includes(value.start.direction as MazeDirection)) return invalid();
  const goal = point(value.goal);
  function points(input: unknown, max: number): MazePoint[] {
    if (!Array.isArray(input) || input.length > max) return invalid();
    const result = input.map(item => point(item));
    if (new Set(result.map(key)).size !== result.length) return invalid();
    return result;
  }
  const walls = points(value.walls, columns * rows);
  const explorers = points(value.explorers, MAZE_LIMITS.explorers);
  const blocked = new Set(walls.map(key));
  if ([start, goal, ...explorers].some(position => blocked.has(key(position)))) return invalid();
  return { columns, rows, start: { ...start, direction: value.start.direction as MazeDirection }, goal, walls, explorers };
}

/** Deterministic bounded rescue simulation. Victory is an explicit world rule. */
export function runMazeProject(source: string, world: unknown, options: { maximumSteps?: number; signal?: AbortSignal } = {}): MazeRunResult {
  options.signal?.throwIfAborted();
  const maximumSteps = options.maximumSteps ?? MAZE_LIMITS.steps;
  if (!integer(maximumSteps, 1, MAZE_LIMITS.steps)) return invalid();
  const project = parseMazeProject(source);
  const scene = parseMazeScene(world);
  let position = { x: scene.start.x, y: scene.start.y };
  let direction = DIRECTIONS.indexOf(scene.start.direction);
  let steps = 0;
  let outcome: MazeRunResult["outcome"] = "program-ended";
  const walls = new Set(scene.walls.map(key));
  const remaining = new Set(scene.explorers.map(key));
  const trace: MazeFrame[] = [];
  const blocked = (point: MazePoint) => point.x < 0 || point.x >= scene.columns || point.y < 0 || point.y >= scene.rows || walls.has(key(point));
  const ahead = () => ({ x: position.x + DELTAS[direction]!.x, y: position.y + DELTAS[direction]!.y });
  const snapshot = (kind: MazeFrame["kind"], clear?: boolean) => {
    trace.push({ step: steps, kind, position: { ...position }, direction: DIRECTIONS[direction]!,
      rescued: scene.explorers.length - remaining.size, remaining: remaining.size, ...(clear === undefined ? {} : { clear }) });
  };
  const victory = () => { if (key(position) === key(scene.goal) && remaining.size === 0) outcome = "rescued"; };
  snapshot("start");
  victory();
  function execute(sequence: MazeInstruction[], callDepth: number): void {
    for (const node of sequence) {
      options.signal?.throwIfAborted();
      if (outcome !== "program-ended") return;
      if (steps >= maximumSteps) { outcome = "step-limit"; return; }
      steps++;
      if (node.do === "repeat") {
        snapshot("repeat");
        for (let i = 0; i < node.times && outcome === "program-ended"; i++) execute(node.body, callDepth);
      } else if (node.do === "if-clear") {
        const clear = !blocked(ahead()); snapshot("if-clear", clear);
        execute(clear ? node.then : node.else, callDepth);
      } else if (node.do === "call") {
        snapshot("call");
        if (callDepth >= MAZE_LIMITS.callDepth) { outcome = "call-depth"; return; }
        execute(project.routines[node.name]!, callDepth + 1);
      } else {
        if (node.do === "left") direction = (direction + 3) % 4;
        else if (node.do === "right") direction = (direction + 1) % 4;
        else if (node.do === "collect") remaining.delete(key(position));
        else {
          const next = ahead();
          if (blocked(next)) outcome = "blocked";
          else position = next;
        }
        snapshot(node.do);
        if (outcome !== "blocked") victory();
      }
    }
  }
  execute(project.program, 0);
  return { outcome, position: { ...position }, direction: DIRECTIONS[direction]!, rescued: scene.explorers.length - remaining.size,
    remaining: remaining.size, steps, trace };
}

/** Display-only language equivalents. The validated visual project remains the source of truth. */
export function projectMazeLanguages(source: string): { javascript: string; python: string; cpp: string } {
  const project = parseMazeProject(source);
  const name = (value: string) => `route_${value.replace(/-/gu, "_")}`;
  function render(language: "javascript" | "python" | "cpp"): string {
    const python = language === "python";
    const pad = (depth: number) => " ".repeat(depth * (python ? 4 : 2));
    const commands = { forward: python ? "move_forward()" : "moveForward();", left: python ? "turn_left()" : "turnLeft();",
      right: python ? "turn_right()" : "turnRight();", collect: python ? "collect_explorer()" : "collectExplorer();" };
    function sequence(nodes: MazeInstruction[], depth: number): string[] {
      if (!nodes.length && python) return [pad(depth) + "pass"];
      return nodes.flatMap(node => {
        const line = (value: string) => pad(depth) + value;
        if (node.do === "call") return [line(`${name(node.name)}()${python ? "" : ";"}`)];
        if (node.do === "repeat") {
          const counter = `count${depth}`;
          return python
            ? [line(`for ${counter} in range(${node.times}):`), ...sequence(node.body, depth + 1)]
            : [line(`for (${language === "cpp" ? "int" : "let"} ${counter} = 0; ${counter} < ${node.times}; ${counter}++) {`), ...sequence(node.body, depth + 1), line("}")];
        }
        if (node.do === "if-clear") return python
          ? [line("if is_clear():"), ...sequence(node.then, depth + 1), line("else:"), ...sequence(node.else, depth + 1)]
          : [line("if (isClear()) {"), ...sequence(node.then, depth + 1), line("} else {"), ...sequence(node.else, depth + 1), line("}")];
        return [line(commands[node.do])];
      });
    }
    const definitions = Object.entries(project.routines).flatMap(([id, body]) => python
      ? [`def ${name(id)}():`, ...sequence(body, 1), ""]
      : [`${language === "cpp" ? "void" : "function"} ${name(id)}() {`, ...sequence(body, 1), "}", ""]);
    const declarations = language === "cpp" ? Object.keys(project.routines).map(id => `void ${name(id)}();`) : [];
    const main = language === "cpp" ? ["void runMaze() {", ...sequence(project.program, 1), "}"] : sequence(project.program, 0);
    return [...declarations, ...definitions, ...main].join("\n");
  }
  return { javascript: render("javascript"), python: render("python"), cpp: render("cpp") };
}
