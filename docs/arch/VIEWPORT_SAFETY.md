# 视口安全行为准则（Viewport Safety Guidelines）

## 背景

小红书等平台通过 **视口行为检测** 识别自动化爬虫：
- 真实用户不会点击离屏（off-screen）元素
- 不会进行非自然的大跨度滚动
- 不会操作 `display:none` 或 `visibility:hidden` 的元素

本准则确保所有容器操作模拟真实用户可见行为。

---

## 核心原则

1. **可见即操作**：只操作当前视口内可见元素
2. **先验证后操作**：每个操作前必须通过 Rect 验证
3. **渐进式滚动**：滚动仅用于将元素带入视口
4. **自然节奏**：操作间加入人类可感知的延迟

---

## 技术规范

### 1. 可见性验证

**必须同时满足：**
```js
rect.y < window.innerHeight &&  // 元素顶部在视口内
rect.width > 0 &&               // 有宽度
rect.height > 0 &&              // 有高度
getComputedStyle(element).display !== 'none' &&
getComputedStyle(element).visibility !== 'hidden'
```

**验证流程：**
1. 通过 `containers:match` 获取元素坐标
2. 验证上述条件
3. 如不满足，滚动到元素位置
4. 重新验证（最多 3 次）

### 2. 滚动约束

**单次滚动：**
- 最大距离：800px（用户单次手势范围）
- 滚动后：必须重新验证可见性
- 滚动间隔：≥500ms（避免连续滚动）

**滚动方式：**
```js
// ✅ 正确：平滑滚动到元素
element.scrollIntoView({ behavior: 'smooth', block: 'center' });

// ❌ 错误：直接跳转到固定位置
window.scrollTo(0, 3000);
```

### 3. 点击约束

**点击前检查：**
1. 元素在视口中心区域（避免边缘误触）
2. 无其他元素遮挡（z-index 检查）
3. 元素可交互（`pointer-events !== 'none'`）

**点击方式：**
```js
// ✅ 正确：自然点击
await element.click();

// ❌ 错误：合成事件（除非必要）
element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
```

### 4. 输入约束

**输入节奏：**
- 每字符间隔：50-200ms（随机）
- 先聚焦再输入：
```js
element.focus();
await delay(Math.random() * 150 + 50); // 50-200ms
```

**事件触发：**
```js
element.value = text;
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
```

---

## 实现检查清单

### Block 级别
- [ ] 每个 Block 返回 `anchor.rect` 必须通过验证
- [ ] 滚动操作后重新验证可见性
- [ ] 点击前高亮 1-2 秒供视觉确认

### 脚本级别
- [ ] 无直接 `window.scrollTo(x, y)` 大跨度滚动
- [ ] 无 `querySelector` 后直接操作离屏元素
- [ ] 所有操作基于当前视口状态

### 调试级别
- [ ] 通过 `debug-container-tree-*.mjs` 验证可见性
- [ ] 日志中记录离屏操作告警
- [ ] Rect 验证失败时抛出可见性错误

---

## 违规示例

### ❌ 禁止做法
```js
// 直接操作可能不可见元素
document.querySelector('.hidden-button').click();

// 大跨度滚动后操作
window.scrollTo(0, 3000);
document.querySelector('.far-away-element').click();

// 无可见性验证的操作
element.click(); // 未检查 element 是否在视口内
```

### ✅ 正确做法
```js
// 先验证可见性
const rect = await verifyAnchor(containerId);
if (rect.y > window.innerHeight) {
  await scrollToElement(containerId);
  const newRect = await verifyAnchor(containerId);
  if (!newRect) throw new Error('元素不可见');
}

// 高亮确认
await highlight(containerId);
await delay(1000);

// 执行操作
await click(containerId);
```

---

## 检测与监控

### 开发阶段
- 每个 Block 必须返回 `anchor.rect.verified: true`
- 通过 `scripts/debug-container-tree-*.mjs` 验证可见性
- 调试日志记录离屏操作尝试

### 生产阶段
- 监控日志中的可见性验证失败率
- 设置告警阈值（如 >5% 失败率）
- 定期审查新 Block 的 Rect 验证逻辑

---

## 审查标准

| 等级 | 标准 | 处理方式 |
|------|------|----------|
| **A级** | 所有操作基于可见元素 + Rect 验证闭环 | 符合发布标准 |
| **B级** | 大部分操作可见，少量离屏但有合理滚动 | 需改进后发布 |
| **C级** | 存在直接离屏操作 | **阻塞发布**，必须整改 |

---

## 相关工具

- `scripts/debug-container-tree-summary.mjs` - 快速验证可见性
- `scripts/debug-container-tree-full.mjs` - 完整容器可见性检查
- `modules/workflow/blocks/helpers/anchorVerify.ts` - Rect 验证辅助函数
- `scripts/container-op.mjs` - 带可见性验证的容器操作

---

**制定时间**：2025-01-06  
**适用范围**：所有小红书采集脚本与 Workflow Block  
**审查周期**：每次 Block 新增或修改时必须验证
