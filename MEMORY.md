# Project Memory

- 2026-03-06: Camo protocol-level click/wheel/keydown reach the page, but historical mouse wheel anchoring had a coordinate-space bug. Wheel anchoring fixes belong in `camo`; `webauto` detail orchestration should rely on container-anchored scrolling only after camo-level validation. Tags: camo, wheel, anchor, detail, xhs
- 2026-03-09: Safe-link XHS detail flow must not use raw `detail_modal.exist` as the sole scheduling source for `detail_harvest -> warmup_comments_context -> comments_harvest -> close_detail` in `detailOpenByLinks` mode. In safe-link mode this chain must be serialized through manual dependency scheduling, with `detail_modal` only as a visibility condition. Runtime `oncePerAppear` accounting must also understand manual ops that are cycle-bound by subscription conditions, otherwise the same modal can retrigger comment harvest on budget pause/failure. Tags: xhs, detail, safe-link, autoscript, runtime, state-machine
## 2026-03-09 Detail Loop Notes

- Safe-link detail orchestration now uses a manual dependency chain for modal-stage ops (`detail_harvest -> warmup_comments_context -> comments_harvest -> close_detail -> wait_between_notes -> open_next_detail`) so the same `detail_modal.exist` heartbeat cannot reschedule work on the same modal.
- Safe-link startup should pre-open the tab pool once, then reuse slots only; dynamic refill during detail progression is treated as a bug.
- `comments_harvest` no-progress recovery rule: only treat as stalled after comment content stays unchanged for 30s; recovery pattern is up-scroll 3-5 times, then one down-scroll, repeat up to 3 cycles before exiting the note with `scroll_stalled_after_recovery`.
- Like-stage must still enable `comment_match_gate` even when reply flow is disabled; the gate is controlled by `matchGateEnabled`, not by `stageReplyEnabled`.
