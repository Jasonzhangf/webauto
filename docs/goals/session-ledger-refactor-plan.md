# Session Ledger Refactor Plan

## 1. Objective And Acceptance

### Objective
Refactor fin session persistence so ledger is the only durable fact source. Session state, visible history, snapshots, knowledge, tool events, provider events, and audit data must all be represented as timeline-ordered ledger tracks. Legacy session files may remain only as compatibility projections generated from ledger.

### Acceptance Criteria
- One ledger root exists per logical ledger path, with one monotonic timeline index and multiple track files.
- Every session turn is written to `session.detail` and, when visible, summarized into `session.snapshot`.
- Tool calls, provider events, step events, turns, control events, and runtime events are stored as independent ledger tracks and linked by refs.
- Knowledge entries are stored in a dedicated `knowledge` track and must reference existing evidence records.
- Legacy session outputs are rebuilt from ledger projections, not maintained as an independent source of truth.
- Local CLI supports query, check, snapshot rebuild, and knowledge add/list operations.
- Full lifecycle tests cover create, append, query, rebuild, close, reconnect, recovery, execution errors, malformed records, and two local agent instances.

## 2. Scope And Boundaries

### In Scope
- Ledger contract types and validation rules.
- Runtime ledger store and append/query APIs.
- Session materializer integration.
- Knowledge track ingestion from summaries, learnings, and control blocks.
- Local query/rebuild/check CLI.
- Compatibility projection for old session readers.
- Unit, integration, fault-injection, and local two-instance tests.

### Out Of Scope
- UI-specific state inference. UI/Web/Android/QQBot consume runtime events and projections only.
- Making subagent-local tracks globally visible. A single agent's spawned subagents remain local to that agent unless represented by parent-visible result refs.
- Remote database dependency. The first implementation must work locally with filesystem-backed ledger.
- Silent fallback to old session storage. Old files are projections only.

## 3. Core Design Principles

1. Ledger is the unique fact source: no session state can be authored outside ledger.
2. Timeline is canonical ordering: each record receives a monotonic `seq` and timestamp in `timeline/index.jsonl`.
3. Tracks are typed views over facts: tracks separate concerns but do not create independent truth.
4. Session is a ledger subset: detail and snapshot are tracks within ledger.
5. Snapshot is derived and auditable: every snapshot record points to causative detail/tool/provider/control refs.
6. Knowledge is evidence-bound: every knowledge entry must reference existing ledger evidence.
7. No fallback: if ledger append/projection/check fails, expose a structured error and fix ledger truth.
8. Local tools are authoritative for inspection: `fin ledger ...` must replace ad-hoc file spelunking.

## 4. Ledger Layout

```text
<runtime_home>/ledgers/<ledger_id>/
  identity.json
  timeline/
    index.jsonl
  tracks/
    session.detail.jsonl
    session.snapshot.jsonl
    events.jsonl
    turns.jsonl
    steps.jsonl
    tools.jsonl
    provider.jsonl
    control.jsonl
    knowledge.jsonl
  projections/
    conversation/messages.json
    snapshots/current_session.json
    recent.json
    latest.json
  locks/
    append.lock
```

### Ledger Identity
- `ledger_id`: stable logical id.
- `ledger_kind`: `system_agent`, `project_agent`, `session`, or `project`.
- `owner_agent_id`: durable owner identity.
- `project_id`: nullable.
- `created_at` and schema version.

### Timeline Index Record
Every appended track record must have a corresponding timeline record:

```json
{
  "seq": 42,
  "record_ref": "ledger://<ledger_id>/tracks/session.detail#<record_id>",
  "track": "session.detail",
  "entity": { "session_id": "...", "turn_id": "...", "task_id": null },
  "created_at": "2026-05-23T12:00:00Z"
}
```

Ordering rule: `seq` is the only canonical order. Timestamps are audit metadata and are not ordering truth.

## 5. Track Contract

### `session.detail`
Full append-only turn detail:
- user input payload refs.
- assistant output refs.
- tool call refs.
- provider response refs.
- reasoning/control refs when allowed by policy.
- visibility: `visible`, `hidden`, or `internal`.

### `session.snapshot`
Compact user-facing and replay-friendly track:
- user-visible input summary.
- important tool/result refs.
- assistant summary.
- caused-by refs to detail/tool/provider/control records.
- hidden turns must not create visible snapshot entries.

### `events`
Runtime event stream:
- lifecycle events.
- task/agent state changes.
- listener connect/disconnect/reconnect events.
- projection rebuild events.

### `turns`
Turn boundary records:
- turn started.
- model response started/completed.
- turn completed/failed/cancelled.

### `steps`
Agent execution step records:
- planning step.
- tool step.
- review step.
- wait step.
- retry/error step with explicit reason.

### `tools`
Tool invocation and result records:
- request metadata and semantic payload refs.
- result refs.
- error shape and retry policy if any.
- payload must not be semantically cropped.

### `provider`
Provider request/response audit records:
- provider id/model.
- request refs.
- response refs.
- token/latency metadata.
- finish reason and structured error.

### `control`
Control-plane records:
- summary blocks.
- learning blocks.
- context compaction decisions.
- permission/auth lease changes.
- connection state changes.

### `knowledge`
Evidence-bound durable learnings:
- summary/learning content.
- scope: system/project/session.
- evidence refs.
- validity window if applicable.
- supersedes refs when replacing older knowledge.

## 6. Write Path

### Runtime Append API
Implement one append entrypoint:

```text
LedgerStore.append(track, payload, entity_refs, causality_refs) -> LedgerAppendResult
```

Required behavior:
1. Acquire ledger-scoped append lock.
2. Validate track schema and referenced records.
3. Allocate next monotonic `seq`.
4. Persist the typed track record.
5. Persist timeline index record.
6. Flush/fsync when available.
7. Release lock.
8. Emit runtime event with appended refs.

If any step fails, return a structured error. Do not silently write to old session files.

### Session Materializer Integration
The session materializer becomes a ledger writer plus projection generator:
- On turn start: append `turns` + `events`.
- On user input: append `session.detail` payload refs.
- On tool invocation/result: append `tools` and link into detail.
- On provider response: append `provider` and link into detail.
- On assistant completion: append final `session.detail`; if visible, append `session.snapshot`.
- On summary/learning/control block: append `control`; if durable, append `knowledge` with evidence refs.
- After successful ledger append: rebuild or incrementally update projections.

## 7. Read Path And Projections

### Runtime Reads
All runtime reads must use ledger query APIs:
- `query_by_session(session_id)`
- `query_by_turn(turn_id)`
- `query_by_track(track, filters)`
- `query_timeline(from_seq, to_seq)`
- `resolve_ref(record_ref)`

### Compatibility Projections
Projection files exist only for old consumers:
- `conversation/messages.json`
- `snapshots/current_session.json`
- `recent.json`
- `latest.json`

Projection rules:
- Projections are fully derivable from ledger.
- Projection drift is a check failure.
- Projection rebuild must not mutate ledger facts.
- UI/Web/Android/QQBot may read projections but cannot infer hidden agent state from them.

## 8. CLI Design

Add `fin ledger` commands:

```bash
fin ledger query --ledger <id> --track session.snapshot --json
fin ledger query --ledger <id> --from-seq 1 --to-seq 100 --json
fin ledger check --ledger <id> --strict
fin ledger snapshot rebuild --ledger <id> --session <session_id>
fin ledger knowledge add --ledger <id> --scope project --evidence-ref <ref> --text <text>
fin ledger knowledge list --ledger <id> --scope project --json
```

Command requirements:
- All commands return structured JSON when `--json` is set.
- `check --strict` fails non-zero for missing refs, duplicate seq, projection drift, malformed JSONL, and schema mismatch.
- `snapshot rebuild` writes projections only after successful validation.
- `knowledge add` rejects entries without existing evidence refs.

## 9. Fault And Lifecycle Coverage

### Unit Tests
- Ledger identity initialization is idempotent.
- Append creates exactly one track record and one timeline record.
- Seq is monotonic across all tracks.
- Duplicate/missing/malformed timeline records fail strict check.
- Knowledge without evidence is rejected.
- Snapshot rebuild detects missing detail-to-snapshot coverage.
- Hidden/internal turns do not produce visible snapshots.
- Projection drift is detected.

### Integration Tests
- Single visible turn writes detail, snapshot, turns, provider, and projection records.
- Multi-turn session preserves timeline ordering across tracks.
- Tool execution success is linked into detail and snapshot refs.
- Tool execution error is represented in tools/steps/turns and does not corrupt projection.
- Provider error creates provider/control/turn failure records.
- Connection unavailable records an explicit event/control error.
- Lost connection and restored connection are ordered in events/control.
- Recovery after process restart resumes from durable ledger identity and seq.

### Local Two-Instance Real Test
Run two local fin instances with separate cwd/ports and durable config:
1. Start default system agent from standard system agent path.
2. Start project agent from a separate cwd with auto-selected persisted port.
3. System agent queries configured project agents.
4. System agent sends a task to project agent over authenticated connection.
5. Project agent runs a turn and writes its own ledger.
6. Project agent spawns local subagent; subagent is invisible to system except result refs.
7. Drop the connection by stopping one explicit PID/service only.
8. Verify disconnect event is written.
9. Restart that instance.
10. Verify reconnect event, mailbox recovery, and seq continuity.
11. Force a tool error and verify structured error tracks.
12. Run `fin ledger check --strict` on both ledgers.

### Error Matrix
- Cannot connect.
- Auth failure.
- Connection lost mid-task.
- Connection restored.
- Remote agent unavailable.
- Mailbox seq gap.
- Tool execution error.
- Provider execution error.
- Corrupt track JSONL.
- Missing evidence ref.
- Projection drift.
- Concurrent append contention.

## 10. Implementation Steps

1. Add ledger contract records and schema validation.
2. Add filesystem `LedgerStore` with append lock and strict checks.
3. Integrate `SessionMaterializer` write path into ledger.
4. Convert legacy session writes into projection generation.
5. Add knowledge ingestion from summary/learning/control blocks.
6. Add `fin ledger` CLI commands.
7. Add unit tests for contracts/store/checker.
8. Add integration tests for session materializer and projections.
9. Add local two-instance harness with explicit service/PID scoped shutdown only.
10. Update docs and migration notes.
11. Remove old independent session fact writers after projection parity is proven.

## 11. Migration Plan

- Phase 1: dual-read audit only, ledger writes enabled behind test/runtime flag.
- Phase 2: materializer writes ledger first and projections second.
- Phase 3: old session files become projections only; strict drift checks in CI.
- Phase 4: remove old independent writers and dead session artifacts.

No fallback is allowed in production semantics. During migration, any temporary dual path must be explicitly labeled as audit-only and removed before completion.

## 12. Verification Commands

Use the repository's actual package/crate commands after confirming project layout. Expected command classes:

```bash
cargo fmt --all
cargo test -p fin-contracts -p fin-runtime -p fin-cli
fin ledger check --ledger <system-ledger-id> --strict
fin ledger check --ledger <project-ledger-id> --strict
fin ledger snapshot rebuild --ledger <id> --session <session_id>
```

If Java/Android is not available, record the exact failure and keep Android verification out of the completion claim.

## 13. Definition Of Done

- Ledger is the only authoring path for session facts.
- Session detail/snapshot/projection are derivable from ledger.
- Knowledge is evidence-bound and queryable.
- CLI can inspect, check, rebuild, and list ledger facts locally.
- Full lifecycle and error matrix tests pass.
- Two local instances demonstrate connect, disconnect, reconnect, cross-agent task, local subagent invisibility, and strict ledger checks.
- Old generated sessions and dead independent session writers are removed or explicitly converted into projections.

## 14. Unique Implementation Rationale

The unique correct modification point is the runtime session materializer plus ledger store because it is the only layer that observes complete turn boundaries, tool/provider events, control blocks, and projection generation. Implementing this in UI, Web, Android, QQBot, or provider-specific clients would duplicate truth, miss hidden/control turns, and make reconnection/recovery/audit impossible. The ledger store owns ordering and durability; the materializer owns semantic session assembly; projections are downstream compatibility artifacts only.
