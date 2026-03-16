# HEARTBEAT.md - 小红书采集压力测试

**Last Updated**: 2026-03-16 19:37 CST
**Status**: Running \(123/200\)

---

## 🎯 当前任务目标

### 主任务
完成小红书 `deepseekAI` 关键字的 200 条压力测试，验证：
1. **Collect阶段**: 链接采集正常，所有链接包含 `xsec_token`
2. **Detail阶段**: 帖子处理正常，评论爬取、点赞功能正常
3. **Tab管理**: 5个tab轮转正常，焦点切换无误
4. **终态**: 所有200条链接处理完毕，正确终止

### 运行参数
```bash
keyword: deepseekAI
target: 200
profile: xhs-qa-1
do-comments: true
do-likes: true
headless: false
```

### 当前进度 \(19:37 CST\)
- runId: `e1391e1c-8a93-434f-8ec1-ab5255cca071`
- 进度: **123/200 \(61.5%\)**
- 状态: running
- 阶段: unified
- Tab数: **5个** \(固定配置\)

### 数据统计
| 指标 | 数量 | 变化 |
|------|------|------|
| 帖子进度 | 123/200 | +14 \(vs 19:20\) |
| 总评论数 | **5,535 条** | 无变化 |
| 评论文件数 | 49 个 | 无变化 |
| 点赞记录 | 17 条 | 无变化 |
| 目录数 | 125 个 | +14 |

---

## 🔧 遇到问题处理方案

### 🚨 卡死/停滞诊断流程

**症状**: 进度长时间不更新（>5分钟无变化）

**诊断步骤**:
```bash
# 1. 检查任务状态
node bin/webauto.mjs xhs status --json | jq '.summary.tasks[0]'

# 2. 检查评论是否有新增
find ~/.webauto/download/xiaohongshu/debug/deepseekAI -name "comments.jsonl" -exec wc -l {} + | tail -1

# 3. 检查 Tab 数量（应为5个）
# 通过 camo runtime API 或截图确认

# 4. 检查最新日志
tail -100 ~/.webauto/logs/desktop-lifecycle.jsonl | jq 'select\(.level == "error" or .level == "warn"\)'

# 5. 检查浏览器是否正常
# 如果 headless=false，观察浏览器窗口状态
```

**常见问题定位**:
| 问题 | 症状 | 定位方法 | 处理 |
|------|------|----------|------|
| Tab焦点丢失 | 浏览器停滞 | 检查当前激活tab | 重启任务 |
| 网络错误 | fetch failed | 查看日志error | 等待恢复 |
| 风控触发 | 验证码/登录失效 | 截图确认 | 手动处理后重启 |
| 状态机死循环 | 重复相同操作 | 日志重复模式 | 修复状态机 |
| 评论无新增 | 目录增加但评论不变 | 检查comments.jsonl | 检查滚动逻辑 |

### 1. Tab焦点丢失
**检查**: 当前激活的tab是否正确
**处理**: 已修复 `ensureTabPool` 函数，统一使用 `newTab` API

### 2. 链接无 xsec_token
**处理**: 已修复 collect 阶段滚动逻辑，确保只保存含 token 的链接

### 3. 网络错误
**症状**: fetch failed, network error
**处理**: 等待网络恢复后任务自动继续

### 4. 风控触发
**症状**: 页面显示验证码或登录失效
**处理**: 停止任务，手动处理风控后重新启动

---

## 📊 巡检配置

### Clock 定时任务
- taskId: `34b1b409-7b4b-4701-bfd7-57d62ebeafb5`
- 间隔: 30分钟
- 下次巡检: 19:50 CST
- 剩余巡检次数: 3

### 巡检检查项
1. ✅ 进度更新 \(X/200\)
2. ✅ 评论总数变化
3. ✅ Tab数量确认
4. ✅ 点赞记录统计
5. ✅ 错误/异常检查

---

## 📦 最终交付内容

### 成功标准
1. ✅ 200条帖子全部处理完毕
2. ✅ 评论正确落盘到 `comments.jsonl`
3. ✅ 点赞记录正确保存
4. ✅ 任务终态为 `completed` 或 `script_complete`
5. ✅ 无异常错误或卡死

### 交付物
1. **数据文件**:
   - `~/.webauto/download/xiaohongshu/debug/deepseekAI/safe-detail-urls.jsonl` \(链接\)
   - 各帖子目录下的 `comments.jsonl` \(评论\)
   - `.like-state.jsonl` \(点赞\)

2. **日志文件**:
   - `~/.webauto/logs/desktop-lifecycle.jsonl`

3. **任务记录**:
   - runId: `e1391e1c-8a93-434f-8ec1-ab5255cca071`

---

## 📝 执行历史

| 时间 | 进度 | 评论 | 点赞 | Tab | 备注 |
|------|------|------|------|-----|------|
| 17:50 | 19/200 | 5494 | - | 5 | 任务启动 |
| 18:21 | 51/200 | 5535 | - | 5 | +41条 |
| 18:51 | 81/200 | 5535 | - | 5 | +30条 |
| 19:20 | 109/200 | 5535 | 17 | 5 | +28条，已过半 |
| 19:37 | 123/200 | 5535 | 17 | 5 | +14条，评论无变化⚠️ |

---

## ⚠️ 注意事项

**评论数量异常**: 从 18:21 到 19:37，评论总数一直是 5535 条，无新增。
- 可能原因: 新帖子评论数为0，或评论采集逻辑问题
- 需要检查: 新处理的帖子是否有评论，采集是否正常

---

## 🔄 相关文件

- 状态机文档: `MEMORY.md`
- 巡检配置: `clock.md`
- 项目文档: `AGENTS.md`
