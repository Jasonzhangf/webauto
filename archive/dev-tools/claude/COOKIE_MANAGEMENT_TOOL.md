# Cookie原子管理工具使用指南

## 概述

Cookie原子管理工具是WebAuto项目中用于处理微博登录状态的核心组件。它提供了一套标准化的API来管理Cookie的加载、验证、保存和登录状态检测，确保所有自动化操作都在有效的登录状态下进行。

## 核心功能

### 统一Cookie管理
- 自动加载和注入Cookie文件
- 验证Cookie有效性和完整性
- 检测登录状态并通过徽章验证
- 自动保存更新的Cookie

### 登录状态验证
- 多维度登录状态检测（徽章、Cookie、页面标题）
- 自动回退到可视化登录
- 持续监控登录状态

### 原子操作保证
- 所有操作都是原子性的，确保一致性
- 完善的错误处理和资源清理
- 标准化的返回格式

## 使用方法

### 基本使用

```javascript
const { requireCookieVerification } = require('./unified-cookie-manager.cjs');

// 强制Cookie验证（标准行为）
const cookieResult = await requireCookieVerification({
  verbose: true,
  headless: true
});

// 现在可以安全地使用浏览器实例进行操作
const { page, context } = cookieResult;
```

### 配置选项

```javascript
const config = {
  cookieFile: './cookies/weibo-cookies.json',  // Cookie文件路径
  headless: false,                             // 是否使用无头模式
  verbose: true,                               // 是否输出详细日志
  forceLoginCheck: true,                       // 是否强制登录检查
  autoCookieSave: true,                        // 是否自动保存Cookie
  timeout: 30000,                              // 超时时间（毫秒）
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',  // 用户代理
  viewport: { width: 1920, height: 1080 }      // 视窗大小
};
```

### 徽章检测选择器

系统使用以下CSS选择器来检测登录状态：

```javascript
const loginIndicators = [
  // 核心用户名指示器
  '.gn_name:not(:empty)',
  '.S_txt1:not(:empty):not([class*="login"])',
  
  // 头像相关
  '[class*="avatar"][href*="/u/"]:not([href*="visitor"])',
  '[class*="avatar"][href*="/home"]:not([href*="newlogin"])',
  
  // 用户信息容器
  '.gn_header_info:has(.gn_name)',
  '[class*="header_info"]:has([href*="/u/"])',
  
  // 个人主页链接
  '[href*="/home"]:not([href*="newlogin"]):not([href*="login"])',
  '[href*="/profile"]:not([href*="newlogin"])',
  '[href*="/u/"]:not([href*="visitor"]):not([href*="login"])'
];
```

## 标准行为流程

### Cookie验证流程
1. 尝试加载现有Cookie文件
2. 将Cookie注入浏览器上下文
3. 导航到微博主页
4. 验证登录状态（徽章+Cookie）

### 登录失败回退流程
1. 启动可视化浏览器（非headless模式）
2. 等待用户手动登录
3. 持续检测登录状态（每5秒一次）
4. 检测到徽章后自动保存Cookie

### 资源管理
1. 自动初始化浏览器实例
2. 管理浏览器上下文和页面
3. 操作完成后自动清理资源

## API参考

### UnifiedCookieManager类

#### 构造函数
```javascript
const manager = new UnifiedCookieManager(config);
```

#### 主要方法

- `forceCookieVerification()` - 强制Cookie验证
- `injectCookies()` - 注入Cookie
- `verifyLoginStatus()` - 验证登录状态
- `forceLogin()` - 强制登录流程
- `autoSaveCookies()` - 自动保存Cookie
- `cleanup()` - 清理资源

### 便利函数

#### requireCookieVerification(config)
强制Cookie验证，所有测试必须调用此函数。

#### autoDetectAndRefreshCookies(config)
自动检测和刷新Cookie。

## 最佳实践

### 所有自动化脚本都应该以Cookie验证开始
```javascript
const { requireCookieVerification } = require('./unified-cookie-manager.cjs');

async function myAutomationScript() {
  // 1. 首先验证Cookie
  const cookieResult = await requireCookieVerification({
    verbose: true,
    headless: true
  });
  
  // 2. 使用验证后的浏览器实例进行操作
  const { page, context } = cookieResult;
  
  // 3. 执行业务逻辑
  await page.goto('https://weibo.com');
  // ... 其他操作
  
  // 4. 清理资源
  await cookieResult.manager.cleanup();
}
```

### 错误处理
```javascript
try {
  const result = await requireCookieVerification(config);
  // 正常流程
} catch (error) {
  console.error('Cookie验证失败:', error.message);
  // 错误处理
}
```

### 资源管理
确保在操作完成后清理资源：
```javascript
const result = await requireCookieVerification(config);
// ... 执行操作
await result.manager.cleanup(); // 清理资源
```

## 故障排除

### 常见问题

1. **Cookie文件不存在**
   - 确保Cookie文件路径正确
   - 运行可视化登录流程创建新Cookie

2. **登录状态验证失败**
   - 检查网络连接
   - 确认Cookie未过期
   - 手动验证登录状态

3. **浏览器启动失败**
   - 确保已安装Playwright浏览器
   - 运行 `npx playwright install` 安装浏览器

### 调试选项

启用详细日志输出：
```javascript
const result = await requireCookieVerification({
  verbose: true,  // 输出详细日志
  headless: false // 显示浏览器窗口便于调试
});
```

## 扩展性

### 自定义配置
可以轻松扩展配置选项以支持不同的需求：
```javascript
const customConfig = {
  ...defaultConfig,
  customSelectors: ['.my-custom-badge'],
  customCookies: ['MY_CUSTOM_COOKIE']
};
```

### 集成到其他系统
Cookie管理工具设计为可独立使用的模块，可以轻松集成到其他自动化系统中。