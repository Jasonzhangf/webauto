# WebAuto v3 Architecture

## Runtime flow

```text
Observation
  -> anchor / risk guard
  -> control event
  -> operation
  -> browser result
  -> post observation
  -> page DAG
  -> Weibo workflow
```

## Ownership

- `modules/webauto-v3/event-store`: control truth.
- `modules/webauto-v3/container`: observation revision projection.
- `modules/webauto-v3/page-dag`: single-page bounded execution.
- `modules/webauto-v3/camo-adapter`: the only browser boundary.
- `apps/webauto/weibo-v3`: Weibo page DAGs, workflows, extractors, artifact
  persistence, and CLI.

## Control rules

1. Events are append-only JSONL. Logs may reference events but never replace
   them.
2. Every operation has an idempotency key. Replaying a terminal operation does
   not execute the browser side effect again.
3. `unknown` is not `allow`. A missing policy or missing guard capability
   returns `unknown` or `unavailable`.
4. Page DAGs stay acyclic. Workflow loops are bounded.
5. Artifact payloads are not copied into control events. Control events carry
   immutable generation/digest references.
6. No silent fallback and no parallel legacy control path.

## Guard union

```text
GuardResult
  verdict: allow | deny | unknown | risk_control | unavailable
  guard_id
  guard_version
  subject_ref
  evidence_ref
  diagnostics
  reason_code
```

Score, probabilities, and model output live only in `diagnostics`.
