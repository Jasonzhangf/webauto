# WebAuto v3 Plan

Status: implementation

## Phase 0: freeze and migration map

Deliverables:

- this goal;
- architecture and event contracts;
- Weibo migration matrix;
- JSONL event-store decision.

Exit: old commands, old data paths, and replacement boundaries are explicit.

## Phase 1: event store

Deliverables:

- append-only JSONL event log;
- monotonic per-run `seq`;
- idempotent terminal-operation projection;
- replay from the log only.

Exit: append/replay tests pass without browser access.

## Phase 2: page runtime

Deliverables:

- observation capture;
- page DAG node contracts;
- pre/post anchor checks;

Exit: a fixture page DAG can complete and unknown guards fail explicitly.

## Phase 3: workflow runtime

Deliverables:

- page binding;
- serial detail batch execution;
- artifact generation and validation;

Exit: list -> post detail -> comments is replayable from events.

## Phase 4: Weibo migration

Deliverables:

- search, timeline, user profile, detail/comments, video;
- producer, consumer, watch, special-follow;
- compatibility entries in `bin/webauto.mjs`;
- old control runners retired.

Exit: existing command names run the v3 implementation and write the same
business artifact families.

## Phase 5: verification and merge

Deliverables:

- unit/integration tests;
- focused syntax/build checks;
- migration matrix evidence;
- independent review.

Exit: candidate review PASS, local merge to `main`, clean main, and runtime
entry recheck.
