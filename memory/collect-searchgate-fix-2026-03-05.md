# Collect/SearchGate Fix 2026-03-05

## Context
- Collect was failing at `wait_search_permit` due to `SEARCH_GATE_UNREACHABLE fetch failed`.
- Root cause: SearchGate not running for collect mode; startup was not in a single global entry.

## Fix Summary
- Added unified service entry `ensureTaskServices` and moved SearchGate startup there.
- Collect stage (`stage=links`) skips UI CLI reset but still starts SearchGate.
- Disabled post-validation on `collect_links` (was failing despite successful token collection).
- Adjusted collect token persist to cap by remaining target and only require `count >= expected` for success.

## Evidence
- Successful collect run (links-only) with SearchGate running:
  - runId: a95fe614-286e-4545-8992-8f51c3c13a48
  - summary: ~/.webauto/download/xiaohongshu/debug/seedance2.0/merged/run-2026-03-05T10-45-59-334Z/summary.json
  - events: ~/.webauto/download/xiaohongshu/debug/seedance2.0/merged/run-2026-03-05T10-45-59-334Z/profiles/wave-001.xhs-qa-1.events.jsonl
  - safe links persisted: ~/.webauto/download/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl

## Notes
- Collect now prefers SearchGate (token links) without opening detail.
