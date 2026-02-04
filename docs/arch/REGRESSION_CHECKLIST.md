# 回归验证检查清单（Regression Checklist）

> 定义“什么是验证完成”：每次代码改动后必须提供的证据条目，避免模糊的“测试通过”。

## 适用场景

- 所有 Phase 脚本改动（1-4）
- 核心服务改动（Unified API/Browser Service/SearchGate）
- Workflow/Block 改动（影响采集/评论/落盘）
- UI/Desktop Console 改动（影响编排/参数生成）

---

## 必需证据（每个改动）

### 1. 服务健康检查

```bash
# Unified API
curl -s http://127.0.0.1:7701/health | jq .

# Browser Service
curl -s http://127.0.0.1:7704/health | jq .

# SearchGate（可选，仅搜索相关改动）
curl -s http://127.0.0.1:7790/health | jq .
```

**要求**：每个服务返回 `ok: true`（或明确期望的错误码），并附上终端输出截图或复制文本。

---

### 2. 脚本运行证据

- **runId**：从 `[Logger] runId=...` 提取
- **日志路径**：
  - `~/.webauto/download/xiaohongshu/<env>/<keyword>/run.log`
  - `~/.webauto/download/xiaohongshu/<env>/<keyword>/run-events.jsonl`
- **命令**：完整执行的命令（例如：`node scripts/xiaohongshu/phase2-collect.mjs --keyword 深圳黄金 --target 20 --env debug`）
- **输出摘要**：
  - 最终状态（成功/失败）
  - 关键指标（采集数量/耗时）
  - 错误信息（如果有）

**示例**：
```bash
node scripts/xiaohongshu/phase2-collect.mjs --profile xiaohongshu_batch-2 --keyword "深圳黄金" --target 20 --env debug

# 输出:
# [Logger] runId=20260203-114619-scoxyx
# ✅ 20/20
# ⏱️  总耗时: 8m56s
# 📁 保存路径: /Users/fanzhang/.webauto/download/xiaohongshu/debug/深圳黄金/phase2-links.jsonl
```

---

### 3. 失败时的证据（如果脚本失败）

- **WS DOM 快照**：使用 `ws://127.0.0.1:7701/ws` 执行 `browser:execute` 获取 `document.body.innerHTML` 或容器匹配状态
- **高亮/锚点**：使用 `container:operation highlight` 在页面上高亮失败元素，并截图
- **错误日志**：从 `run.log` 提取最后 20 行

**示例命令**：
```bash
# 获取当前页 DOM 摘要（Unified API / WS）
node scripts/xiaohongshu/tests/ws-dom-dump.mjs --profile <profile>

# 高亮指定容器
node scripts/container-op.mjs <profile> <containerId> highlight
```

**规则**：
- 脚本失败时 **必须** 先跑 `ws-dom-dump.mjs` 留证再重试。
- DOM 快照必须写入 bd 任务评论（避免只在聊天里）。
- 禁止使用 Chrome MCP；只允许 Unified API/容器系统。

---

### 4. 落盘验证（如果涉及写盘）

- **文件存在性**：`ls -l ~/.webauto/download/xiaohongshu/<env>/<keyword>/`
- **内容抽样**：`head -n 3 phase2-links.jsonl | jq .`
- **去重验证**：两次运行后确认目录未重复创建

---

## 模板：提交 bd 任务时必须包含的字段

```markdown
### 改动描述
<一句话说明改了什么>

### 服务健康
- [ ] Unified API: （粘贴 curl 7701/health 输出）
- [ ] Browser Service: （粘贴 curl 7704/health 输出）
- [ ] SearchGate: （如适用）

### 脚本运行
- **命令**: <完整命令>
- **runId**: <从日志提取>
- **结果**: <成功/失败 + 关键指标>
- **日志路径**: `~/.webauto/download/.../run.log`

### 失败证据（如有）
- **DOM 快照**: （粘贴 ws-dom-dump 输出）
- **高亮截图**: （附图或说明高亮的 containerId）
- **错误日志**: （run.log 最后 20 行）

### 落盘验证（如涉及）
- [ ] 文件路径: <ls -l 输出>
- [ ] 内容抽样: <head -n 3 | jq . 输出>
- [ ] 去重验证: <说明>
```

---

## 引用

- 本文档在 `AGENTS.md` 中索引为“回归验证规范”
- bd Epic `webauto-0r2` 的子任务 `webauto-jqm` 负责维护此清单
