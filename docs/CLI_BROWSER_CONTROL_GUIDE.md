# WebAuto 浏览器CLI控制系统指南

## 📋 概述

WebAuto CLI控制系统提供完整的命令行浏览器控制能力，支持页面导航、DOM操作、JavaScript执行、截图、Cookie管理等所有常用功能。通过CLI工具，用户可以在不编写代码的情况下完全控制浏览器实例。

## 🏗️ 系统架构

### 架构层次
```
CLI命令行工具
    ↓ HTTP请求
REST API服务 (browser_api.py)
    ↓ 服务调用
BrowserService (browser_service.py)
    ↓ 浏览器控制
Chromium/Camoufox实例
    ↓ DevTools协议
Chrome DevTools (端口9222)
```

### 核心组件

#### 1. CLI工具 (`utils/browser_cli.py`)
- **位置**: `utils/browser_cli.py`
- **功能**: 命令行接口，参数解析，API调用
- **协议**: HTTP/JSON REST API

#### 2. API服务 (`services/browser_api.py`)
- **端口**: 8888 (默认)
- **功能**: RESTful API端点，请求路由，会话管理
- **端点**: `/api/v1/sessions/*`, `/api/v1/service/*`

#### 3. 浏览器服务 (`services/browser_service.py`)
- **功能**: 业务逻辑，浏览器生命周期，控制器管理
- **特性**: 多会话支持，Cookie管理，错误处理

#### 4. 浏览器接口 (`browser_interface/`)
- **Chromium**: `chromium_browser.py` - 标准Chromium实现
- **Camoufox**: `camoufox_browser.py` - 隐匿指纹实现
- **DevTools**: 远程调试端口暴露 (9222)

## 🚀 快速开始

### 1. 启动服务

```bash
# 方法1: 直接启动API服务
python -m services.browser_api

# 方法2: 使用CLI工具启动完整服务栈
python utils/browser_cli.py start --type chromium
```

### 2. 基础使用

```bash
# 创建浏览器会话
python utils/browser_cli.py session --profile default

# 导航到网站
python utils/browser_cli.py navigate https://www.baidu.com

# 获取页面信息
python utils/browser_cli.py info

# 执行JavaScript
python utils/browser_cli.py script "document.title"

# 截图
python utils/browser_cli.py screenshot --filename baidu.png
```

## 📖 完整命令参考

### 服务管理命令

#### `start` - 启动浏览器服务
```bash
python utils/browser_cli.py start [选项]

选项:
  --type {chromium,camoufox}  浏览器类型 (默认: chromium)
  --headless                  无头模式 (默认: false)
  --api-base URL             API服务地址 (默认: http://localhost:8888)

示例:
  python utils/browser_cli.py start --type chromium
  python utils/browser_cli.py start --type camoufox --headless
  python utils/browser_cli.py start --api-base http://localhost:9999
```

### 会话管理命令

#### `session` - 创建浏览器会话
```bash
python utils/browser_cli.py session [选项]

选项:
  --profile TEXT  配置文件ID (默认: default)

示例:
  python utils/browser_cli.py session --profile work
  python utils/browser_cli.py session --profile 1688-crawler
```

#### `sessions` - 列出所有活跃会话
```bash
python utils/browser_cli.py sessions

输出示例:
✅ 共 2 个会话:
  👉 abc123 (default) - active
    def456 (work) - idle
```

#### `close` - 关闭当前会话
```bash
python utils/browser_cli.py close

输出示例:
🔒 关闭会话: abc123
✅ 会话已关闭
```

### 页面操作命令

#### `navigate` - 导航到URL
```bash
python utils/browser_cli.py navigate URL

示例:
  python utils/browser_cli.py navigate https://www.1688.com
  python utils/browser_cli.py navigate https://www.taobao.com
```

#### `info` - 获取页面信息
```bash
python utils/browser_cli.py info

输出示例:
📊 获取页面信息...
📄 标题: 百度一下，你就知道
🌐 URL: https://www.baidu.com
⏱️ 加载时间: 1.23s
```

### DOM操作命令

#### `dom` - 检查DOM元素
```bash
python utils/browser_cli.py dom [选项]

选项:
  --selector TEXT  CSS选择器 (可选，默认检查所有元素)

示例:
  python utils/browser_cli.py dom
  python utils/browser_cli.py dom --selector ".content-title"
  python utils/browser_cli.py dom --selector "form input[type='text']"

输出示例:
🔍 检查DOM: .content-title
✅ 找到 5 个元素:
   1. <div>.content-main - 百度搜索
   2. <h1>.title - 欢迎使用
   3. <a>.link - 更多内容
   ...
```

### 脚本执行命令

#### `script` - 执行JavaScript
```bash
python utils/browser_cli.py script JAVASCRIPT_CODE

示例:
  # 获取页面标题
  python utils/browser_cli.py script "document.title"

  # 计算页面元素数量
  python utils/browser_cli.py script "document.querySelectorAll('.product').length"

  # 提取链接列表
  python utils/browser_cli.py script "
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .slice(0, 10)
      .join('\n')
  "

  # 复杂数据提取
  python utils/browser_cli.py script "
    const products = Array.from(document.querySelectorAll('.product-item'));
    products.map((item, index) => ({
      index: index + 1,
      title: item.querySelector('.title')?.textContent?.trim(),
      price: item.querySelector('.price')?.textContent?.trim(),
      link: item.querySelector('a')?.href
    }))
  "
```

### 数据管理命令

#### `cookies` - 获取Cookies
```bash
python utils/browser_cli.py cookies

输出示例:
🍪 获取Cookies...
✅ 共 15 个Cookies:
   BAIDUID @ .baidu.com
   BIDUPSID @ .baidu.com
   PSTM @ .baidu.com
   ...
```

#### `screenshot` - 页面截图
```bash
python utils/browser_cli.py screenshot [选项]

选项:
  --filename TEXT  保存文件名 (默认: screenshot_{timestamp}.png)

示例:
  python utils/browser_cli.py screenshot
  python utils/browser_cli.py screenshot --filename homepage.png
  python utils/browser_cli.py screenshot --filename debug-$(date +%s).png

输出示例:
📸 截图保存到: homepage.png
✅ 截图成功
```

## 🎯 实际应用场景

### 1. 网站数据抓取

#### 1688商品抓取
```bash
#!/bin/bash
# 启动服务
python utils/browser_cli.py start --type camoufox

# 创建抓取会话
python utils/browser_cli.py session --profile 1688-scraper

# 导航到1688
python utils/browser_cli.py navigate https://www.1688.com

# 搜索关键词
python utils/browser_cli.py script "
  const searchBox = document.querySelector('#q');
  if (searchBox) {
    searchBox.value = 'iPhone 15';
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));

    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
      searchBtn.click();
    }
  }
"

# 等待加载结果
sleep 3

# 提取商品数据
python utils/browser_cli.py script "
  const products = Array.from(document.querySelectorAll('.product-item'));
  const data = products.map((item, index) => ({
    rank: index + 1,
    title: item.querySelector('.title')?.textContent?.trim(),
    price: item.querySelector('.price')?.textContent?.trim(),
    company: item.querySelector('.company')?.textContent?.trim(),
    link: item.querySelector('a')?.href
  }));

  console.log(JSON.stringify(data, null, 2));
  return data;
"

# 截图保存结果
python utils/browser_cli.py screenshot --filename 1688-search-results.png
```

#### 批量URL处理
```bash
#!/bin/bash
URLS=(
  "https://site1.com/page1"
  "https://site1.com/page2"
  "https://site2.com/list"
)

python utils/browser_cli.py start --type chromium
python utils/browser_cli.py session --profile batch-crawler

for url in "${URLS[@]}"; do
  echo "处理: $url"

  # 导航
  python utils/browser_cli.py navigate "$url"

  # 提取数据
  python utils/browser_cli.py script "
    const title = document.title;
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(href => href.startsWith('http'));

    console.log('页面:', title);
    console.log('链接数:', links.length);
    console.log('前5个链接:', links.slice(0, 5));
  "

  # 截图
  filename="screenshot-$(echo $url | sed 's/[^a-zA-Z0-9]/_/g').png"
  python utils/browser_cli.py screenshot --filename "$filename"

  sleep 2
done
```

### 2. 自动化测试

#### 页面功能验证
```bash
#!/bin/bash
# 测试登录页面
python utils/browser_cli.py start --type chromium
python utils/browser_cli.py session --profile test-session

# 导航到登录页
python utils/browser_cli.py navigate https://example.com/login

# 检查必要元素
python utils/browser_cli.py script "
  const checks = {
    usernameField: !!document.querySelector('#username'),
    passwordField: !!document.querySelector('#password'),
    loginButton: !!document.querySelector('#login-btn'),
    forgotPasswordLink: !!document.querySelector('.forgot-password'),
    registerLink: !!document.querySelector('.register-link')
  };

  const results = Object.entries(checks).map(([element, exists]) => ({
    element: element,
    status: exists ? '✅ 存在' : '❌ 缺失'
  }));

  console.log('页面元素检查结果:');
  results.forEach(r => console.log(r.status + ' ' + r.element));

  const allExist = Object.values(checks).every(v => v);
  if (!allExist) {
    throw new Error('页面元素不完整，测试失败');
  }

  console.log('✅ 所有必要元素都存在，页面结构正确');
"

# 表单交互测试
python utils/browser_cli.py script "
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');

  if (username && password) {
    // 测试输入
    username.value = 'testuser@example.com';
    password.value = 'testpass123';

    // 验证输入是否成功
    const usernameValue = username.value;
    const passwordValue = password.value;

    console.log('用户名输入:', usernameValue === 'testuser@example.com' ? '✅ 成功' : '❌ 失败');
    console.log('密码输入:', passwordValue === 'testpass123' ? '✅ 成功' : '❌ 失败');
  }
"

# 截图保存测试结果
python utils/browser_cli.py screenshot --filename login-page-test.png
```

#### 性能测试
```bash
#!/bin/bash
python utils/browser_cli.py start --type chromium
python utils/browser_cli.py session --profile performance-test

# 性能指标收集
python utils/browser_cli.py script "
  const perfData = {
    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
    domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
    resourceCount: performance.getEntriesByType('resource').length,
    memoryUsage: performance.memory ? {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    } : null
  };

  console.log('=== 性能指标 ===');
  console.log('页面加载时间:', perfData.loadTime + 'ms');
  console.log('DOM加载时间:', perfData.domContentLoaded + 'ms');
  console.log('资源数量:', perfData.resourceCount);

  if (perfData.memoryUsage) {
    console.log('内存使用:', {
      已使用: Math.round(perfData.memoryUsage.used / 1024 / 1024) + 'MB',
      总共: Math.round(perfData.memoryUsage.total / 1024 / 1024) + 'MB',
      限制: Math.round(perfData.memoryUsage.limit / 1024 / 1024) + 'MB'
    });
  }
"

# 检查页面大小
python utils/browser_cli.py script "
  const pageInfo = {
    totalElements: document.querySelectorAll('*').length,
    textNodes: document.querySelectorAll('*').length, // 简化计算
    images: document.querySelectorAll('img').length,
    links: document.querySelectorAll('a').length,
    scripts: document.querySelectorAll('script').length,
    stylesheets: document.querySelectorAll('link[rel=\"stylesheet\"]').length
  };

  console.log('=== 页面统计 ===');
  console.log('总元素数:', pageInfo.totalElements);
  console.log('图片数量:', pageInfo.images);
  console.log('链接数量:', pageInfo.links);
  console.log('脚本数量:', pageInfo.scripts);
  console.log('样式表数量:', pageInfo.stylesheets);
"
```

### 3. 调试和问题排查

#### 网站问题诊断
```bash
#!/bin/bash
python utils/browser_cli.py start --type chromium
python utils/browser_cli.py session --profile debug-session

# 基础页面信息
echo "=== 基础页面信息 ==="
python utils/browser_cli.py navigate https://problem-site.com
python utils/browser_cli.py info

# 浏览器环境检查
echo "=== 浏览器环境检查 ==="
python utils/browser_cli.py script "
  const env = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    webdriver: navigator.webdriver,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    screenResolution: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };

  console.log('浏览器环境信息:');
  console.log(JSON.stringify(env, null, 2));
"

# 控制台错误检查
echo "=== 控制台错误检查 ==="
python utils/browser_cli.py script "
  const errors = [];
  const originalError = console.error;
  const originalLog = console.log;

  // 捕获现有错误
  console.error = function(...args) {
    errors.push({
      type: 'error',
      message: args.join(' '),
      timestamp: new Date().toISOString()
    });
    originalError.apply(console, args);
  };

  console.log('检查控制台错误数量:', errors.length);
  if (errors.length > 0) {
    console.log('错误列表:');
    errors.forEach((err, index) => {
      console.log(index + 1 + '.', err.type, '-', err.message, '-', err.timestamp);
    });
  }

  // 恢复原始console
  console.error = originalError;
"

# 网络请求检查
echo "=== 网络请求检查 ==="
python utils/browser_cli.py script "
  const requests = [];
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;

  // 监听fetch请求
  window.fetch = function(...args) {
    requests.push({
      type: 'fetch',
      url: args[0],
      timestamp: new Date().toISOString()
    });
    return originalFetch.apply(this, args);
  };

  console.log('网络请求监控已启动');
  console.log('当前监控到的请求数量:', requests.length);

  // 恢复原始fetch
  setTimeout(() => {
    window.fetch = originalFetch;
    console.log('请求列表:');
    requests.forEach((req, index) => {
      console.log(index + 1 + '.', req.type, '-', req.url);
    });
  }, 5000);
"

# DOM健康检查
echo "=== DOM健康检查 ==="
python utils/browser_cli.py script "
  const healthChecks = {
    hasValidDoctype: document.doctype && document.doctype.name === 'html',
    hasTitle: !!document.title && document.title.length > 0,
    hasViewportMeta: !!document.querySelector('meta[name=\"viewport\"]'),
    hasLangAttribute: document.documentElement.hasAttribute('lang'),
    hasFavicon: !!document.querySelector('link[rel=\"icon\"], link[rel=\"shortcut icon\"]'),
    hasProperHeading: !!document.querySelector('h1, h2, h3'),
    hasNoBrokenImages: Array.from(document.querySelectorAll('img'))
      .filter(img => !img.complete || img.naturalWidth === 0).length === 0
  };

  console.log('DOM健康检查结果:');
  Object.entries(healthChecks).forEach(([check, result]) => {
    console.log(result ? '✅' : '❌', check);
  });

  const healthScore = Object.values(healthChecks).filter(Boolean).length / Object.keys(healthChecks).length * 100;
  console.log('整体健康度:', healthScore + '%');
"

# 截图保存诊断结果
python utils/browser_cli.py screenshot --filename debug-diagnostic.png
```

## 🔧 高级配置

### 1. 自定义API服务地址

```bash
# 连接到远程API服务
python utils/browser_cli.py --api-base http://192.168.1.100:8888 start

# 使用不同的本地端口
python utils/browser_cli.py --api-base http://localhost:9999 session
```

### 2. 浏览器启动参数

```bash
# 通过环境变量或配置文件自定义启动参数
export WEBAUTO_BROWSER_ARGS="--no-sandbox --disable-dev-shm-usage --window-size=1920,1080"
python utils/browser_cli.py start

# 或者修改配置文件
# ~/.webauto/config.json
{
  "browser": {
    "default_args": [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ]
  }
}
```

### 3. DevTools集成

```bash
# 启动浏览器后，可通过Chrome DevTools连接
# 访问: http://localhost:9222

# 支持的功能:
# - 实时DOM检查
# - Console调试
# - Network监控
# - Performance分析
# - Memory分析
```

## 🛠️ API模式

对于更复杂的集成场景，可以直接使用REST API：

### 启动服务
```bash
curl -X POST http://localhost:8888/api/v1/service/start \
  -H "Content-Type: application/json" \
  -d '{
    "browser_type": "chromium",
    "remote_debugging": true,
    "debug_port": 9222
  }'
```

### 创建会话
```bash
curl -X POST http://localhost:8888/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "profile_id": "api-session",
      "viewport": {"width": 1440, "height": 900},
      "timezone": "Asia/Shanghai"
    }
  }'
```

### 页面操作
```bash
# 导航
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "navigate",
    "url": "https://www.baidu.com"
  }'

# 执行脚本
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "execute_script",
    "script": "document.title"
  }'

# DOM检查
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "inspect_dom",
    "selector": ".content"
  }'

# 截图
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/actions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "screenshot",
    "filename": "api-screenshot.png"
  }'
```

## 🐛 错误处理和调试

### 常见错误

#### 1. 连接错误
```bash
❌ 无法连接到浏览器服务: http://localhost:8888
请确保浏览器服务正在运行: python -m services.browser_api
```

**解决方案**:
```bash
# 检查服务是否运行
ps aux | grep browser_api

# 检查端口是否占用
lsof -i :8888

# 启动服务
python -m services.browser_api &
```

#### 2. 会话不存在
```bash
❌ 会话控制器不存在
```

**解决方案**:
```bash
# 列出所有会话
python utils/browser_cli.py sessions

# 创建新会话
python utils/browser_cli.py session
```

#### 3. 浏览器启动失败
```bash
❌ 浏览器服务启动失败
```

**解决方案**:
```bash
# 检查依赖
pip list | grep playwright

# 重装浏览器
playwright install chromium

# 检查系统权限
# 确保有显示权限 (Linux/macOS)
```

### 调试技巧

#### 1. 启用详细日志
```bash
# 设置环境变量
export WEBAUTO_DEBUG=1
export WEBAUTO_LOG_LEVEL=debug

# 运行CLI工具
python utils/browser_cli.py start --type chromium
```

#### 2. 检查浏览器进程
```bash
# 查看浏览器进程
ps aux | grep -E "(chromium|camoufox)"

# 查看DevTools连接
netstat -tlnp | grep 9222
```

#### 3. 验证配置
```bash
# 检查CLI工具配置
python utils/browser_cli.py --help

# 检查API服务状态
curl http://localhost:8888/api/v1/service/status
```

## 📊 性能和最佳实践

### 性能优化建议

1. **合理使用会话**: 创建会话后尽量复用，避免频繁创建销毁
2. **批量操作**: 将多个操作合并到一个脚本中执行，减少网络开销
3. **资源清理**: 及时关闭不需要的会话，释放内存资源
4. **异步执行**: 对于耗时操作，考虑在后台执行

### 最佳实践

1. **错误处理**: 总是检查命令执行结果，处理失败情况
2. **资源管理**: 使用finally块确保资源清理
3. **配置管理**: 使用profile区分不同使用场景
4. **日志记录**: 保存重要的操作日志用于问题排查

### 安全注意事项

1. **Cookie管理**: 谨慎处理敏感Cookie信息
2. **脚本执行**: 避免执行来自不可信源的JavaScript代码
3. **网络访问**: 在生产环境中注意网络安全
4. **权限控制**: 限制API服务的访问权限

## 📚 参考文档

- [浏览器模块README](../libs/browser/README.md) - 浏览器模块详细文档
- [架构设计文档](architecture-summary.md) - 整体系统架构
- [DevTools集成指南](DEVTOOLS_INTEGRATION_GUIDE.md) - 远程调试详细说明
- [API参考文档](../services/browser_api.py) - REST API完整参考

---

## 🆕 版本信息

- **当前版本**: 1.0.0
- **发布日期**: 2025-11-21
- **兼容性**: Python 3.8+, Node.js 16+
- **浏览器支持**: Chromium 90+, Camoufox 0.1+