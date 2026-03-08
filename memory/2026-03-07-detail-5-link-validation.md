# 2026-03-07 detail 5-link validation

Validation set:
- first 5 links from `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`

Pass rule:
- viewer must remain closed
- and one of:
  - `scrollTop` increases
  - comments are empty
  - container is already at bottom

Observed 5-link result:
- 1 `698de0c8000000001a01e38d`: pass, `0 -> 1641`
- 2 `6997df4d00000000150207fd`: pass, `0 -> 3231`
- 3 `69a46962000000000e03db94`: pass, `0 -> 51`
- 4 `698def79000000000b008360`: initial scripted run looked like no scroll, but manual re-check showed real progress `0 -> 51 -> 102`, viewer stayed closed
- 5 `699e8712000000001a033e9f`: initial scripted run looked like no scroll, but manual re-check showed real progress `0 -> 1641 -> 3846`, viewer stayed closed

Conclusion:
- current detail comments path is usable for 5-link validation
- some notes need an extra direct container-scroll verification because first scripted sample may under-observe the final scrollTop state
- next step can proceed to larger batch validation, but should preserve the same pass criteria
