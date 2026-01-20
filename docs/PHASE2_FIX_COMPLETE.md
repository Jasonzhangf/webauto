# Phase2 滚动异常不中断流程 - 完整修复方案

## 问题现状

执行 `node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --count 200` 时：

1. ❌ Phase2 在第13轮后停止（已采集65/200条）
2. ❌ 脚本直接退出，未进入 Phase3/4 评论采集
3. ❌ 原因：`连续5轮无新增` → 直接 `throw error`

## 核心修复目标

✅ **Phase2 滚动异常只记录警告，不中断后续 Phase3/4**

即：
- 列表未达目标 → 继续执行 Phase3/4（基于已有 safe-detail-urls）
- 只在检测到 END 标记时认为真正到底
- 滚动失败会重试（每轮3次），但不抛错

## 修复内容

### 修复1：移除 Phase2 throw error ✅ 已完成

**位置**：第 3560-3575 行

**修改前**：
```javascript
if (safeUrlIndex.size < targetCount) {
  console.error(`❌ 目标未达成`);
  throw new Error('phase2_safe_detail_target_not_reached');  // ❌ 中断流程
}
```

**修改后**：
```javascript
if (safeUrlIndex.size < targetCount) {
  console.warn(`⚠️ 目标未达成`);
  console.warn('   🔄 将继续执行 Phase3/4（基于已有 safe-detail-urls）\n');
  // 不再 throw，返回 completed: false
}
return { count: safeUrlIndex.size, completed: safeUrlIndex.size >= targetCount };
```

### 修复2：滚动重试逻辑（需手动应用）

**位置**：第 3420-3445 行

**核心改进**：
1. 每轮滚动最多重试 3 次
2. 第2次重试前向上回滚（防止卡住）
3. 第3次重试前等待60秒（等待页面加载）
4. 连续3轮（共9次尝试）失败才退出循环
5. **退出只 break，不 throw error**

**详细代码见**：`/tmp/phase2_fix.txt` 修复位置1

### 修复3：main() 容错处理（需手动应用）

**位置**：第 6766-6776 行

**修改前**：
```javascript
await runPhase2ListOnly(keyword, phase2TargetTotal, env);
// Phase2 失败会直接抛错，Phase3/4 不执行
```

**修改后**：
```javascript
try {
  await runPhase2ListOnly(keyword, phase2TargetTotal, env);
} catch (err) {
  if (String(err?.message || '').includes('stage_guard_not_search')) {
    throw err;  // 搜索页守卫失败，无法继续
  }
  // 其他错误只记录，不中断
  console.warn(`Phase2 异常退出但不影响后续阶段: ${err?.message}`);
}
// ✅ Phase3/4 始终执行
```

## 实施步骤

### 1. 检查修复1

```bash
sed -n '3560,3575p' scripts/xiaohongshu/tests/phase1-4-full-collect.mjs
```

应该看到：
```javascript
  if (safeUrlIndex.size < targetCount) {
    console.warn(
      `[Phase2(ListOnly)] ⚠️ 目标 safe-detail-urls 数量未达成...`,
    );
    console.warn('   🔄 将继续执行 Phase3/4（基于已有 safe-detail-urls）\n');
  }
```

### 2. 应用修复2（滚动重试逻辑）

打开编辑器：
```bash
code scripts/xiaohongshu/tests/phase1-4-full-collect.mjs:3420
```

定位第 3420-3445 行，替换为 `/tmp/phase2_fix.txt` 中的"修复位置1"代码。

### 3. 应用修复3（容错处理）

定位第 6766-6776 行，替换为 `/tmp/phase2_fix.txt` 中的"修复位置3"代码。

### 4. 验证变量声明

检查第 2887-2890 行：
```bash
sed -n '2886,2892p' scripts/xiaohongshu/tests/phase1-4-full-collect.mjs
```

应该包含：
```javascript
  let noNewSafeRounds = 0;
  let scrollFailCount = 0;           // 连续滚动失败次数
  let lastScrollAttemptTime = 0;     // 上次滚动尝试时间
```

## 测试验证

### 1. 清理旧数据（可选）

```bash
rm -rf ~/.webauto/download/xiaohongshu/download/雷军/.collect-state.json
# 保留 safe-detail-urls.jsonl，从65条继续
```

### 2. 重新执行

```bash
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --count 200
```

### 3. 预期行为

✅ **Phase2 滚动失败时**：
```
   ❌ 滚动失败（第 1/3 次）
   🔄 第 2/3 次滚动尝试...
   ⬆️ 先向上回滚一小段...
   ✅ 滚动成功（第 2 次尝试）
```

✅ **连续失败退出时**：
```
⚠️ Phase2 滚动异常退出：连续 3 轮（共 9 次尝试）滚动失败
   可能原因：
   1. 已到达搜索结果底部（但未检测到 END 标记）
   2. 页面结构变化导致滚动容器定位失败
   3. 小红书限流或风控
   
   当前已采集：65/200
   🔄 将继续执行 Phase3/4 评论采集（基于已有 safe-detail-urls）

3️⃣ Phase3-4: 基于 safe-detail-urls.jsonl 的详情 + 评论采集...
```

✅ **最终结果**：
- 即使列表只采集到 65 条
- Phase3/4 仍然会执行，采集这 65 条的评论
- 最终每条笔记目录下会有 `comments.md`

## 验证清单

- [ ] 修复1：`console.warn` 而非 `console.error`，无 `throw`
- [ ] 修复2：滚动重试 3 次，回滚 + 等待 60s
- [ ] 修复3：Phase2 异常不中断 Phase3/4
- [ ] 变量声明：`scrollFailCount` 和 `lastScrollAttemptTime`
- [ ] 测试通过：列表未达标也进入 Phase3/4

## 回滚方案

如需回滚：
```bash
cp scripts/xiaohongshu/tests/phase1-4-full-collect.mjs.backup \
   scripts/xiaohongshu/tests/phase1-4-full-collect.mjs
```

