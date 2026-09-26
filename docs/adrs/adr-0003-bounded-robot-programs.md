# ADR 0003: Execute a documented C++ simulator subset

Status: Accepted for implementation. Task #1, site Story #2236, Feature #1704.
Inherited host flag: `learning.junior-coder.workspace.enabled`.

The original robot previews accepted a few fixed call statements and retained only
their final settings. Complete courses need persistent variables, branches,
reusable routines, fresh sensor observations and non-blocking elapsed-time logic.
Keep their C++ teaching direction with an explicitly documented simulator subset.
Do not claim full C++, Arduino compilation, physical-device execution or hardware
compatibility. A simulator result grants no physical-hardware permission.

Parse the closed language into an AST; never evaluate source with host JavaScript,
invoke a compiler, load modules or expose host callbacks. Support primitive typed
variables, assignments, arithmetic/logic, if/else, bounded for/while execution,
functions, return, break and continue. Require `void loop()` and allow a one-time
`void setup()`. Persistent globals belong only to one session. Each tick receives
validated simulated milliseconds and primitive sensors. Built-ins read those
values; declared output signatures produce bounded structured commands for the
host to validate against the course's safe simulation ranges.

Bound source, tokens, parse depth, variables, runtime steps, call depth, strings,
numbers, sensor count and outputs. Failed or cancelled execution closes the session
and discards the tick's command buffer. No retry loop, real clock, networking,
filesystem, camera, serial or motor capability is exposed. The browser worker and
server assessor use the same released implementation. Hosts still own scenarios,
range validation, telemetry, safety-stop semantics and all assessment authority.

Tests cover cumulative source logic, per-session isolation, fresh input, type
errors, malformed syntax, recursion/loop bounds, hostile property access, output
limits, cancellation, restart by new session and failure disposal. Full course
integration and accessibility remain separate required acceptance gates.
