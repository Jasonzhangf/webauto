# 小红书全流程采集执行文档（Phase1-4）

> 目标：确保“列表未达目标也继续执行 Phase3/4 评论采集”，即使列表滚动异常也不中断后续流程。

## 一、前置检查

### 1. 服务状态

```bash
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

### 2. 会话状态

```bash
node scripts/xiaohongshu/tests/status-v2.mjs
```

必须确认：
- session: `xiaohongshu_fresh` 已存在
- 登录锚点 `*.login_anchor` 命中
- 当前页面处于小红书正常页面

### 3. SearchGate

如果需要搜索（Phase2 会触发）：

```bash
node scripts/search-gate-server.mjs
```

## 二、全流程启动

### 1. 启动完整采集

```bash
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --count 200
```

输出目录（强制标准）：
```
~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
```

默认 env=`download`（可通过参数调整）。

### 2. 运行阶段说明

| 阶段 | 功能 | 退出条件 |
|------|------|-----------|
| Phase1 | 确认服务/会话/登录 | 成功即进入 Phase2 |
| Phase2(ListOnly) | 搜索列表采集 + 获取 safe-detail-urls | **列表滚动异常不影响后续阶段** |
| Phase3 | 基于 safe-detail-urls 打开详情 | safe-detail-urls 为空则跳过 |
| Phase4 | 采集评论并落盘 | 逐条完成，增量写 comments.md |

### 3. 关键要求（必须遵守）

- **不允许 URL 直跳**：必须从搜索页点击进入详情
- **SearchGate 节流**：搜索必须先申请许可
- **容器锚点**：禁止硬编码 DOM
- **滚动必须在视口内**：禁止 off-screen 操作
- **内容文件名必须是 `content.md`**（不是 README.md）

## 三、Phase2 滚动异常处理（修复后行为）

### 目标

- **只在检测到 END 标记时认为真正到底**
- **若滚动失败：仍继续尝试滚动**
- **即使 Phase2 未达标，也继续执行 Phase3/4**

### 异常退出逻辑（修复后）

- 连续 3 轮滚动失败（每轮 3 次重试） → 标记 Phase2 异常退出
- **但不会中断流程**：Phase3/4 继续执行已采集的 safe-detail-urls

## 四、产出目录结构

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
├── content.md
├── images/
│   ├── 1.jpg
│   └── ...
└── comments.md   # Phase4 追加生成
```

其他文件：
- `.collect-state.json`：断点状态
- `safe-detail-urls.jsonl`：带 xsec_token 的详情链接索引
- `run.log / run-events.jsonl`：流程日志

## 五、恢复采集

如中断，可直接重跑，脚本会续传：

```bash
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --count 200
```

## 六、排查常见问题

### 1. Phase2 停止但未到 END

修复后不会直接停止，只会进入“滚动失败重试”。
若仍退出：
- 检查 END 标记是否存在
- 检查容器结构是否变化
- 检查 SearchGate 状态

### 2. 没有 comments.md

说明 Phase4 未完成或评论为空：
- 检查日志 `Phase4` 关键字
- 检查是否遇到风控

### 3. 输出路径不对

必须是：
```
~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
```

## 七、日志定位

```bash
# 最新 run log
ls -lt ~/.webauto/download/xiaohongshu/{env}/{keyword}/run*.log | head -1

# 查看关键错误
rg "ERROR|WARN|风控|phase2_scroll_failure" ~/.webauto/download/xiaohongshu/{env}/{keyword}/run*.log
```

