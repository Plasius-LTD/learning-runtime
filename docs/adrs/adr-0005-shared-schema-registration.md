# ADR 0005: Shared Schema package registration

Status: Accepted for implementation; publication and OIDC verification remain open.
Date: 2026-11-24. Package Task #14, site Story #2547 and Feature #1597.

Adopt the shared Schema registration workflow, helper and tests using the standard
`NPM_TOKEN` name. Only the reviewed descriptor differs by repository. This replaces
any earlier package-specific credential route while preserving its admission,
immutable artifact, exact-main CI, provenance and production requirements.

The first version is 0.1.2; the release pipeline owns version and changelog
promotion. Registration is explicit and default-off. Normal releases use OIDC
without a credential fallback. Retire enrollment after registry verification and
validate the trusted publisher with an ordinary release before its first-use
window expires. Existing source-delivery ownership and security gates remain.

See [the delivery design](../design/shared-first-registration.md) for admission,
operator setup, cleanup and requirements-derived validation.
