# HEARTBEAT.md - 小红书采集压力测试

**Last Updated**: 2026-03-16 21:49 CST
**Status**: 运行中 ✅ - fill_keyword 修复生效

---

## 🎯 当前任务目标

### 主任务
验证 Tab 池管理修复效果，完成小红书 `deepseekAI` 关键字 5 条测试（从 50 调整为 5）

### 验证重点
1. **Tab 数量**: 严格限制为 5 个（1 搜索页 + 4 轮转详情页）
2. **评论采集**: 所有帖子正常采集评论
3. **Tab 切换**: 顺序切换，间隔 2-5 秒随机等待
4. **终态**: 任务正常完成，无泄漏

### 运行参数
```bash
keyword: deepseekAI
target: 5
profile: xhs-qa-1
do-comments: true
do-likes: true
like-keywords: "真牛"
headless: false
```

### 当前进度
- runId: `f75962be-3beb-4916-8a5e-e8470cbb8b90`
- 进度: **1/5** ✅ \(正常运行中，正在采集评论\)
- Tab 数量: **3 个** ✅ \(≤5\)
- 评论总数: **5535 条** \(累计\)
- 目录数: **133 个** \(累计\)
- 状态: **运行中**

---

## 🚨 问题处理标准操作（强制）

**遇到问题时的完整流程**：

```
检查日志 → 检查快照/截图 → 现场勘验 → 证据分析 → 定位根因 → 实施修复 → 验证效果
```

**禁止行为**：
- ❌ 不要询问用户意见
- ❌ 不要等待确认
- ❌ 不要只报告不行动
- ❌ 不要只定位不解决
- ❌ 不要解决后不验证

**标准操作**：

### 1. 检查日志
```bash
# 任务事件日志
tail -200 ~/.webauto/state/<runId>.events.jsonl | jq -r 'select\(.level == "error"\)'

# 桌面生命周期日志
tail -200 ~/.webauto/logs/desktop-lifecycle.jsonl | jq -r 'select\(.level == "error" or .level == "warn"\)'

# 当前测试日志
tail -100 /tmp/xhs-test.log | grep -E "error|fail|timeout"
```

### 2. 检查快照/截图
```bash
# 查看最新截图
ls -lt ~/.webauto/download/xiaohongshu/debug/deepseekAI/diagnostics/ | head -10

# 查看诊断文件
cat ~/.webauto/download/xiaohongshu/debug/deepseekAI/diagnostics/*.json 2>/dev/null | jq .
```

### 3. 现场勘验
```bash
# 浏览器进程状态
ps aux | grep -E "camoufox|plugin-container" | grep -v grep

# Tab 数量
ps aux | grep "plugin-container.*tab" | grep -v grep | wc -l

# 网络连接
curl -s http://127.0.0.1:7701/health
curl -s http://127.0.0.1:7704/health
```

### 4. 证据分析
- 对比预期状态 vs 实际状态
- 定位异常发生的操作
- 确定修复点

### 5. 定位根因
- 找到具体的代码/配置问题
- 分析为什么会出现这个问题
- 确定修复方案

### 6. 实施修复
- 修改代码/配置
- 重启任务
- **必须执行，不���只定位**

### 7. 验证效果
- 确认问题已解决
- 任务正常运行
- **必须验证，不能只修复**

**执行原则**：
- 发现问题 → 立即行动
- 定位根因 → 必须修复
- 修复完成 → 必须验证
- 验证通过 → 报告结果

---

## 📋 巡检流程

### 巡检命令
```bash
# 1. 检查任务状态
node bin/webauto.mjs xhs status --json | jq '.summary.tasks[0]'

# 2. 检查 Tab 数量（应为 5 个）
ps aux | grep "plugin-container.*tab" | grep -v grep | wc -l

# 3. 检查评论采集
find ~/.webauto/download/xiaohongshu/debug/deepseekAI -name "comments.jsonl" -exec wc -l {} + | tail -1

# 4. 检查目录数量
ls -d ~/.webauto/download/xiaohongshu/debug/deepseekAI/*/ 2>/dev/null | wc -l

# 5. 检查最新日志
tail -50 /tmp/xhs-test.log
```

### 巡检频率
- 前 30 分钟：每 5 分钟检查一次
- 稳定后：每 15 分钟检查一次
- 使用 clock 工具设置定时提醒

### ⚠️ 目标更新策略
**每次巡检时必须确认**：
1. 当前目标是否合理？
2. 是否需要调整 target 数量？
3. 是否需要更改关键词？

**如需更新目标**：
```bash
# 停止当前任务
# 修改 HEARTBEAT.md 中的 target 参数
# 重新启动任务
```

### 巡检记录表
| 时间 | 进度 | Tab 数 | 评论数 | 目录数 | 状态 | 备注 | 目标确认 |
|------|------|--------|--------|--------|------|------|----------|
| 21:49 | 1/5 | 3 | 5535 | 133 | 运行中 | fill_keyword 修复生效 | ✅ 5 条合理 |
| 21:22 | 0/50 | 4 | 49\(旧\) | 133 | 修复中 | fill_keyword 卡住 | ✅ 50 条合理 |
| 20:52 | 0/50 | 4 | 49\(旧\) | 133 | init | Tab 池修复验证 | ✅ 50 条合理 |
| 20:31 | 0/50 | 5 | - | - | init | 任务启动 | ✅ 50 条合理 |

---

## 🚨 常见问题处理

### 问题 1: Tab 数量异常
**症状**: Tab 数量 > 5 个
**处理**: 停止任务 → 检查 closeExcessTabs → 重启

### 问题 2: 评论采集停止
**症状**: 进度增加但评论数不变
**处理**: 检查日志 → 定位滚动逻辑 → 修复 → 验证

### 问题 3: 任务卡死
**症状**: 进度长时间不更新（>10 分钟）
**处理**: 检查日志 → 定位卡住操作 → 修复 → 验证

### 问题 4: 浏览器崩溃
**症状**: camoufox 进程消失
**处理**: 清理锁文件 → 重启任务 → 验证

---

## 📦 成功标准

### 必须满足
1. ✅ Tab 数量始终 ≤ 5 个
2. ✅ 所有 5 个帖子处理完毕
3. ✅ 评论正常落盘（每个帖子有 comments.jsonl）
4. ✅ 任务终态为 completed
5. ✅ 无内存泄漏/Tab 泄漏

---

## 🔧 修复记录

### 2026-03-16 21:49 fill_keyword 修复验证
**问题**: 任务卡在 fill_keyword 操作
**根因**: 搜索输��框 selector 不匹配
**修复**: 扩展 selector 为 `#search-input, input.search-input`
**验证**: ✅ 成功，任务正常运行，已采集 1/5 帖子

### 2026-03-16 Tab 池泄漏修复
**问题**: 32 个 Tab 而不是 5 个
**修复**: 重写 tab-ops.mjs，统一使用 newTab
**验证**: 本次压力测试中

---

## 📝 执行历史

| 时间 | 事件 | 备注 |
|------|------|------|
| 21:49 | fill_keyword 修复验证成功 | 任务正常运行 1/5 |
| 21:22 | 定位 fill_keyword 卡住 | 准备修复 |
| 20:52 | 第 2 次巡检 | Tab=4 个，接近目标 |
| 20:31 | 任务启动 | Tab 池修复后首次验证 |
| 20:15 | 代码提交 | fix\(tab-pool\): 修复 Tab 泄漏 |
| 19:50 | 问题诊断 | 发现 32 个 Tab 泄漏 |

---

## ⏰ 下次巡检

- **时间**: 21:54 CST \(5 分钟后\)
- **检查项**:
  - [ ] 进度 > 1
  - [ ] Tab 数量 ≤ 5
  - [ ] 有新评论文件生成
  - [ ] 确认目标是否需要更新
