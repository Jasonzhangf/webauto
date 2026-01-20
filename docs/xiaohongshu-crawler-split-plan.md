# 小红书爬虫脚本拆分方案

## 当前问题

1. **单文件巨大**：`phase1-4-full-collect.mjs` 6954行，难以维护
2. **无后台执行**：依赖终端，断开连接就停止
3. **详情页卡顿**：打开详情到退出之间等待时间过长

## 拆分策略

### 核心原则

1. **按 Phase 拆分**：Phase1、Phase2、Phase3-4 独立脚本
2. **状态驱动**：通过 `.collect-state.json` 管理断点续传
3. **后台运行**：支持 `--daemon` 模式，日志落盘
4. **性能优化**：减少详情页等待时间

### 目录结构

```
scripts/xiaohongshu/
├── orchestrator.mjs          # 调度器（替代 phase1-4-full-collect.mjs）
├── phase1/
│   ├── ensure-services.mjs   # 服务就绪检查
│   └── ensure-login.mjs      # 登录态检查
├── phase2/
│   ├── collect-list.mjs      # 列表采集（主逻辑）
│   └── recover-search.mjs    # 搜索页恢复工具
├── phase3-4/
│   ├── collect-details.mjs   # 详情+评论采集
│   └── persist-notes.mjs     # 落盘工具
└── shared/
    ├── state-manager.mjs     # 状态管理
    ├── delay-optimizer.mjs   # 延迟优化
    └── daemon-wrapper.mjs    # 后台执行包装器
```

### 脚本职责

| 脚本 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `orchestrator.mjs` | 流程调度 | CLI 参数 | 调用各 Phase |
| `phase1/ensure-services.mjs` | 服务检查 | - | exit 0/1 |
| `phase1/ensure-login.mjs` | 登录检查 | profile | 登录态 |
| `phase2/collect-list.mjs` | 列表采集 | keyword, target | safe-detail-urls.jsonl |
| `phase3-4/collect-details.mjs` | 详情评论采集 | safe-detail-urls.jsonl | 各 noteId 目录 |
| `shared/daemon-wrapper.mjs` | 后台执行 | 任意脚本 | nohup 启动 |

## 详情页卡顿优化

### 问题分析

当前详情页流程：
```
1. 点击列表项
2. 等待详情页加载（可能卡住）
3. 提取详情内容
4. ESC 退出
5. 等待恢复到搜索列表（可能卡住）
```

### 优化策略

1. **减少等待时间**：
   - 缩短 `delay` 调用
   - 使用 fast-poll 而非固定等待

2. **并发优化**：
   - Phase2 只采集 URL，不打开详情
   - Phase3 批量处理详情（4-tab 接力）

3. **超时机制**：
   - 详情页加载超过 5s → 跳过
   - ESC 恢复超过 3s → 强制刷新

## 后台执行方案

### daemon-wrapper.mjs

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';

function daemonize(scriptPath, args, logFile) {
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');
  
  const child = spawn('node', [scriptPath, ...args], {
    detached: true,
    stdio: ['ignore', out, err],
  });
  
  child.unref();
  console.log(`✅ 后台进程已启动: PID=${child.pid}`);
  console.log(`📄 日志文件: ${logFile}`);
}
```

### 使用方式

```bash
# 前台执行（默认）
node scripts/xiaohongshu/orchestrator.mjs --keyword "雷军" --count 200

# 后台执行
node scripts/xiaohongshu/orchestrator.mjs --keyword "雷军" --count 200 --daemon

# 查看日志
tail -f ~/.webauto/download/xiaohongshu/download/雷军/daemon.log
```

## 实施步骤

### 第一阶段：基础拆分（今天完成）

- [x] 创建目录结构
- [ ] 提取 Phase1 脚本
- [ ] 提取 Phase2 脚本
- [ ] 创建 orchestrator.mjs
- [ ] 实现 daemon-wrapper.mjs

### 第二阶段：性能优化（明天）

- [ ] 分析详情页卡顿原因
- [ ] 实现 delay-optimizer
- [ ] 添加超时机制
- [ ] 压力测试

### 第三阶段：清理旧代码（后天）

- [ ] 废弃 phase1-4-full-collect.mjs
- [ ] 更新文档
- [ ] 更新 AGENTS.md

## 验证标准

- [ ] orchestrator.mjs 可以完整运行 Phase1-4
- [ ] --daemon 模式不依赖终端
- [ ] 详情页平均等待时间 < 2s
- [ ] 支持断点续传
- [ ] 日志可追溯

