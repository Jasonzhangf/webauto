# 2026-03-07 detail manual scroll revalidation

Target page:
- profile: `xhs-qa-1`
- url: `https://www.xiaohongshu.com/explore/698de0c8000000001a01e38d?...`

Manual validation results:
- detail is visible
- comments are already visible
- comment total is visible
- image viewer is not open

Anchors resolved from visible rects:
- comment total center: `2533,510`
- visible comment center: `2529,586`
- comment scroll container center: `2529,438`

Rule confirmed:
- when comments are already visible, do not re-click comment entry or comment total
- focus only the scroll container

Primitive validation:
1. `clickPoint(.note-scroller center)`
- no image viewer opened
- `scrollTop` remained `0`

2. `pressKey(PageDown)` twice after scroll-container focus
- `scrollTop` changed `0 -> 1590`

3. `scrollBySelector('.note-scroller', down, 420)` twice
- `scrollTop` changed `1590 -> 3956 -> 6162.5`
- still no image viewer opened
- href stayed on the same detail page

Conclusion:
- the safe detail path is now: if visible comments exist, skip entry/total clicks and go directly to container-focused scroll
- the next code path to keep tightening is the single `scrollBySelector()` implementation and the comments harvest orchestration that calls it
