# WebAuto v3 Goal

Status: implementation

## Objective

Replace the current Weibo collection control paths with one event-driven
runtime under `modules/webauto-v3/` and `apps/webauto/weibo-v3/`.

The runtime owns four separate truths:

| Truth | Owner |
| --- | --- |
| Browser facts | Camo adapter |
| Control facts | append-only JSONL event store |
| Business artifacts | Weibo artifact files and event references |

## User-visible compatibility

Existing Weibo command names stay available:

- `webauto weibo collect`
- `webauto weibo detail`
- `webauto weibo unified`
- `webauto weibo video`
- `weibo-timeline`, `weibo-watch`, `weibo-user-profile`
- `weibo-producer`, `weibo-consumer`, `weibo-special-follow-monitor`

The commands are thin entries into the v3 runtime. Legacy runners do not
remain as a parallel control path.

## Non-goals

- Do not delete historical Weibo artifacts or user data.
- Do not change the Weibo task semantics during migration.
- Do not add SQLite in the first implementation; control events use JSONL.
- Do not silently fall back to another model, mock backend, or legacy runner.

## Acceptance evidence

1. Event append/replay is deterministic and does not execute terminal
   operations twice.
2. Page DAG nodes have pre/post anchors and emit typed events.
3. Guard verdicts use one union:
   `allow | deny | unknown | risk_control | unavailable`.
4. Existing Weibo CLI commands resolve to the v3 runtime.
5. Unit, integration, syntax, and focused build checks pass.
6. An independent review has no blocking findings before merge.
