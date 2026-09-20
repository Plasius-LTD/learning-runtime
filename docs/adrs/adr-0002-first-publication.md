# ADR 0002: First publication through the existing CD workflow

Status: Accepted for implementation; operational credential setup remains required.

Parent: runtime Task #1, site Story #2236, Feature #1704.
Inherited feature flag: `learning.junior-coder.workspace.enabled` (host-owned).

npm requires an existing package before a trusted publisher can be configured.
The first tokenless release therefore failed with ENEEDAUTH after validation.
Local publication is prohibited. Keep the single approved `.github/workflows/cd.yml`
path, its `main`/`production` boundaries, exact commit CI gate, immutable attested
tarball and post-publication integrity checks. Add an explicit, default-off
`first_publication` input that only permits this package when the public registry
returns 404. Other status codes and network failures fail closed.

A temporary production-environment secret is exposed only during the opted-in
publish step. It is never passed to the build, package scripts or source imports;
publication uses `--ignore-scripts`. The temporary npm configuration contains an
environment-variable reference and is removed on exit. The operator configures
trusted publishing, revokes the token and removes the secret after creation.
Subsequent releases use OIDC. There is no automatic credential fallback after an
OIDC failure. Rollback is to leave the opt-in disabled and remove the secret;
published immutable versions are never overwritten.

References: https://docs.npmjs.com/cli/v11/commands/npm-trust/
and https://docs.npmjs.com/trusted-publishers/.
