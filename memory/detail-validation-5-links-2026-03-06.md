# Detail 5-link validation against deepseek safe links (2026-03-06)

## Goal
Validate whether detail-only execution can correctly consume collected safe links and complete the first 5 notes before scaling toward 200 notes.

## Input
- profile: `xhs-qa-1`
- safe links: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- command:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 5 --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1`

## Evidence
### Run 1
- runId: `54db0fcc-28f4-4725-a70c-fd49433685f3`
- summary: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T10-59-08-307Z/summary.json`
- events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T10-59-08-307Z/profiles/wave-001.xhs-qa-1.events.jsonl`

### Run 2
- runId: `f82139b1-387b-4afe-980a-5842152850ad`
- summary: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T11-11-39-138Z/summary.json`
- events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T11-11-39-138Z/profiles/wave-001.xhs-qa-1.events.jsonl`

## Findings
1. Detail links do not advance correctly in single-tab detail-open-by-links mode.
- `open_first_detail` opens note `698de0c8000000001a01e38d`.
- Subsequent `open_next_detail` events keep reopening the same note id instead of moving to link 2/3/4/5.
- The run still ends with `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`, so the current done logic counts repeated opens rather than confirmed unique link progression.

2. Comment harvesting fails immediately.
- Evidence in run 2 events:
  - `comments_harvest`
  - `COMMENTS_SCROLL_CONTAINER_MISSING`
  - `comment scroll container missing before scroll`
- Because of that, `commentsHarvestRuns = 0`, `commentsCollected = 0`, and no comment artifact paths are produced.

3. Detail payload is partially inconsistent.
- `detail_harvest` returns content/author/image data, but `collectability.detailContextAvailable` is still `false` inside the payload while `detailVisible` had already been confirmed.
- This suggests detail-context detection is not aligned with the actual modal-visible state.

4. Output is not yet sufficient for 200-link promotion.
- Latest summary shows:
  - `assignedNotes = 5`
  - `openedNotes = 5`
  - `commentsCollected = 0`
  - `commentPaths = []`
  - `terminalCode = AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- This is a false-positive completion for the 5-link validation goal.

## Conclusion
Current detail-only pipeline is not ready to validate 200 collected links.
Blocking defects:
- safe-link advancement is broken (reopens same first note)
- comment scroll container resolution fails before harvesting starts
- detail collectability signal is inconsistent with visible modal state
