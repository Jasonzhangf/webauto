# 2026-03-09 Detail Note Binding

[Time/Date]: utc=`2026-03-09T07:17:51.581Z` local=`2026-03-09 15:17:51.581 +08:00` tz=`Asia/Shanghai` nowMs=`1773040671581` ntpOffsetMs=`0`

- Multi-tab XHS detail flow must bind browser behavior, runtime state, WS progress, and output artifacts by `noteId`, not by tab alone.
- Correct model: `tab/slot` is only the browser container; business identity is `noteId`; effective runtime binding is `slot/tab + noteId`.
- Failure pattern observed in run `3f04bcf0-881a-4204-ad67-17ab08dd5aa4`: tab pool and tab switch both executed, but `comments_harvest` reused previous note context and kept operating against note `698de0c8000000001a01e38d` after opening note `6997df4d00000000150207fd`.
- Required gate: before comment focus, scroll, like, and artifact flush, verify `current page noteId == expected bound noteId`; on mismatch, skip/recover instead of reusing stale state.
- Implementation direction: resolve expected binding from `detailLinkState.activeByTab[slot]` and `linksState.byTab[slot]`, and only fall back to global `state.currentNoteId/currentHref` in single-tab mode.

Tags: xhs, detail, noteid, multi-tab, binding, state-machine, likes, comments
