# ADR 0004: Parse web projects into a closed preview representation

Status: Accepted for implementation. Date: 2026-09-26. Task: #1.

## Context

The three complete web courses need editable HTML, CSS and JavaScript. The old
previews interpret a few settings and cannot support the requested complete
projects. Executing learner JavaScript in the page or inserting arbitrary markup
would expose host capabilities and make preview and server assessment disagree.
Existing Plasius course contracts and execution are reused; the reviewed packages
do not provide this bounded markup/style projection facility.

## Decision

Add a lazy `/web` runtime entry point for parsing HTML fragments and CSS into a
closed, bounded representation. Reuse maintained `parse5` for HTML parsing and
`css-tree` for CSS parsing instead of writing an HTML/CSS parser. These parsers
have no network or browser effects. JavaScript continues to execute in the existing
isolated worker through `initialState`, `update` and `view` functions. This package
never creates a DOM, frame, listener or UI component.

HTML supports documented semantic sections, text, lists, tables, forms and native
controls. Reject scripts, executable/event attributes, URLs, embeds, custom
elements, SVG/MathML, style tags, metadata/navigation and unknown elements or
attributes rather than silently interpreting them. IDs and control names are
bounded identifiers. Input types are limited to the documented text/number/range/
checkbox choices. All returned text remains data, not executable HTML.

Explicit `data-*` bindings describe state projection: text, value, checked,
disabled, pressed, accessible label and conditional presence. `data-repeat`
projects a bounded array of identified records; static IDs within a repeated
subtree are rejected to avoid duplicate document identities. Bindings read only
own JSON fields through bounded paths, never expressions or prototype properties.
`data-action` on buttons/forms names a bounded reducer action and optional
`data-id` binds its item identity. Named controls produce the fixed field action;
the host supplies their bounded string/boolean values, not arbitrary event objects.
The concrete accepted representation and limits are exported and tested before
course contracts depend on them.

CSS supports an allowlist of layout, typography, colour and box properties plus
bounded responsive/reduced-motion/colour-scheme media rules. Reject URLs, imports,
font loading, unsupported at-rules and raw/unparsed nodes. Do not use regex as a
replacement for CSS parsing. Cap source, syntax nodes, nesting and numeric values;
generated output remains subject to an independent size bound.

The host will render only the validated tree, using element/text/attribute APIs,
inside a preview isolated from the studio page. It must prohibit script execution,
navigation, forms leaving the preview and all network/resource loads, with a
restrictive sandbox and CSP. Approved CSS is installed through textContent, never
concatenated into HTML. Native events are translated to documented reducer inputs
and state is reprojected after the worker returns. Preserve focus and field input
across renders, provide useful parse/runtime errors and keep the outer editor and
account controls accessible even when the learner's layout is poor. The host
cannot treat parser success as an accessibility or gameplay assessment pass.

## Limits and verification

The implementation must bound HTML/CSS source, token/node count, nesting, expanded
repeat output and serialized output independently, and honour cancellation. Host
workers provide a hard lifetime deadline, as for JavaScript. Tests cover supported
semantic forms, bindings and CSS, hostile/inert-looking markup, encoded forbidden
features, malformed inputs, prototype paths, repeat growth, cancellation and
ESM/CommonJS packaging. Protected module assessments remain outside the package.

No credentials, account data, real device access, storage or network facilities
are introduced. Source and outputs must never enter logs. Rollout inherits
`learning.junior-coder.workspace.enabled` and the host's default-disabled
`learning.junior-coder.courses-v2.enabled`. Approved package CI/CD and verified
registry publication precede host consumption. Parsing foundations alone do not
complete a course or permit a host rollout.
