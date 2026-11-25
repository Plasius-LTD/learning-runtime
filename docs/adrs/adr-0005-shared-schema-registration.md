# ADR 0005: Shared Schema package registration

Status: Accepted; initial registration verified, ordinary OIDC handover validation remains required.
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

On 25 November 2026, production CD 45588040661 published version 0.1.2 from
`9d0fbe21e59184bb93f30f8cf03966cb7ddab73e`. Registry integrity, provenance,
signatures and every CJS/ESM public entry point passed verification. Retire the
enrollment descriptor while preserving the shared registration step and helper;
ordinary OIDC publication must validate the trusted-publisher binding before this
Task can close. A regression against the actual checkout prevents accidental
enrollment restoration.
