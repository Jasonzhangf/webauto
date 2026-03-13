# Collect 终态修复记录 (2026-03-13)

## 问题
Collect 阶段运行约 220-250 条链接后卡住，没有发出明确的终态事件。

## 根因分析
1. **早期 continue 跳过终态检查**：`filtered.length === 0` 时直接 `continue`，跳过了后续的终态判定逻辑
2. **重复计数器未重置**：即使有新链接被添加，`duplicateOnly` 计数器也没有被正确重置
3. **缺乏明确的终态原因**：没有区分三种终态：
   - `COLLECT_REACHED_BOTTOM`：到达页面底部
   - `COLLECT_DUPLICATE_EXHAUSTED`：连续5轮只有重复链接
   - `COLLECT_SCROLL_STUCK`：连续3轮无法滚动

## 修复内容
文件：`modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs`

### 1) 移除早期 continue
```javascript
// 修复前：跳过终态检查
if (filtered.length === 0) {
  continue;
}

// 修复后：让代码继续执行到终态检查
if (filtered.length === 0) {
  markAddedZero();
  markDuplicateOnly();
  progressedThisRound = false;
}
// 不再 continue，让代码继续执行到终态检查
```

### 2) 添加状态跟踪函数
- `markDuplicateOnly()`：标记当前轮次只发���重复链接
- `resetDuplicateOnly()`：当有新链接添加时重置计数器
- `checkDuplicateOnlyTerminal()`：检查连续重复轮次是否超过阈值（5次）

### 3) 添加滚动卡住检测
- `resetScrollStuck()`：每次成功滚动后重置计数器
- `markScrollStuck()`：标记当前轮次滚动卡住
- `checkScrollStuckTerminal()`：检查连续卡住轮次是否超过阈值（3次）

### 4) 发出明确的终态事件
- `COLLECT_REACHED_BOTTOM`：检测到底部标记文本
- `COLLECT_DUPLICATE_EXHAUSTED`：连续5轮只发现重复链接
- `COLLECT_SCROLL_STUCK`：连续3轮无法滚动

## 验证结果
测试命令：
```bash
node bin/webauto.mjs xhs collect --profile xhs-qa-1 \
  --keyword "seedance2.0" --max-notes 50 --env debug \
  --output-root ./.tmp/collect-terminal-fix-50
```

测试结果：
- runId: `743912a8-94cd-4633-8f77-10d0a9fc6578`
- collectCount: 50
- terminalCode: `AUTOSCRIPT_DONE_LINKS_COLLECTED`
- 所有50条链接都包含 `xsec_token`
- 没有卡在运行中状态

## 下一步
1. 进行 500 条压力测试验证终态逻辑在大数据量下的稳定性
2. 确认三种终态原因都能正确触发
3. 验证终态事件被正确记录到 events.jsonl
