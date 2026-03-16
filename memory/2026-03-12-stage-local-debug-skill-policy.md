# 2026-03-12 WebAuto skill policy update: 环节隔离 + 状态机优先 + 锚点优先

Tags: webauto, skill, policy, stage-local, state-machine, anchors, testing-ladder, agents, xhs-detail-comments-likes

## 用户新增规则
1. 调试某个爬取环节时，只修改当前环节，不触碰前置环节。
2. 当前环节 debug 流程：
   - 先梳理本环节全局状态机；不清楚先查 memory/memsearch。
   - 在 AGENTS.md 维护当前环节状态机文档路径指向。
   - 每轮测试后判断是锚点漏洞还是状态机问题。
   - 默认先修锚点，再评估状态机。
   - 若需改状态机：新增新图，不覆盖旧图；记录 memory；按新图 review + 修复 + 验证。
   - 用户审批后再切换状态机唯一真源，旧图再归档/删除。
3. 每次测试必须明确：测试目标、状态机完善点、最小测试；基础功能稳定后再做压力测试。

## 本次落地
- AGENTS.md 新增“14. 爬取任务环节化调试规则（强制）”。
- AGENTS.md 参考索引新增状态机文档路径。
- 新增状态机文档：
  - `docs/arch/state-machines/xhs-detail-comments-likes.v2026-03-12.md`
- 更新本地 skill：
  - `/Users/fanzhang/.codex/skills/webauto-debug-workflow/SKILL.md`
  - `/Users/fanzhang/.codex/skills/webauto-debug-workflow/references/webauto-debug-reference.md`

## 验证
- 执行 UI CLI 最小链路：
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
- 结果：全部 `ok=true`
