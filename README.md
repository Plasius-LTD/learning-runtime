# @plasius/learning-runtime

Bounded project execution and deterministic simulation for learning course hosts.
This package is under development; no released runtime is available yet.

## Runtime entry points

`@plasius/learning-runtime/maze` parses the closed visual project and runs bounded
world scenarios. `runMazeProject(source, scene)` returns position, heading, rescue
counts and a step trace. Reaching the pad with no explorers remaining ends the
rescue. `projectMazeLanguages(source)` produces explanatory JavaScript, Python and
C++ views from that same visual program; the views are not executed.

`@plasius/learning-runtime/javascript` lazily loads QuickJS. Call
`createJavaScriptProjectSession(source, { signal })`, then
`session.call("update", [state, input])` using JSON data, and always
`session.dispose()` in a finally block. A session has isolated global state, a
16 MiB memory limit, a 256 KiB stack and a 100 ms deadline per call (host adjustable
up to 500 ms, enforced cooperatively by the engine). Source and JSON transport are limited to 64,000 characters; input
has depth/node limits. Runtime failure closes the session. No host functions or
module loader are installed. Calls are synchronous: the browser must use a worker
and impose its own hard deadline and cancellation. Server assessors also run it
inside a worker they can terminate: a native engine operation cannot always be
interrupted immediately. Hosts validate the returned
game-specific state before rendering or assessing it.
`Math.random()` uses a host-selected reproducible seed (default 1); ambient Date
and Intl clocks are absent. Supply simulated time explicitly through project input.

Server consumers use `createServerProjectSession` from
`@plasius/learning-runtime/server`. Its asynchronous `call` API runs the same core
inside a private Node worker with an empty environment. Startup is limited to
1.5 seconds and calls to 500 ms by default; timeout, cancellation or failure
terminates the worker. There is one in-flight request per session and at most four
workers per process, with immediate `BUSY` responses instead of an unbounded queue.
Always `await session.dispose()`; error codes carry no source or worker stack.
Both ESM and CommonJS entry points are exercised using their actual compiled
workers. The native-allocation regression also checks that the host stays responsive.

All project/state data stays in the caller's process and must be handled as
private learner content. Runtime errors contain fixed codes, never learner text.

`@plasius/learning-runtime/cpp` supplies `createCppProjectSession(source, options)`
for the documented C++ robot simulator subset. Declare output signatures such as
`{ outputs: { setServoAngle: ["number"] } }`; each `run({ timeMs, sensors })`
returns structured `commands` and a detached primitive `globals` snapshot.
The host validates command names, ranges and simulation safety before applying
them. No host callback is accepted and no hardware action is performed.

Programs require `void loop()` and may include a one-time `void setup()`, globals,
typed helper functions, block-local variables, assignments, if/else, for/while,
return, break and continue. Supported primitive types are int, double, bool and
string; constants require initial values. Integer division truncates toward zero;
mixed numeric arithmetic uses double. Conditions require bool and sensor readers
require the matching primitive type. There are no implicit number/bool conversions,
arrays, pointers, classes, includes, imports or arbitrary member access. This is a
teaching simulator, not a full C++ compiler or an Arduino firmware toolchain.

The built-ins are `millis()`, `numberSensor(name)`, `boolSensor(name)`,
`textSensor(name)`, `min(a,b)`, `max(a,b)` and `abs(value)`. Time is supplied by
the host, never read from a wall clock. Use elapsed-time conditions instead of
blocking sleeps. Sensor observations are freshly snapshotted on each tick.
Globals persist only inside that session; create a new session to restart.

Limits: 32,768 source characters, 4,096 tokens, parse depth 64, 64 top-level names,
32 functions, eight arguments, 64 variables per scope, 2,000 execution operations
and call depth 16 per tick. A tick accepts at most 32 primitive sensors and emits
at most 64 commands from at most 16 declared signatures. Strings are at most 256
characters; numbers are finite and at most one billion in magnitude. Simulated
milliseconds are nonnegative integers and cannot run backwards. Accessor inputs
are rejected without invoking them. Failure or cancellation closes the session,
discards that tick's commands and releases state; error messages contain no source.
Use `dispose()` after successful use as well. Browser hosts still run learners'
programs in their cancellable worker, keeping the interface responsive.

The browser worker and the server assessor use the same runtime. Learner source
never receives browser, network, storage, account or physical hardware access.
The host owns authentication, saves, protected test scenarios and final scoring.
Runtime success alone grants no progress, badge or entitlement.

## Development

Use the Node version in `.nvmrc`, then `npm ci`, `npm test`, `npm run typecheck`,
`npm run lint` and `npm run build`. `npm run test:coverage` enforces 80% coverage;
every changed source must appear in LCOV. `npm run pack:check` checks publication
contents. Source and project data must never enter logs or test snapshots.

Repository setup follows the schema package template. Publication is exclusively
through `.github/workflows/cd.yml` on `main` and the GitHub `production` environment.
Consumer adoption requires verified CI, the exact package release and registry
integrity. Never publish directly from a workstation.

For the first publication only, npm requires the package to exist before a trusted
publisher can be configured. An operator can place a short-lived, minimally scoped
publishing token in the GitHub `production` environment as `NPM_BOOTSTRAP_TOKEN`,
then select `first_publication` on this same CD workflow. This opt-in path retains
the exact-main CI, immutable bundle, provenance and registry-integrity checks. It
refuses existing packages, missing credentials, registry errors and redirects.
The credential is available only to the publication step; no local publication is
permitted. Once created, configure npm's trusted publisher for organisation
`Plasius-LTD`, repository `learning-runtime`, workflow `cd.yml`, environment
`production`, with direct publication allowed. Revoke the bootstrap token and
delete the environment secret. All later releases use the default OIDC path.

See [the first-publication decision](docs/adrs/adr-0002-first-publication.md).

See [the runtime boundary decision](docs/adrs/adr-0001-bounded-course-runtime.md)
and [delivery design](docs/design/complete-course-runtime.md). The robot language
boundary is recorded in [ADR 0003](docs/adrs/adr-0003-bounded-robot-programs.md).
