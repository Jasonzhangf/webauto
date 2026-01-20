# 小红书采集快速开始

## 前置条件

1. **启动基础服务**（只需启动一次）：
   ```bash
   node scripts/start-headful.mjs
   ```

2. **确认服务就绪**：
   ```bash
   curl http://127.0.0.1:7701/health  # Unified API
   curl http://127.0.0.1:7704/health  # Browser Service
   ```

3. **检查会话状态**：
   ```bash
   node scripts/xiaohongshu/tests/status-v2.mjs
   ```
   
   必须看到：
   - ✅ session `xiaohongshu_fresh` 已存在
   - ✅ 登录锚点命中

## 方式1：使用简化调度器（推荐）

### 前台执行（调试用）

```bash
node scripts/xiaohongshu/run-full-workflow.mjs \
  --keyword "雷军" \
  --count 200
```

### 后台执行（生产环境）

```bash
node scripts/xiaohongshu/run-full-workflow.mjs \
  --keyword "雷军" \
  --count 200 \
  --daemon
```

后台执行后：
```bash
# 查看日志（脚本会提示日志路径）
tail -f ~/.webauto/download/xiaohongshu/download/雷军/daemon.*.log

# 或查看最新的运行日志
tail -f ~/.webauto/download/xiaohongshu/download/雷军/run.*.log
```

## 方式2：直接使用原始脚本

```bash
# 前台执行
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs \
  --keyword "雷军" \
  --count 200

# 后台执行
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs \
  --keyword "雷军" \
  --count 200 \
  --daemon
```

## 输出结构

采集完成后，数据保存在：
```
~/.webauto/download/xiaohongshu/download/{keyword}/
├── {noteId_1}/
│   ├── content.md      # 帖子详情（Markdown）
│   ├── images/         # 图片目录
│   │   ├── 1.jpg
│   │   └── ...
│   └── comments.md     # 评论（如果有）
├── {noteId_2}/
│   └── ...
├── safe-detail-urls.jsonl   # 带 xsec_token 的详情链接索引
├── .collect-state.json      # 断点续传状态
└── run.*.log                # 运行日志
```

## 常见问题

### 1. 脚本提前退出（只采集到 65 条）

**原因**：Phase2 滚动异常（已修复）

**解决**：
- 确保使用修复后的脚本（2026-01-17 之后）
- 重新运行，脚本会从断点续传

### 2. 后台进程找不到

```bash
# 查找后台进程
ps aux | grep "phase1-4-full-collect"

# 查看 PID 文件
ls ~/.webauto/logs/daemon.*.pid
cat ~/.webauto/logs/daemon.*.pid

# 停止后台进程
kill <PID>
```

### 3. 详情页采集很慢

**当前已知问题**：详情页打开→退出平均 8-12s/条

**临时方案**：
- 减少 `--count` 数量
- 使用 Phase2-only 模式先采集 URL

**根本解决**（下一步优化）：
- 超时机制
- 快速恢复
- 并发优化

### 4. 如何查看实时进度

```bash
# 查看运行日志
tail -f ~/.webauto/download/xiaohongshu/download/{keyword}/run.*.log

# 查看事件日志
tail -f ~/.webauto/download/xiaohongshu/download/{keyword}/run-events.*.jsonl

# 查看已采集数量
ls ~/.webauto/download/xiaohongshu/download/{keyword}/ | grep -E '^[0-9a-f]{24}$' | wc -l
```

## 中断与恢复

### 手动中断

```bash
# 前台模式：Ctrl+C
# 后台模式：kill <PID>
```

### 断点续传

```bash
# 查看当前状态
cat ~/.webauto/download/xiaohongshu/download/{keyword}/.collect-state.json

# 继续采集（使用相同参数）
node scripts/xiaohongshu/run-full-workflow.mjs \
  --keyword "{keyword}" \
  --count 200
```

脚本会自动：
1. 读取 `.collect-state.json`
2. 跳过已采集的 noteId
3. 从上次中断位置继续

## 高级选项

### 指定环境

```bash
# 默认环境：download
node scripts/xiaohongshu/run-full-workflow.mjs --keyword "雷军" --count 200

# 自定义环境：prod
node scripts/xiaohongshu/run-full-workflow.mjs --keyword "雷军" --count 200 --env prod
# 输出到：~/.webauto/download/xiaohongshu/prod/雷军/
```

### Phase2-only 模式（快速采集 URL）

```bash
# 只采集列表，不打开详情
WEBAUTO_PHASE2_ONLY=1 node scripts/xiaohongshu/run-full-workflow.mjs \
  --keyword "雷军" \
  --count 200
```

## 性能参考

| 阶段 | 耗时 | 说明 |
|------|------|------|
| Phase1 | ~5s | 服务检查 + 登录验证 |
| Phase2 | ~5分钟/65条 | 列表滚动 + 点击详情获取 URL |
| Phase3 | ~8-12s/条 | 详情页采集（**性能瓶颈**） |
| Phase4 | ~5-10s/条 | 评论采集 |
| **总计** | ~30-40分钟/200条 | 取决于评论数量 |

## 下一步

- [ ] **性能优化**：详情页卡顿优化（目标：2-3s/条）
- [ ] **拆分脚本**：按 Phase 独立脚本
- [ ] **监控面板**：实时进度展示

