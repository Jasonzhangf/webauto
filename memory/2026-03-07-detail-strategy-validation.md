# 2026-03-07 detail strategy validation

Goal:
- compare two manual detail strategies and keep the one that is actually usable

Strategy 1:
- click comment entry
- click comment scroll container
- scroll comment container

Evidence page:
- `6997df4d00000000150207fd`
- before: `scrollTop=0`
- after comment entry: `scrollTop=498`
- after container scroll #1: `scrollTop=3297.5`
- after container scroll #2: `scrollTop=3993`
- image viewer: always `false`
- href unchanged

Conclusion for strategy 1:
- usable
- safe in current validation
- can move comment container after entry + container focus

Strategy 2:
- if comments invisible, click body/content and scroll until comments appear
- then scroll comment container

Validated samples:
- `69a46962000000000e03db94`
- `698def79000000000b008360`

Observed state on both:
- comments already visible at load
- no need to scroll body/content to discover comments
- direct container focus + scroll worked
- after two scrolls, `scrollTop` moved from `0 -> 102`
- image viewer stayed `false`

Conclusion for strategy 2:
- not needed in current live samples
- keep only as fallback idea when a future page truly hides comments below long content

Decision:
- choose strategy 1 as the primary detail orchestration path
- orchestration rule stays: if comments are already visible, skip redundant entry/total clicks and focus the scroll container directly
- only introduce strategy 2 when a real sample proves comments are initially not visible
