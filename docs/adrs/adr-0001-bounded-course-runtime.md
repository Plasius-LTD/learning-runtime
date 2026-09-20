# ADR 0001: Share bounded execution between course hosts

Status: Accepted. Date: 2026-09-20. Task: #1.

The preview and assessor must agree about program behaviour. Infrastructure-neutral
learning contracts cannot own execution, and the existing reference-course packages
are specific to their games. This package therefore owns reusable bounded execution
and deterministic simulation, with no HTTP, account, storage, UI or hardware access.

Typed visual programs are parsed into a closed instruction set, bounded by input
size, nesting, actions, routine count and call depth. Scenarios are validated and
cloned. JavaScript execution will use the existing QuickJS engine in fresh isolated
sessions with memory, stack, source, input, output and time budgets. Consumers keep
browser execution inside a cancellable worker with a hard lifetime deadline.

All returned data remains untrusted and must be rendered as structured text/shapes,
never executable markup. Public runtime results are not assessment authority.
Protected scenarios and solutions remain host-owned; the account service binds
verified results to the immutable module version and source digest.

New runtimes ship through the approved GitHub release workflow only. Both consumers
adopt the same verified version. There is no global learner state and no source
logging. Tests cover valid and invalid programs, deterministic replay, bounded
failure, cancellation and resource cleanup. Contracts and old module versions remain
unchanged when new courses are introduced.
