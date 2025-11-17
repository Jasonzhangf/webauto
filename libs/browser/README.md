# WebAuto Browser 模块

## 概述

WebAuto浏览器模块提供统一的浏览器自动化接口，支持Playwright和Camoufox两种底层实现。所有浏览器操作都应通过本模块的高级API进行，禁止直接使用底层库。

## 架构设计

### 核心原则

1. **统一入口**: 所有浏览器操作通过`browser.js`统一入口
2. **抽象隔离**: 应用层不直接访问底层实现
3. **安全防护**: 禁止外部直接导入底层库
4. **模块化**: 清晰的职责分离和接口定义

### 架构层次

```
应用层 (Application Layer)
    ↓ 调用高级API
统一入口层 (browser.js)
    ↓ 内部实现
抽象层 (AbstractBrowser)
    ↓ 具体实现
实现层 (PlaywrightBrowser/CamoufoxBrowser)
```

## 模块结构

```
libs/browser/
├── browser.js                    # 🎯 统一入口 (对外唯一接口)
├── browser-manager.js            # 📋 管理器 (单例模式)
├── browser-config.js             # ⚙️ 配置管理
├── browser-errors.js             # ❌ 异常定义
├── cookie-manager.js             # 🍪 Cookie管理
├── fingerprint-manager.js        # 🔊 指纹管理
├── remote-service.js            # 🌐 远程控制服务
├── browser-service-config.js     # 📡 服务配置
├── abstract-browser.js           # 📄 抽象基类
├── playwright-browser.js        # 🎭 Playwright实现
├── default-profile.js           # 👤 默认配置
├── security/                   # 🔒 安全防护
│   └── enforce-imports.js
└── README.md                  # 📖 本文档
```

## 使用指南

### 基础用法

```javascript
import { getBrowser, stealthMode, quickTest } from './browser.js';

// 快速启动浏览器
const browser = await getBrowser();
await browser.start();

// 创建页面
const page = await browser.newPage();
await page.goto('https://example.com');

// 获取页面内容
const title = await page.title();
console.log('页面标题:', title);

// 关闭浏览器
await browser.close();
```

### 配置选项

```javascript
// 使用自定义配置
const config = {
    headless: false,
    locale: 'zh-CN',
    persistSession: true,
    profileId: 'my-profile'
};

const browser = await getBrowser(config);
```

### 中文支持

```javascript
// 隐匿模式 (推荐用于中文网站)
const browser = await stealthMode();

// 或指定中文配置
const browser = await getBrowser({
    locale: 'zh-CN'
});
```

## 高级功能

### Profile管理

```javascript
// 多profile支持
const profile1 = await getBrowser({ profileId: 'work' });
const profile2 = await getBrowser({ profileId: 'personal' });
```

### Cookie自动管理

```javascript
// 自动保存/加载 (基于URL匹配)
await browser.goto('https://weibo.com');  // 自动注入匹配的Cookie
// 浏览器关闭时自动保存
await browser.close();  // 自动保存当前状态
```

### 指纹管理

```javascript
// 自动指纹生成和应用
const browser = await stealthMode();  // 包含完整指纹
```

### 远程控制

```javascript
// 启动远程控制服务
import { startBrowserService } from './browser.js';
await startBrowserService({ host: '0.0.0.0', port: 7704 });
```

## 配置参考

### 中文配置 (CHINESE_CONFIG)

```javascript
{
    locale: 'zh-CN',
    args: ['--lang=zh-CN']
}
```

### 隐匿配置 (STEALTH_CONFIG)

```javascript
{
    locale: 'zh-CN',
    args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox'
    ]
}
```

## 存储管理

### Profile目录结构

```
~/.webauto/profiles/<profileId>/
├── session_<profileId>.json     # Playwright storage_state (全量状态)
├── fingerprint.json            # 浏览器指纹
└── .lock                     # 并发锁文件
```

### Cookie存储策略

- **自动保存**: 浏览器关闭时自动保存所有状态
- **智能注入**: 根据URL自动匹配并注入Cookie
- **空间优化**: 过滤过期cookies，清理30天前数据
- **完整性验证**: 原子写入，防止数据损坏
- **并发安全**: 文件锁机制，防止多进程冲突

## 安全机制

### 导入防护

通过`security/enforce-imports.js`实现：
- 禁止外部直接导入`camoufox`/`playwright`
- 仅允许`libs/browser`内部使用
- 运行时动态拦截违规导入

### 并发控制

```javascript
// 自动文件锁机制
await browser.start();  // 自动获取锁
await browser.close();  // 自动释放锁
```

## API参考

### BrowserManager

- `getBrowser(config, kwargs)` - 获取浏览器实例
- `startBrowser(config, kwargs)` - 启动并返回实例
- `quickTest(url, waitTime, headless, config)` - 快速测试
- `stealthMode(headless)` - 隐匿模式
- `headlessMode()` - 无头模式
- `closeAll()` - 关闭所有实例

### PlaywrightBrowser

- `start()` - 启动浏览器
- `close()` - 关闭浏览器
- `newPage()` - 创建新页面
- `goto(url, page, waitTime)` - 导航到URL
- `getCookies()` - 获取所有Cookie
- `loadCookies(domain)` - 加载Cookie
- `saveCookies(domain)` - 保存Cookie

### CookieManager

- `injectCookiesForUrl(context, url, profileId)` - 按URL注入Cookie
- `saveCookiesForUrl(context, url, profileId)` - 按URL保存Cookie
- `listDomains()` - 列出所有域
- `clearDomain(domain)` - 清理指定域
- `clearProfile(profileId)` - 清理整个profile

## 最佳实践

### 1. 使用统一入口

✅ **正确**:
```javascript
import { getBrowser } from './libs/browser/browser.js';
```

❌ **错误**:
```javascript
import { chromium } from 'playwright';  // 被安全机制拦截
```

### 2. 配置管理

✅ **推荐**:
```javascript
const browser = await stealthMode();  // 使用预设的隐匿配置
```

❌ **避免**:
```javascript
const browser = new PlaywrightBrowser(customConfig);  // 绕过统一管理
```

### 3. 资源清理

✅ **正确**:
```javascript
try {
    await browser.start();
    // ...使用浏览器
} finally {
    await browser.close();  // 确保资源释放
}
```

### 4. 中文网站

✅ **推荐配置**:
```javascript
// 对于中文网站，使用隐匿模式
const browser = await stealthMode();
```

⚠️ **注意事项**:
- Camoufox已经内置中文支持，只需`--lang=zh-CN`
- 避免复杂的编码配置，保持最小化

## 错误处理

### 异常类型

- `BrowserError` - 通用浏览器错误
- `BrowserNotStartedError` - 浏览器未启动
- `PageNotCreatedError` - 页面创建失败
- `NavigationError` - 导航失败
- `CookieError` - Cookie操作失败
- `TimeoutError` - 超时错误

### 调试技巧

1. **查看状态**: `browser.getStatus()` 获取运行状态
2. **日志输出**: 启用详细日志查看问题
3. **锁文件**: 检查`.lock`文件排查并发问题
4. **存储检查**: 检查`session_*.json`文件完整性

## 版本兼容

- **Node.js**: >= 16.0.0
- **Playwright**: >= 1.40.0
- **Camoufox**: >= 0.1.10
- **系统**: macOS 10.15+, Ubuntu 18.04+, Windows 10+

---

## 重要提醒

⚠️ **必须遵守的规则**:
1. 所有浏览器操作必须通过`libs/browser/browser.js`入口
2. 禁止在任何地方直接导入`playwright`或`camoufox`
3. 使用高级API而不是直接调用底层实现
4. 正确管理浏览器生命周期和资源清理

📞 **技术支持**: 遇到问题时，首先检查是否违反了上述规则