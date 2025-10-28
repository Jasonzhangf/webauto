# 系统安全使用指南

## 🛡️ 安全系统概述

本系统现在包含了完整的安全防护措施，确保所有操作都在安全的范围内进行。

## 📋 核心安全组件

### 1. 统一Cookie管理
- **文件**: `enhanced-unified-cookie-manager.cjs`
- **功能**: 自动Cookie管理、登录状态验证、回退到可视化登录
- **使用**: 所有新系统必须继承 `BaseWeiboSystem`

### 2. 安全点击管理
- **文件**: `safe-click-manager.cjs`
- **功能**: 容器内点击、错误检测、自动重试、黑名单机制
- **使用**: `await this.safeClickInContainer(containerSelector, elementSelector)`

### 3. 安全避让管理
- **文件**: `safe-click-manager.cjs`
- **功能**: 访问间隔控制、错误退避、URL黑名单
- **使用**: `await this.safeAccess(url)`

### 4. 安全容器管理
- **文件**: `safe-container-manager.cjs`
- **功能**: 容器验证、容器内操作、链接提取
- **使用**: `await containerManager.executeInContainer(page, 'feedContainer', operation)`

## 🔧 正确的使用模式

### 创建新系统
```javascript
const { BaseWeiboSystem } = require('./unified-system-template.cjs');

class MySafeSystem extends BaseWeiboSystem {
  constructor(options = {}) {
    super({
      headless: false,
      safeMode: true,
      ...options
    });
  }

  async myOperation() {
    return this.executeOperation('myOperation', async () => {
      // 1. 安全访问URL
      await this.safeAccess('https://weibo.com');

      // 2. 容器内安全点击
      await this.safeClickInContainer(
        '[class*="feed"]',
        'button:has-text("加载更多")'
      );

      // 3. 安全滚动
      await this.safeScroll({ direction: 'down' });

      return '操作完成';
    });
  }
}
```

### 使用容器管理器
```javascript
const { createWeiboSafeContainerManager } = require('./safe-container-manager.cjs');

const containerManager = createWeiboSafeContainerManager();

// 初始化
const { page } = await containerManager.initializeCookieManager();

// 在容器内执行操作
const links = await containerManager.executeInContainer(
  page,
  'feedContainer',
  async ({ safeClick, extractElements }) => {
    await safeClick('button:has-text("加载更多")');
    const elements = await extractElements('a[href*="weibo.com"]');
    return elements;
  }
);
```

## ⚠️ 禁止的操作模式

### ❌ 错误：直接点击
```javascript
// 错误 - 可能误点击非目标元素
await page.click('button');
element.click();
```

### ✅ 正确：容器内安全点击
```javascript
// 正确 - 限制在特定容器内
await this.safeClickInContainer(
  '[class*="feed"]',
  'button:has-text("加载更多")'
);
```

### ❌ 错误：全局选择器
```javascript
// 错误 - 可能选择到错误的元素
const buttons = document.querySelectorAll('button');
```

### ✅ 正确：容器限定选择器
```javascript
// 正确 - 只在特定容器内选择
const buttons = document.querySelectorAll('[class*="feed"] button');
```

## 🎯 安全最佳实践

1. **始终使用容器限定** - 所有操作都应该在特定容器内进行
2. **使用安全系统** - 新功能必须基于 `BaseWeiboSystem` 或使用容器管理器
3. **错误处理** - 所有操作都包含错误检测和恢复机制
4. **访问控制** - 避免频繁访问，使用避让机制
5. **日志记录** - 记录所有操作以便调试和审计

## 🧪 测试安全系统

运行安全测试：
```bash
node test-safe-systems.cjs
```

分析系统安全状态：
```bash
node system-analyzer.cjs
```

## 🔍 故障排除

### 常见问题

1. **"容器不存在"**
   - 检查容器选择器是否正确
   - 确保页面已完全加载
   - 使用 `await page.waitForSelector(containerSelector)`

2. **"连续错误次数过多"**
   - 检查选择器是否准确
   - 增加重试间隔
   - 使用 `this.clickManager.resetErrors()` 重置

3. **"URL在黑名单中"**
   - 使用 `this.avoidanceManager.reset()` 重置避让状态
   - 检查URL是否正确

## 📞 支持

如果遇到安全问题，请：
1. 查看系统分析报告
2. 运行安全测试
3. 检查日志文件
4. 参考本指南

---

*最后更新: 2025-09-20*
