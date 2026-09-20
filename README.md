# @plasius/learning-runtime

Bounded project execution and deterministic simulation for learning course hosts.
This package is under development; no released runtime is available yet.

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
