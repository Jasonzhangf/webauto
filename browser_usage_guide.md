# WebAuto 浏览器模块使用指南

## 🔧 快速开始

### 1. 基本使用
```javascript
import { getBrowser, quickTest } from './libs/browser/browser.js';

// 快速测试
await quickTest({ url: 'https://www.baidu.com', waitTime: 2 });

// 手动控制
const browser = getBrowser({ headless: false });
await browser.start();
const page = await browser.newPage();
await page.goto('https://www.example.com');
await browser.close();
```

### 2. 一键启动
```bash
# 启动默认浏览器
npm run browser:oneclick

# 指定URL和配置
npm run browser:oneclick -- --url https://www.baidu.com --profile myprofile

# 重启服务
npm run browser:oneclick -- --restart --url https://weibo.com
```

## 🔍 问题解决

### 浏览器窗口不显示

#### 原因
- macOS安全策略限制Node.js创建GUI窗口
- Terminal缺少必要权限
- Playwright在后台模式下受限

#### 解决方案

**方案1: 手动启动并连接（推荐）**
1. 手动打开Chrome浏览器
2. 使用远程服务连接已打开的页面

```bash
# 启动远程服务
npm run start:browser-service

# 连接到已打开的页面
curl -X POST http://127.0.0.1:7704/command \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"goto","args":{"url":"https://www.baidu.com","keepOpen":true}}'
```

**方案2: 修改系统权限**

1. 系统偏好设置 > 安全性与隐私 > 隐私
2. 开启以下权限：
   - 屏幕录制
   - 完全磁盘访问
3. 重启Terminal

**方案3: 使用headless模式**

```javascript
import { getBrowser } from './libs/browser/browser.js';

const browser = getBrowser({ headless: true });
await browser.start();
// 在后台运行，无GUI但功能正常
```

## 🌐 高级用法

### 隐匿模式
```javascript
import { stealthMode } from './libs/browser/browser.js';

const browser = await stealthMode({ headless: false });
const page = await browser.goto('https://bot.sannysoft.com');
console.log('反检测结果:', await page.evaluate(() => navigator.webdriver));
await browser.close();
```

### Cookie管理
```javascript
import { createBrowser } from './libs/browser/browser.js';

const browser = createBrowser({ 
  profileId: 'session1',
  persistSession: true 
});

await browser.start();
const page = await browser.goto('https://example.com');

// 保存会话
await browser.saveCookies('session1.json');
await browser.close();

// 恢复会话
const browser2 = createBrowser({ profileId: 'session1', persistSession: true });
await browser2.start();
const page2 = await browser2.goto('https://example.com');
// 自动加载已保存的cookies
```

### 远程服务API

#### HTTP API
```bash
# 健康检查
curl http://127.0.0.1:7704/health

# 启动浏览器
ncurl -X POST http://127.0.0.1:7704/command \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"start","args":{"profileId":"test","persistSession":true}}'

# 导航页面
ncurl -X POST http://127.0.0.1:7704/command \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"goto","args":{"url":"https://www.baidu.com","waitTime":2}}'

# 获取cookies
ncurl -X POST http://127.0.0.1:7704/command \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"getCookies"}'

# 截图
ncurl -X POST http://127.0.0.1:7704/command \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"screenshot","args":{"fullPage":true}}'
```

#### SSE事件流
```javascript
const eventSource = new EventSource('http://127.0.0.1:7704/events');

eventSource.onmessage = (event) => {
  console.log('事件:', event.type, event.data);
};

// 监听浏览器状态
eventSource.addEventListener('browser:started', (data) => {
  console.log('浏览器已启动:', data);
});

eventSource.addEventListener('page:navigated', (data) => {
  console.log('页面已导航:', data);
});
```

## 📁 配置文件

### Profile目录结构
```
~/.webauto/profiles/
├── default/
│   ├── fingerprint.json      # 浏览器指纹
│   └── storage-state.json   # 会话状态
├── myprofile/
│   ├── fingerprint.json
│   └── storage-state.json
└── ...
```

### 默认配置
```javascript
// 默认配置
const defaultConfig = {
  headless: false,
  locale: 'zh-CN',
  args: ['--lang=zh-CN']
};

// 隐匿配置
const stealthConfig = {
  headless: false,
  locale: 'zh-CN',
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-dev-tools-animations',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--lang=zh-CN'
  ]
};
```

## 🛠 错误处理

### 常见错误

#### 1. 浏览器启动失败
```javascript
try {
  const browser = await getBrowser();
  await browser.start();
} catch (error) {
  if (error.name === 'BrowserError') {
    console.error('浏览器启动失败:', error.message);
    // 尝试使用headless模式
    const headlessBrowser = await getBrowser({ headless: true });
    await headlessBrowser.start();
  }
}
```

#### 2. 网络错误
```javascript
try {
  await page.goto('https://www.example.com');
} catch (error) {
  if (error.name === 'NavigationError') {
    console.error('导航失败:', error.message);
    // 检查网络连接或增加超时时间
  }
}
```

## 🚀 最佳实践

1. **使用配置文件管理** - 通过profileId管理不同会话
2. **启用会话持久化** - 自动保存和恢复cookies
3. **合理使用隐匿模式** - 在需要反检测时使用
4. **异常处理** - 始终使用try-catch处理浏览器操作
5. **资源清理** - 确保browser.close()被调用

## 📞 支持的网站

- ✅ 百度、微博、知乎等中文网站
- ✅ 现代Web应用
- ✅ 需要登录的网站（通过cookie管理）
- ⚠️ 部分高安全性网站可能被检测
