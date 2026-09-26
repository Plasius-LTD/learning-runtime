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

### Web project templates

`@plasius/learning-runtime/web` supplies `createWebProject({ html, css }, { signal })`.
It parses a documented HTML/CSS subset without creating DOM nodes, executing
JavaScript or loading resources. Call `project.render(view)` with bounded JSON
returned from the separately isolated learner `view` function. The result contains
inert `nodes` and approved `css`; `project.template` returns a detached structural
snapshot. Dispose on navigation/cancellation. Invalid view data may be corrected
and rendered again; cancellation closes the project permanently.

Use semantic sections, headings, text, lists, tables, forms and native controls.
Scripts, metadata, URLs, embeds, SVG/MathML, custom elements, event attributes and
inline styles are rejected, including unsupported tokens an HTML parser would
otherwise discard. The parser uses HTML's own tokenization and tree construction;
it does not implement an approximate HTML regex parser.

Bindings read own JSON fields through paths such as `draft.title`, at most four
segments; expressions, array indexing and prototype paths are unsupported:

| Attribute | Meaning |
| --- | --- |
| `data-text` | Replace children with a scalar text value. |
| `data-value` | Project a control, output, progress or meter value. |
| `data-checked`, `data-disabled`, `data-pressed` | Project boolean checked/disabled/ARIA-pressed state. |
| `data-label` | Project a nonempty accessible label. |
| `data-if` | Include the element only when the bound boolean is true. |
| `data-repeat` | Repeat this element for up to 50 records with unique string `id` values; descendant bindings read that record. |
| `data-action` | Emit action metadata for a form or a `type="button"` button. |
| `data-id` | Bind an optional action item ID. |

Static element IDs are forbidden within repeat subtrees. Named text, number,
range, checkbox, textarea and select controls expose `field` metadata. Hosts
translate changes to `{ type: "field", name, value }`, with bounded strings or
checkbox booleans; action controls produce `{ type, id? }`. No event object,
DOM reference, callback or implicit JavaScript expression reaches learner code.
Forms use their own submit action; their submit buttons have no separate action.

Styles use a bounded allowlist of layout, typography, colour, box and focus
properties. Custom properties are parsed and checked too. Supported media rules
are min/max width, reduced motion and colour scheme. URLs, imports, font loading,
unparsed values, `!important`, fixed positioning, pseudo-elements and unsupported
functions/selectors are rejected. Attribute selectors are limited to exact native
input-type and boolean ARIA-pressed/expanded comparisons. Transition durations are
at most two seconds; explicit grid repetitions are at most twelve.

Budgets: HTML 24,000 characters; CSS 16,000; 256 template nodes at depth 20;
16 attributes per element, each at most 240 characters; CSS 2,048 syntax nodes
at depth 16; 768 projected nodes; serialized projection at most 64,000 characters.
Bound control values are at most 2,000 characters and accessible labels 240.
JSON views reuse the existing transport's node/depth/value limits and reject
accessors without invoking them. Errors contain fixed codes, never source text.

The host must run compilation/projection in its disposable worker and render only
this closed representation using element, text and known attribute/property APIs.
Never concatenate it into executable HTML. Isolate the preview with a restrictive
sandbox and CSP prohibiting scripts, resource loads, navigation and outgoing forms;
install approved CSS with `textContent`. Preserve focus and native field input,
validate translated actions, expose useful failure feedback and keep editor/account
controls outside the preview. Parser success is neither an accessibility pass nor
course assessment evidence. See [ADR 0004](docs/adrs/adr-0004-bounded-web-projects.md).

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
