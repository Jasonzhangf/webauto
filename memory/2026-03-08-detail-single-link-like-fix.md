# 2026-03-08 Detail Single-Link Like Fix

Tags: xhs, detail, comments, likes, visible-scope, safe-detail-urls, deepseek

## Context
- Validation source remained the preserved safe links file only:
  `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Validation profile: `xhs-qa-1`
- Validation stayed on a single live detail note instead of unified search flow.

## Problem
- `comments_harvest` could already scroll and persist comments, but like clicks failed on live detail pages.
- Root cause was `readLikeTargetByIndex()` indexing against the full document comment list instead of the currently scoped comment container / visible comment set.
- Evidence before fix: top comments returned negative `rect.top` values and `reason=comment_node_out_of_scope` / `like_target_missing` even while visible comments existed lower in the current comment viewport.

## Fix
- File: `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
- `readLikeTargetByIndex()` now:
  - resolves the active detail root
  - resolves the current visible comment scroll container
  - indexes only within that container
  - verifies both the comment node and like target are in current viewport + current container scope
  - returns scoped failure reasons (`comment_node_out_of_scope`, `like_target_out_of_scope`) instead of false positive global hits

## Additional Fix
- File: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- `executeDetailHarvestOperation()` now writes `content.md` through existing `writeContentMarkdown()` so single-link detail validation persists content, author, body, and images as part of the normal detail stage.

## Validation Evidence
- Syntax/tests:
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `node --test tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-visible-like-inline.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/camo-env.test.mjs`
- Live single-link validation on note `699e8712000000001a033e9f`:
  - detail URL: `https://www.xiaohongshu.com/explore/699e8712000000001a033e9f?...`
  - comments persisted: `~/.webauto/download/xiaohongshu/debug/deepseek/699e8712000000001a033e9f/comments.jsonl`
  - comments markdown: `~/.webauto/download/xiaohongshu/debug/deepseek/699e8712000000001a033e9f/comments.md`
  - content markdown: `~/.webauto/download/xiaohongshu/debug/deepseek/699e8712000000001a033e9f/content.md`
  - like summary: `~/.webauto/download/xiaohongshu/debug/deepseek/699e8712000000001a033e9f/likes.summary.json`
  - like state log: `~/.webauto/download/xiaohongshu/debug/deepseek/.like-state.jsonl`
- Observed live result after fix:
  - `hitCount=2`
  - `likedCount=2`
  - liked visible comment indexes: `[14, 19]`
  - matched comment ids persisted into summary/state rows

## Notes
- Current single-link validation proves: detail content persistence works, comment persistence works, and visible-comment like targeting now works on live deepseek safe links.
- Next expansion should be 1-link -> 5-link -> 100-link progression, still using preserved safe-detail links and respecting pacing / risk controls.
