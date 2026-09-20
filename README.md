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

All project/state data stays in the caller's process and must be handled as
private learner content. Runtime errors contain fixed codes, never learner text.

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

See [the runtime boundary decision](docs/adrs/adr-0001-bounded-course-runtime.md)
and [delivery design](docs/design/complete-course-runtime.md).
