# WebAuto 统一高亮服务

提供抗CSS干扰、动态跟随、失败回退的强化高亮功能，支持各种页面环境下的元素高亮显示。

## 功能特性

- **抗CSS干扰**: 使用 `!important` 强制样式，确保在复杂页面环境下正常显示
- **动态跟随**: 自动监听元素位置变化，实时调整高亮位置
- **失败回退**: 提供基于坐标的高亮方案，应对复杂DOM结构
- **动画效果**: 支持脉冲、发光、弹跳等多种动画效果
- **持久化选项**: 支持临时高亮和持久化高亮
- **批量管理**: 支持创建、清除、统计多个高亮效果

## 核心 API

### `createHighlight(element, config)`
创建高亮效果

```javascript
const highlightId = window.__webautoHighlight.createHighlight(element, {
  color: '#ff3b30',           // 高亮颜色
  label: 'TARGET',            // 标签文本
  duration: 8000,             // 持续时间(ms)
  persist: false,             // 是否持久化
  scrollIntoView: true,       // 是否滚动到视口
  alias: 'my-highlight'       // 别名
});
```

### `clearHighlight(id)`
清除指定高亮

```javascript
window.__webautoHighlight.clearHighlight(highlightId);
```

### `clearAllHighlights()`
清除所有高亮

```javascript
window.__webautoHighlight.clearAllHighlights();
```

### `getStats()`
获取高亮统计信息

```javascript
const stats = window.__webautoHighlight.getStats();
console.log(stats);
// { activeHighlights: 3, overlayElements: 3, labelElements: 3, totalElements: 6 }
```

### `createHighlightFromRect(rect, config)`
基于坐标创建高亮（回退方案）

```javascript
window.__webautoHighlight.createHighlightFromRect({
  x: 100, y: 200, width: 150, height: 50
}, { color: '#00c851', label: 'RECT' });
```

## 技术实现

### 样式隔离
- 使用 `setProperty('all', 'initial', 'important')` 重置所有样式
- 通过 `!important` 确保样式优先级
- 使用 `z-index: 2147483647` 确保显示在最上层

### 动态跟随
- 使用 `ResizeObserver` 监听元素尺寸变化
- 使用 `MutationObserver` 监听DOM结构变化
- 使用 `requestAnimationFrame` 优化性能

### 抗干扰机制
- 设置 `pointer-events: none` 避免干扰页面交互
- 使用固定定位(`fixed`)避免布局影响
- 提供回退方案应对极端情况

## 使用场景

1. **元素拾取器**: 在页面中交互式选择元素
2. **调试辅助**: 开发时高亮显示特定元素
3. **操作指引**: 引导用户执行特定操作
4. **测试验证**: 自动化测试中的元素定位验证

## 集成方式

```javascript
// 在页面中注入高亮服务
const script = document.createElement('script');
script.src = '/path/to/highlight-service.js';
document.head.appendChild(script);

// 使用高亮服务
script.onload = () => {
  const element = document.querySelector('#target');
  window.__webautoHighlight.createHighlight(element, {
    color: '#ff3b30',
    label: 'PICK'
  });
};
```

## 性能优化

- 使用对象池管理高亮元素
- 防抖处理避免频繁重绘
- 自动清理机制防止内存泄漏
- 懒加载动画样式

## 兼容性

- 支持现代浏览器(Chrome 80+, Firefox 72+, Safari 13+)
- 支持各种复杂页面环境
- 兼容各种CSS框架和UI库
