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
and [delivery design](docs/design/complete-course-runtime.md).
