# WebAuto DevTools集成与远程调试指南

## 📋 概述

WebAuto提供了强大的DevTools集成能力，支持通过Chrome DevTools Protocol对浏览器实例进行实时调试、性能分析和深度控制。本文档详细介绍如何配置和使用DevTools集成功能。

## 🏗️ DevTools架构

### 协议层次
```
Chrome DevTools界面
    ↓ WebSocket连接
Chrome DevTools Protocol (CDP)
    ↓ HTTP/JSON
Browser实例 (Chromium/Camoufox)
    ↓ 内部API
Playwright/Camoufox API
```

### 核心组件

#### 1. DevTools服务端
- **协议**: Chrome DevTools Protocol (CDP)
- **端口**: 9222 (默认)
- **通信**: WebSocket over HTTP
- **功能**: 页面调试、性能分析、网络监控

#### 2. 浏览器启动器
- **位置**: `browser_interface/chromium_browser.py`
- **功能**: 暴露远程调试端口
- **配置**: `--remote-debugging-port=9222`
- **安全**: 绑定地址和访问控制

#### 3. CLI集成
- **工具**: `utils/browser_cli.py`
- **命令**: `start --type chromium --remote-debugging`
- **状态**: 自动检测和连接DevTools
- **调试**: 实时状态反馈

## 🚀 快速配置

### 1. 基础启动

```bash
# 方法1: 使用CLI工具启动 (推荐)
python utils/browser_cli.py start --type chromium

# 方法2: 手动启动API服务
python -m services.browser_api

# 方法3: 直接使用Python接口
from browser_interface.chromium_browser import ChromiumBrowserWrapper
browser = ChromiumBrowserWrapper({
    "remote_debugging": True,
    "debug_port": 9222
})
```

### 2. DevTools连接

#### Chrome浏览器连接
1. 打开Chrome浏览器
2. 访问: `http://localhost:9222`
3. 点击检查到的标签页链接
4. DevTools界面自动打开

#### VSCode连接
1. 安装"Debugger for Chrome"扩展
2. 配置连接地址: `http://localhost:9222`
3. 设置断点进行调试

#### 其他工具连接
```bash
# curl命令测试连接
curl http://localhost:9222/json

# 返回示例:
[{
  "id": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "title": "WebAuto - Page 1",
  "url": "https://www.baidu.com",
  "type": "page",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
}]
```

## 📖 DevTools功能详解

### 1. Elements面板 (DOM检查)

#### 实时DOM检查
```bash
# 启动浏览器并连接DevTools
python utils/browser_cli.py start --type chromium
python utils/browser_cli.py session --profile debug
python utils/browser_cli.py navigate https://www.baidu.com

# 在Chrome DevTools中:
# 1. 访问 http://localhost:9222
# 2. 点击页面链接打开DevTools
# 3. 在Elements面板中检查DOM
# 4. 实时编辑HTML/CSS
```

#### CLI辅助检查
```bash
# 使用CLI工具辅助DOM检查
python utils/browser_cli.py dom --selector ".content-wrapper"
python utils/browser_cli.py script "document.querySelector('#kw').value"
```

### 2. Console面板 (脚本调试)

#### 实时脚本执行
```bash
# 在DevTools Console中执行:
console.log(navigator.userAgent);
console.log(performance.timing);
console.log(document.cookie);

# 复杂脚本:
const products = Array.from(document.querySelectorAll('.product'));
products.forEach((item, index) => {
  console.log(`商品${index + 1}:`, item.textContent.trim());
});
```

#### CLI脚本同步
```bash
# CLI执行的脚本会在DevTools Console中显示
python utils/browser_cli.py script "console.log('来自CLI的消息')"
```

### 3. Network面板 (网络监控)

#### 请求监控
```bash
# 启动网络监控脚本
python utils/browser_cli.py script "
  const requests = [];
  const originalFetch = window.fetch;

  window.fetch = function(...args) {
    const start = performance.now();

    return originalFetch.apply(this, args).then(response => {
      const duration = performance.now() - start;

      requests.push({
        url: args[0],
        method: args[1]?.method || 'GET',
        status: response.status,
        duration: duration.toFixed(2) + 'ms',
        timestamp: new Date().toISOString()
      });

      console.log('请求:', args[0], '-', response.status, '-', duration.toFixed(2) + 'ms');
      return response;
    });
  };

  // 5秒后输出请求统计
  setTimeout(() => {
    console.log('网络请求统计:');
    console.table(requests.slice(0, 10));
  }, 5000);
"
```

#### 资源分析
```bash
# 资源加载分析
python utils/browser_cli.py script "
  const resources = performance.getEntriesByType('resource');

  const stats = {
    totalRequests: resources.length,
    totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
    slowRequests: resources.filter(r => r.duration > 1000).length,
    failedRequests: resources.filter(r => !r.responseEnd).length,
    domains: [...new Set(resources.map(r => new URL(r.name).hostname))]
  };

  console.log('=== 网络资源统计 ===');
  console.log('总请求数:', stats.totalRequests);
  console.log('总传输量:', (stats.totalSize / 1024).toFixed(2) + ' KB');
  console.log('慢请求(>1s):', stats.slowRequests);
  console.log('失败请求:', stats.failedRequests);
  console.log('涉及的域名:', stats.domains.join(', '));

  console.log('最慢的5个请求:');
  resources
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .forEach((r, i) => {
      console.log(`${i+1}. ${r.name} - ${r.duration.toFixed(2)}ms`);
    });
"
```

### 4. Performance面板 (性能分析)

#### 性能数据收集
```bash
# 性能指标收集脚本
python utils/browser_cli.py script "
  const perfData = {
    navigation: performance.timing,
    paint: performance.getEntriesByType('paint'),
    navigationEntries: performance.getEntriesByType('navigation'),
    memory: performance.memory,
    resources: performance.getEntriesByType('resource')
  };

  const timing = perfData.navigation;
  const loadTime = timing.loadEventEnd - timing.navigationStart;
  const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

  console.log('=== 页面性能指标 ===');
  console.log('页面加载时间:', loadTime + 'ms');
  console.log('DOM准备时间:', domReady + 'ms');
  console.log('首次绘制:', perfData.paint[0]?.startTime + 'ms');
  console.log('首次内容绘制:', perfData.paint[1]?.startTime + 'ms');

  if (perfData.memory) {
    console.log('=== 内存使用情况 ===');
    console.log('已使用:', Math.round(perfData.memory.usedJSHeapSize / 1024 / 1024) + 'MB');
    console.log('总计:', Math.round(perfData.memory.totalJSHeapSize / 1024 / 1024) + 'MB');
    console.log('限制:', Math.round(perfData.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB');
  }

  // 资源加载时间分析
  const resources = perfData.resources;
  const categories = {
    script: resources.filter(r => r.name.endsWith('.js')),
    style: resources.filter(r => r.name.endsWith('.css') || r.initiatorType === 'link'),
    image: resources.filter(r => r.initiatorType === 'img'),
    xhr: resources.filter(r => r.initiatorType === 'xmlhttprequest'),
    fetch: resources.filter(r => r.initiatorType === 'fetch')
  };

  console.log('=== 资源加载分析 ===');
  Object.entries(categories).forEach(([type, items]) => {
    if (items.length > 0) {
      const totalTime = items.reduce((sum, item) => sum + item.duration, 0);
      console.log(`${type}: ${items.length}个文件, 总计${totalTime.toFixed(2)}ms`);
    }
  });
"
```

#### Core Web Vitals监控
```bash
# Core Web Vitals指标
python utils/browser_cli.py script "
  // 模拟Core Web Vitals测量
  const measureWebVitals = () => {
    // LCP (Largest Contentful Paint)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log('LCP:', lastEntry.startTime.toFixed(2) + 'ms');
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // FID (First Input Delay)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        console.log('FID:', entry.processingStart - entry.startTime.toFixed(2) + 'ms');
      });
    }).observe({ entryTypes: ['first-input'] });

    // CLS (Cumulative Layout Shift)
    let clsValue = 0;
    new PerformanceObserver((entryList) => {
      entryList.getEntries().forEach(entry => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          console.log('CLS:', clsValue.toFixed(4));
        }
      });
    }).observe({ entryTypes: ['layout-shift'] });
  };

  measureWebVitals();

  // 5秒后输出总结
  setTimeout(() => {
    console.log('=== Core Web Vitals 监控完成 ===');
    console.log('请查看上述LCP、FID、CLS数值');
    console.log('LCP < 2.5s, FID < 100ms, CLS < 0.1 为良好');
  }, 5000);
"
```

### 5. Memory面板 (内存分析)

#### 内存监控
```bash
# 内存使用详细分析
python utils/browser_cli.py script "
  const memoryAnalysis = () => {
    const memory = performance.memory;
    if (!memory) {
      console.log('浏览器不支持内存监控');
      return;
    }

    const analysis = {
      usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      limitMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
      usagePercent: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1),
      heapGrowth: memory.usedJSHeapSize - memory.totalJSHeapSize
    };

    console.log('=== 内存分析结果 ===');
    console.log('已使用:', analysis.usedMB + 'MB');
    console.log('总量:', analysis.totalMB + 'MB');
    console.log('限制:', analysis.limitMB + 'MB');
    console.log('使用率:', analysis.usagePercent + '%');
    console.log('堆增长:', (analysis.heapGrowth / 1024).toFixed(2) + 'KB');

    // 内存健康评估
    let health = '良好';
    if (analysis.usagePercent > 80) {
      health = '警告 - 使用率过高';
    } else if (analysis.usagePercent > 60) {
      health = '注意 - 使用率偏高';
    }

    console.log('内存状态:', health);

    return analysis;
  };

  // 立即分析
  memoryAnalysis();

  // 模拟内存压力测试
  console.log('开始内存压力测试...');
  const memoryArray = [];

  for (let i = 0; i < 1000; i++) {
    memoryArray.push(new Array(10000).fill(i));
  }

  // 再次分析
  setTimeout(() => {
    console.log('压力测试后内存分析:');
    memoryAnalysis();

    // 清理内存
    memoryArray.length = 0;
    console.log('清理内存数组');

    // 最终分析
    setTimeout(() => {
      console.log('内存清理后分析:');
      memoryAnalysis();
    }, 1000);
  }, 2000);
"
```

### 6. Application面板 (存储管理)

#### Cookie和Storage分析
```bash
# 存储数据详细分析
python utils/browser_cli.py script "
  const storageAnalysis = {
    cookies: document.cookie ? document.cookie.split('; ').map(c => {
      const [key, value] = c.split('=');
      return { key: key?.trim(), value: value?.trim() };
    }).filter(c => c.key) : [],
    localStorage: Object.keys(localStorage).map(key => ({
      key,
      value: localStorage[key],
      size: new Blob([localStorage[key]]).size
    })),
    sessionStorage: Object.keys(sessionStorage).map(key => ({
      key,
      value: sessionStorage[key],
      size: new Blob([sessionStorage[key]]).size
    }))
  };

  console.log('=== 存储数据分析 ===');

  // Cookie分析
  console.log('Cookies (', storageAnalysis.cookies.length, '个):');
  storageAnalysis.cookies.forEach(cookie => {
    console.log(`  ${cookie.key}: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? '...' : ''}`);
  });

  // localStorage分析
  const lsTotal = storageAnalysis.localStorage.reduce((sum, item) => sum + item.size, 0);
  console.log('localStorage (', storageAnalysis.localStorage.length, '项, ', (lsTotal/1024).toFixed(2), 'KB):');
  storageAnalysis.localStorage.slice(0, 5).forEach(item => {
    console.log(`  ${item.key}: ${(item.size/1024).toFixed(2)}KB`);
  });

  // sessionStorage分析
  const ssTotal = storageAnalysis.sessionStorage.reduce((sum, item) => sum + item.size, 0);
  console.log('sessionStorage (', storageAnalysis.sessionStorage.length, '项, ', (ssTotal/1024).toFixed(2), 'KB):');
  storageAnalysis.sessionStorage.slice(0, 5).forEach(item => {
    console.log(`  ${item.key}: ${(item.size/1024).toFixed(2)}KB`);
  });

  // 检测WebSQL和IndexedDB
  if (window.indexedDB) {
    const request = indexedDB.open('database-info');
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (db.objectStoreNames.length > 0) {
        console.log('IndexedDB数据库:', Array.from(db.objectStoreNames).join(', '));
      } else {
        console.log('IndexedDB: 无数据库');
      }
      db.close();
    };
  }

  // 检测Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      console.log('Service Workers:', registrations.length);
      registrations.forEach(reg => {
        console.log(`  ${reg.scope}: ${reg.active ? 'Active' : 'Inactive'}`);
      });
    });
  }
"
```

## 🔧 高级DevTools功能

### 1. 自定义DevTools面板

#### 创建自定义面板
```bash
# 注入自定义DevTools面板脚本
python utils/browser_cli.py script "
  // 创建自定义面板
  (function() {
    const createCustomPanel = () => {
      const panelHTML = \`
        <div id='webauto-custom-panel' style='padding: 10px; font-family: monospace;'>
          <h3>WebAuto 自定义工具</h3>
          <div style='margin: 10px 0;'>
            <button onclick='analyzePage()' style='margin-right: 10px;'>分析页面</button>
            <button onclick='exportData()'>导出数据</button>
          </div>
          <div id='panel-content' style='margin-top: 10px; border: 1px solid #ccc; padding: 10px; min-height: 100px;'>
            <p>点击上方按钮执行功能</p>
          </div>
        </div>
      \`;

      // 创建面板容器
      const panelContainer = document.createElement('div');
      panelContainer.innerHTML = panelHTML;
      panelContainer.style.cssText = \`
        position: fixed;
        top: 10px;
        right: 10px;
        width: 300px;
        background: white;
        border: 2px solid #333;
        border-radius: 5px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 999999;
        font-size: 12px;
      \`;

      document.body.appendChild(panelContainer);

      // 添加功能函数
      window.analyzePage = function() {
        const analysis = {
          title: document.title,
          url: window.location.href,
          elements: document.querySelectorAll('*').length,
          images: document.querySelectorAll('img').length,
          links: document.querySelectorAll('a').length,
          forms: document.querySelectorAll('form').length,
          scripts: document.querySelectorAll('script').length
        };

        const content = document.getElementById('panel-content');
        content.innerHTML = \`
          <h4>页面分析结果</h4>
          <p><strong>标题:</strong> \${analysis.title}</p>
          <p><strong>URL:</strong> \${analysis.url}</p>
          <p><strong>总元素:</strong> \${analysis.elements}</p>
          <p><strong>图片:</strong> \${analysis.images}</p>
          <p><strong>链接:</strong> \${analysis.links}</p>
          <p><strong>表单:</strong> \${analysis.forms}</p>
          <p><strong>脚本:</strong> \${analysis.scripts}</p>
        \`;
      };

      window.exportData = function() {
        const data = {
          title: document.title,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          content: document.documentElement.outerHTML
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'page-data.json';
        a.click();

        URL.revokeObjectURL(url);

        const content = document.getElementById('panel-content');
        content.innerHTML = '<p>页面数据已导出</p>';
      };
    };

    // 延迟创建面板，确保页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createCustomPanel);
    } else {
      createCustomPanel();
    }
  })();
"
```

### 2. 实时监控面板

#### 性能监控面板
```bash
# 创建实时性能监控
python utils/browser_cli.py script "
  (function() {
    const createMonitorPanel = () => {
      const panel = document.createElement('div');
      panel.id = 'webauto-performance-monitor';
      panel.style.cssText = \`
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 250px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 11px;
        z-index: 999999;
      \`;

      document.body.appendChild(panel);

      const updateStats = () => {
        const memory = performance.memory;
        const timing = performance.timing;

        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const memoryUsage = memory ? (memory.usedJSHeapSize / 1024 / 1024).toFixed(1) : 'N/A';

        panel.innerHTML = \`
          <h4 style='margin: 0 0 10px 0;'>性能监控</h4>
          <div>加载时间: <span style='color: \${loadTime > 3000 ? '#ff6b6b' : '#51cf66'}'>\${loadTime}ms</span></div>
          <div>内存使用: <span style='color: #51cf66'>\${memoryUsage}MB</span></div>
          <div>元素数量: <span style='color: #74c0fc'>\${document.querySelectorAll('*').length}</span></div>
          <div>图片数量: <span style='color: #74c0fc'>\${document.querySelectorAll('img').length}</span></div>
          <div>更新时间: <span style='color: #ffd93d'>\${new Date().toLocaleTimeString()}</span></div>
        \`;
      };

      // 初始更新
      updateStats();

      // 每秒更新
      setInterval(updateStats, 1000);

      // 添加关闭按钮
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        color: white;
        font-size: 16px;
        cursor: pointer;
      `;
      closeBtn.onclick = () => panel.remove();
      panel.appendChild(closeBtn);
    };

    createMonitorPanel();
  })();
"
```

### 3. 网络请求拦截器

#### 请求/响应拦截
```bash
# 创建网络请求监控面板
python utils/browser_cli.py script "
  (function() {
    const requests = [];
    let panel = null;

    const createNetworkPanel = () => {
      panel = document.createElement('div');
      panel.id = 'webauto-network-monitor';
      panel.style.cssText = \`
        position: fixed;
        top: 10px;
        left: 10px;
        width: 400px;
        height: 300px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 10px;
        z-index: 999999;
        overflow-y: auto;
      \`;

      document.body.appendChild(panel);
      updatePanel();
    };

    const updatePanel = () => {
      if (!panel) return;

      const recentRequests = requests.slice(-10).reverse();
      const html = recentRequests.map(req =>
        \`<div style='margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #555;'>
          <div style='color: #74c0fc; font-weight: bold;'>· \${req.method} \${req.url}</div>
          <div style='color: #ffd93d;'>状态: \${req.status} | 耗时: \${req.duration}ms</div>
          \${req.error ? \`<div style='color: #ff6b6b;'>错误: \${req.error}</div>\` : ''}
        </div>\`
      ).join('');

      panel.innerHTML = \`
        <h4 style='margin: 0 0 10px 0;'>网络监控 (最近10个)</h4>
        \${html}
        <button onclick='clearRequests()' style='margin-top: 10px; padding: 5px;'>清空</button>
      \`;

      window.clearRequests = () => {
        requests.length = 0;
        updatePanel();
      };
    };

    // 拦截fetch请求
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const startTime = performance.now();
      const url = args[0];
      const options = args[1] || {};

      try {
        const response = await originalFetch.apply(this, args);
        const endTime = performance.now();

        requests.push({
          method: options.method || 'GET',
          url: url,
          status: response.status,
          duration: Math.round(endTime - startTime),
          timestamp: new Date().toISOString(),
          error: null
        });

        updatePanel();
        return response;
      } catch (error) {
        const endTime = performance.now();

        requests.push({
          method: options.method || 'GET',
          url: url,
          status: 0,
          duration: Math.round(endTime - startTime),
          timestamp: new Date().toISOString(),
          error: error.message
        });

        updatePanel();
        throw error;
      }
    };

    // 拦截XHR请求
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      let startTime = null;
      let method = '';
      let url = '';

      xhr.open = function(...args) {
        method = args[0];
        url = args[1];
        return originalOpen.apply(this, args);
      };

      xhr.send = function(...args) {
        startTime = performance.now();

        const originalOnReadyStateChange = xhr.onreadystatechange;
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && startTime) {
            const endTime = performance.now();

            requests.push({
              method: method,
              url: url,
              status: xhr.status,
              duration: Math.round(endTime - startTime),
              timestamp: new Date().toISOString(),
              error: xhr.status >= 400 ? 'HTTP ' + xhr.status : null
            });

            updatePanel();
          }

          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        };

        return originalSend.apply(this, args);
      };

      return xhr;
    };

    // 延迟创建面板
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createNetworkPanel);
    } else {
      createNetworkPanel();
    }

    console.log('网络监控面板已启动');
  })();
"
```

## 🔌 DevTools API编程

### 1. 直接CDP连接

#### WebSocket连接示例
```bash
# 创建CDP连接脚本
cat > connect_devtools.py << 'EOF'
import asyncio
import websockets
import json
import aiohttp

async def connect_to_devtools():
    # 获取目标页面信息
    async with aiohttp.ClientSession() as session:
        async with session.get('http://localhost:9222/json') as response:
            targets = await response.json()

            if not targets:
                print("没有可用的页面")
                return

            # 连接到第一个目标页面
            target = targets[0]
            ws_url = target['webSocketDebuggerUrl']
            print(f"连接到: {target['title']} - {ws_url}")

    # 建立WebSocket连接
    async with websockets.connect(ws_url) as websocket:
        print("DevTools连接成功")

        # 启用Runtime和Page域
        await websocket.send(json.dumps({
            "id": 1,
            "method": "Runtime.enable"
        }))

        await websocket.send(json.dumps({
            "id": 2,
            "method": "Page.enable"
        }))

        # 监听消息
        async for message in websocket:
            data = json.loads(message)

            if 'method' in data:
                print(f"事件: {data['method']}")
            elif 'result' in data:
                print(f"响应: {data['id']} - 成功")
            elif 'error' in data:
                print(f"错误: {data['error']}")

if __name__ == "__main__":
    asyncio.run(connect_to_devtools())
EOF

# 运行连接脚本
python connect_devtools.py
```

### 2. CDP命令执行

#### 执行CDP方法
```bash
# CDP命令执行示例
cat > cdp_commands.py << 'EOF'
import asyncio
import websockets
import json

class DevToolsClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.websocket = None
        self.command_id = 1

    async def connect(self):
        self.websocket = await websockets.connect(self.ws_url)
        print("CDP连接已建立")

    async def execute(self, method, params=None):
        command = {
            "id": self.command_id,
            "method": method,
            "params": params or {}
        }

        await self.websocket.send(json.dumps(command))
        self.command_id += 1

    async def evaluate_javascript(self, script):
        await self.execute("Runtime.evaluate", {
            "expression": script
        })

    async def navigate_to(self, url):
        await self.execute("Page.navigate", {
            "url": url
        })

    async def capture_screenshot(self):
        await self.execute("Page.captureScreenshot")
        # 等待响应...
        response = await self.websocket.recv()
        data = json.loads(response)
        return data.get('result', {}).get('data')

    async def close(self):
        if self.websocket:
            await self.websocket.close()

async def main():
    client = DevToolsClient("ws://localhost:9222/devtools/page/...")
    await client.connect()

    # 执行JavaScript
    await client.evaluate_javascript("document.title")

    # 导航到新页面
    await client.navigate_to("https://www.example.com")

    # 截图
    screenshot_data = await client.capture_screenshot()
    print(f"截图大小: {len(screenshot_data)} bytes")

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
EOF

python cdp_commands.py
```

## 🛠️ 故障排查

### 1. 连接问题

#### 检查DevTools端口
```bash
# 检查9222端口状态
lsof -i :9222
netstat -tlnp | grep 9222

# 检查浏览器进程
ps aux | grep -E "(chromium|chrome)" | grep -v grep

# 重启DevTools服务
python utils/browser_cli.py start --type chromium --remote-debugging
```

#### 验证DevTools可用性
```bash
# 测试HTTP连接
curl -s http://localhost:9222/json | jq 'length'

# 检查目标页面
curl -s http://localhost:9222/json | jq '.[] | {title, url, id}'

# 测试WebSocket连接
python -c "
import asyncio
import websockets
async def test():
    try:
        async with websockets.connect('ws://localhost:9222/devtools/page/...') as ws:
            print('WebSocket连接正常')
    except Exception as e:
        print(f'WebSocket连接失败: {e}')
asyncio.run(test())
"
```

### 2. 性能问题

#### DevTools性能优化
```bash
# 启动性能优化模式
python utils/browser_cli.py script "
  // DevTools性能优化
  console.log('启用DevTools性能优化...');

  // 禁用不必要的功能
  if (window.performance && window.performance.mark) {
    // 禁用性能标记以减少开销
    const originalMark = performance.mark;
    performance.mark = function(name) {
      if (!name.startsWith('DevTools-')) {
        return originalMark.call(this, name);
      }
    };
  }

  // 优化console输出
  const originalConsole = {};
  ['log', 'info', 'warn', 'error'].forEach(method => {
    originalConsole[method] = console[method];

    let callCount = 0;
    console[method] = function(...args) {
      callCount++;

      // 限制输出频率
      if (callCount % 100 === 0 || method === 'error') {
        originalConsole[method].apply(console, args);
      }
    };
  });

  console.log('性能优化已启用');
"
```

### 3. 内存泄漏检测

#### 内存泄漏监控
```bash
# 内存泄漏检测脚本
python utils/browser_cli.py script "
  (function() {
    let memorySnapshots = [];
    let isMonitoring = false;

    const takeSnapshot = () => {
      if (!performance.memory) return null;

      return {
        timestamp: Date.now(),
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    };

    const startMemoryMonitoring = () => {
      if (isMonitoring) return;
      isMonitoring = true;

      console.log('开始内存泄漏监控...');

      // 采集初始快照
      const initial = takeSnapshot();
      if (initial) {
        memorySnapshots.push(initial);
      }

      // 每10秒采集一次
      const interval = setInterval(() => {
        const snapshot = takeSnapshot();
        if (snapshot) {
          memorySnapshots.push(snapshot);

          // 保留最近30个快照
          if (memorySnapshots.length > 30) {
            memorySnapshots.shift();
          }

          // 检测内存增长趋势
          if (memorySnapshots.length >= 5) {
            const recent = memorySnapshots.slice(-5);
            const growth = recent[4].used - recent[0].used;
            const growthRate = growth / 5; // 每秒增长率

            if (growthRate > 1024 * 1024) { // 1MB/s
              console.warn('⚠️ 检测到内存快速增长，可能存在内存泄漏');
              console.log('增长率:', (growthRate / 1024 / 1024).toFixed(2), 'MB/s');
            }
          }
        }
      }, 10000);

      // 5分钟后停止监控
      setTimeout(() => {
        clearInterval(interval);
        isMonitoring = false;

        console.log('内存监控完成，分析结果...');
        analyzeMemoryTrends();
      }, 300000); // 5分钟
    };

    const analyzeMemoryTrends = () => {
      if (memorySnapshots.length < 2) {
        console.log('数据不足，无法分析');
        return;
      }

      const first = memorySnapshots[0];
      const last = memorySnapshots[memorySnapshots.length - 1];
      const totalGrowth = last.used - first.used;
      const avgGrowth = totalGrowth / (last.timestamp - first.timestamp) * 1000; // bytes/second

      console.log('=== 内存使用分析 ===');
      console.log('初始内存:', (first.used / 1024 / 1024).toFixed(2), 'MB');
      console.log('最终内存:', (last.used / 1024 / 1024).toFixed(2), 'MB');
      console.log('总增长:', (totalGrowth / 1024 / 1024).toFixed(2), 'MB');
      console.log('平均增长率:', (avgGrowth / 1024 / 1024).toFixed(2), 'MB/s');

      // 内存健康评估
      const usagePercent = (last.used / last.limit) * 100;
      let health = '良好';

      if (usagePercent > 80) {
        health = '危险 - 内存使用率过高';
      } else if (usagePercent > 60) {
        health = '警告 - 内存使用率偏高';
      } else if (avgGrowth > 1024 * 1024) { // 1MB/s
        health = '注意 - 内存持续增长';
      }

      console.log('内存健康:', health);
      console.log('使用率:', usagePercent.toFixed(1), '%');
    };

    // 启动监控
    startMemoryMonitoring();

    // 暴露控制函数
    window.memoryMonitor = {
      start: startMemoryMonitoring,
      stop: () => isMonitoring = false,
      snapshot: takeSnapshot,
      analyze: analyzeMemoryTrends
    };

    console.log('内存监控器已就绪，使用 memoryMonitor.start() 开始监控');
  })();
"
```

## 📚 参考文档

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) - 官方协议文档
- [DevTools Extensions](https://developer.chrome.com/docs/extensions) - 扩展开发指南
- [Web Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance) - 性能API参考
- [JavaScript Debugging](https://developer.chrome.com/docs/devtools/javascript) - JavaScript调试指南

---

## 🔗 相关工具

- [CLI控制系统指南](CLI_BROWSER_CONTROL_GUIDE.md) - 命令行工具使用
- [浏览器模块文档](../libs/browser/README.md) - 浏览器接口说明
- [API参考文档](../services/browser_api.py) - REST API文档

---

**版本**: 1.0.0
**更新**: 2025-11-21
**兼容**: Chrome 90+, Chromium 90+