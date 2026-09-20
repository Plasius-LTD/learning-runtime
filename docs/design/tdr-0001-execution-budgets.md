# TDR 0001: Execution budgets and cancellation

The maze evaluator uses a closed typed representation and a 512-step budget.
Parsing caps all nodes at 256, sequence length at 64, nesting at 12 and calls at
16. Controls consume steps as well as visible moves. It cannot execute arbitrary
code or contact hardware. Its bounded synchronous result is suitable for a worker
or server check and includes a text-equivalent trace.

JavaScript uses QuickJS WebAssembly, already used by existing course previews.
Each session has its own runtime/context and captures JSON parsing/serialization
before learner code loads. No host capabilities are installed. Source, serialized
arguments and serialized results have fixed bounds; time, stack and memory are
bounded independently. Any evaluation failure closes the session. Consumers must
dispose a session on navigation or cancellation and additionally enforce an outer
worker deadline on both browser and server, since synchronous execution cannot observe a newly queued event
until its current bounded call returns.

Scoring and activity proofs remain outside this package. A host must run protected
checks against the saved source, never accept a learner-supplied runtime result as
authority. Timings and failures may enter fixed aggregate buckets, while source,
arguments, outputs and identifiers must not enter logs or metrics.
