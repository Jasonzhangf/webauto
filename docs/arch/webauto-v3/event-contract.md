# WebAuto v3 Event Contract

## Envelope

Every JSONL row is one event:

```json
{
  "event_id": "evt_...",
  "run_id": "run_...",
  "seq": 1,
  "type": "ObservationCaptured",
  "source": "observer",
  "page_revision": "rev_...",
  "container_id": null,
  "node_id": null,
  "operation_id": null,
  "causation_id": null,
  "correlation_id": null,
  "workflow_run_id": null,
  "workflow_node_id": null,
  "binding_id": null,
  "invocation_id": null,
  "item_key": null,
  "idempotency_key": null,
  "payload": {},
  "timestamp": "2026-09-20T00:00:00.000Z"
}
```

`seq` is monotonic inside one `run_id`. The store owns allocation and append.

## Event families

| Family | Events |
| --- | --- |
| Observation | `ObservationCaptured` |
| Guard | `GuardVerdictIssued` |
| Operation | `OperationRequested`, `OperationAdmitted`, `OperationSucceeded`, `OperationFailed` |
| Page DAG | `PageNodeEntered`, `PageNodeCompleted`, `PageNodeFailed` |
| Risk | `RiskControlDetected` |
| Artifact | `ArtifactProduced`, `ArtifactValidated` |

## Terminal operation idempotency

The event store indexes:

```text
idempotency_key -> terminal status
```

Terminal statuses are `succeeded` and `failed`. `unknown` is not terminal
until a later observation event resolves it.

## Artifact validation

`ArtifactProduced` carries:

- `artifact_id`;
- `artifact_generation`;
- `content_digest`;
- `artifact_type`;
- `producer_operation_id`.

`ArtifactValidated` carries the same immutable version identity plus
`validation_spec_id`, `result`, counts, missing fields, and `evidence_ref`.
