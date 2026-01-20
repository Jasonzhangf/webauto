# Phase2 滚动健壮性修复方案

## 问题诊断

当前 `雷军` 关键字采集在第13轮后停止，原因：
- 已采集 65/200 条
- 日志显示：`连续 ${noNewSafeRounds} 轮均未新增 safe-detail-urls，认为当前搜索结果已耗尽`
- 但实际上**并未检测到 END 标记**，说明还有更多结果

## 根本原因

现有逻辑（第3427-3440行）：
```javascript
if (noNewSafeRounds >= 5) {
  console.warn(`⚠️ 连续 ${noNewSafeRounds} 轮均未新增...提前结束`);
  break;  // ❌ 过早退出
}

const scrolled = await scrollSearchPage('down', keyword);
if (!scrolled) {
  console.warn('⚠️ 系统滚动失败或已到底，停止...');
  break;  // ❌ 单次失败就放弃
}
```

**问题**：
1. 只要5轮无新增就退出（可能只是滚动未生效）
2. 单次滚动失败就退出（没有重试）
3. 没有区分"真正到底"和"临时卡住"

## 修复方案

### 1. 增加滚动重试机制（第3427-3440行替换为以下逻辑）

```javascript
// ========== 健壮滚动逻辑 ==========
// 只有当真正达到搜索结果底部（END标记）或连续滚动失败次数过多时才退出

if (newlyAdded === 0) {
  console.log('   ⚠️ 当前视口内没有新增 safe-detail-urls，尝试向下滚动一屏加载新内容...');
}

// 尝试向下滚动（带重试机制）
let scrolled = false;
const MAX_SCROLL_RETRIES = 3;

for (let retryIdx = 0; retryIdx < MAX_SCROLL_RETRIES; retryIdx++) {
  if (retryIdx > 0) {
    console.log(`   🔄 第 ${retryIdx + 1}/${MAX_SCROLL_RETRIES} 次滚动尝试...`);
    
    // 重试前先尝试回滚再前进（可能卡住了）
    if (retryIdx === 1) {
      console.log('   ⬆️ 先向上回滚一小段...');
      await scrollSearchPage('up', keyword).catch(() => false);
      await delay(800);
    }
    
    // 第3次重试前等待60秒（可能需要页面加载）
    if (retryIdx === 2) {
      console.log('   ⏳ 等待 60 秒后再次尝试（可能需要页面加载）...');
      await delay(60000);
    }
  }
  
  scrolled = await scrollSearchPage('down', keyword);
  
  if (scrolled) {
    scrollFailCount = 0;
    lastScrollAttemptTime = Date.now();
    console.log(`   ✅ 滚动成功（第 ${retryIdx + 1} 次尝试）`);
    break;
  } else {
    console.warn(`   ❌ 滚动失败（第 ${retryIdx + 1}/${MAX_SCROLL_RETRIES} 次）`);
    
    // 每次失败后等待一下
    if (retryIdx < MAX_SCROLL_RETRIES - 1) {
      await delay(2000 + Math.random() * 1000);
    }
  }
}

// 如果所有重试都失败
if (!scrolled) {
  scrollFailCount++;
  console.warn(
    `   ⚠️ 连续 ${MAX_SCROLL_RETRIES} 次滚动尝试均失败（累计失败轮次=${scrollFailCount}）`,
  );
  
  // 只有当连续3轮（每轮3次重试）都失败时才真正退出
  if (scrollFailCount >= 3) {
    console.error(
      `\n❌ Phase2 退出原因：连续 ${scrollFailCount} 轮（共 ${scrollFailCount * MAX_SCROLL_RETRIES} 次尝试）滚动失败`,
    );
    console.error('   可能原因：');
    console.error('   1. 已到达搜索结果底部（但未检测到 END 标记）');
    console.error('   2. 页面结构变化导致滚动容器定位失败');
    console.error('   3. 小红书限流或风控');
    console.error(`\n   当前已采集：${safeUrlIndex.size}/${targetCount}`);
    
    emitRunEvent('phase2_scroll_failure', {
      scrollFailCount,
      totalAttempts: scrollFailCount * MAX_SCROLL_RETRIES,
      collected: safeUrlIndex.size,
      target: targetCount,
    });
    break;
  }
  
  // 失败但未达到退出阈值，等待后继续
  console.log(`   ⏸️ 等待 5 秒后继续...`);
  await delay(5000);
} else {
  // 滚动成功后等待内容稳定
  await delay(1100 + Math.random() * 800);
}

// 警告：连续多轮无新增（但不再直接退出）
if (noNewSafeRounds >= 8) {
  console.warn(
    `   ⚠️ 警告：连续 ${noNewSafeRounds} 轮未新增 safe-detail-urls，但继续尝试滚动（只有检测到 END 标记或滚动失败才会退出）`,
  );
  // 不再直接 break，让滚动重试机制决定是否退出
}
```

### 2. 在第2887行后添加变量声明

```javascript
let noNewSafeRounds = 0;
let scrollFailCount = 0;           // 连续滚动失败次数
let lastScrollAttemptTime = 0;     // 上次滚动尝试时间
```

## 实施步骤

1. **备份原文件**：
   ```bash
   cp scripts/xiaohongshu/tests/phase1-4-full-collect.mjs scripts/xiaohongshu/tests/phase1-4-full-collect.mjs.backup
   ```

2. **手动修改**（因文件过大，需手动编辑）：
   - 在第2887行后添加两个变量声明
   - 替换第3420-3440行的滚动逻辑为上述健壮版本

3. **测试验证**：
   ```bash
   node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --count 200
   ```

## 预期效果

- ✅ 不再因"5轮无新增"就退出
- ✅ 单次滚动失败会自动重试3次
- ✅ 第2次重试前会向上回滚（防止卡住）
- ✅ 第3次重试前等待60秒（等待页面加载）
- ✅ 只有连续3轮（共9次尝试）都失败才退出
- ✅ 退出时给出明确原因和诊断信息

## 测试场景

| 场景 | 原逻辑 | 新逻辑 |
|------|--------|--------|
| 5轮无新增但还有结果 | ❌ 退出 | ✅ 继续重试 |
| 单次滚动失败 | ❌ 退出 | ✅ 自动重试3次 |
| 真正到达底部 | ✅ 检测END标记 | ✅ 同样检测END标记 |
| 页面临时卡住 | ❌ 退出 | ✅ 回滚+等待+重试 |

