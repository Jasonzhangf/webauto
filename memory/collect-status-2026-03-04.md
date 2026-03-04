# Collect Status 2026-03-04

## Summary
- collect loop currently exits early after 1 note even when max-notes=5.
- detail state is inconsistent: URL shows /explore but detail containers are absent, and search containers remain visible.
- isDetailVisible selector set was too narrow; expanded to include detail-related elements for container-based state.
- collect uses mergeLinksJsonl and state.preCollectedNoteIds; links are saved to ~/.camo/download/xiaohongshu/debug/<keyword>/links.collected.jsonl.

## Key Evidence
- runId: 3ed19179-ea70-4748-886d-648eb302282c
- linksPath: ~/.camo/download/xiaohongshu/debug/油价或涨超70%/links.collected.jsonl
- collected count: 1 (expected 5)

## Known Issues
- state detection currently waits for detail via isDetailVisible but page can show /explore URL without detail containers.
- collect loop must not exit on missing container; should continue loop and retry.

## User Requirements
- Use existing jsonl persistence + dedup logic; no reimplementation.
- Enter/exit wait max 5s; stop waiting as soon as anchor appears.
- 상태判定必须基于容器锚点，不允许 URL 判断。
- If error occurs, do not exit loop.

