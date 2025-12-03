#!/usr/bin/env node
// 防风控和错误恢复机制
import { randomInt } from 'node:crypto';

// 生成随机的用户代理字符串
function getRandomUserAgent() {
  const agents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
  ];
  return agents[randomInt(agents.length)];
}

// 生成随机的视口大小
function getRandomViewport() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 }
  ];
  return viewports[randomInt(viewports.length)];
}

// 生成随机的时区
function getRandomTimezone() {
  const timezones = [
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Taipei',
    'Asia/Seoul',
    'Asia/Tokyo',
    'UTC+8'
  ];
  return timezones[randomInt(timezones.length)];
}

// 生成随机的语言设置
function getRandomLocale() {
  const locales = [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'zh-CN,zh-Hans;q=0.9',
    'zh-TW,zh;q=0.9,en;q=0.8',
    'en-US,en;q=0.9,zh-CN;q=0.8'
  ];
  return locales[randomInt(locales.length)];
}

// 随机延迟函数
function randomDelay(min = 100, max = 500) {
  return new Promise(resolve => {
    const delay = randomInt(min, max);
    setTimeout(resolve, delay);
  });
}

// 模拟人类行为的鼠标移动
function getHumanMouseMove() {
  return `
    function simulateHumanMovement(element) {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // 创建贝塞尔曲线路径
      const startX = window.pageXOffset + Math.random() * window.innerWidth;
      const startY = window.pageYOffset + Math.random() * window.innerHeight;
      
      const steps = 10 + Math.floor(Math.random() * 10);
      let currentStep = 0;
      
      const move = () => {
        if (currentStep >= steps) return;
        
        const progress = currentStep / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        
        const currentX = startX + (centerX - startX) * easeProgress;
        const currentY = startY + (centerY - startY) * easeProgress;
        
        const event = new MouseEvent('mousemove', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: currentX,
          clientY: currentY
        });
        
        document.dispatchEvent(event);
        currentStep++;
        
        if (currentStep < steps) {
          setTimeout(move, 20 + Math.random() * 30);
        }
      };
      
      move();
    }
  `;
}

// 防检测脚本注入
function getAntiDetectionScript() {
  return `
    // 反自动化检测脚本
    (function() {
      // 移除webdriver属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // 修改chrome对象
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // 修改权限API
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // 修改插件数组
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          }
        ],
      });
      
      // 修改语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
      
      // 添加一些正常的交互事件
      let lastMoveTime = Date.now();
      document.addEventListener('mousemove', () => {
        lastMoveTime = Date.now();
      });
      
      // 定期检查鼠标活动
      setInterval(() => {
        const timeSinceMove = Date.now() - lastMoveTime;
        if (timeSinceMove > 60000) { // 1分钟无移动
          // 模拟轻微鼠标移动
          const event = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
          });
          document.dispatchEvent(event);
          lastMoveTime = Date.now();
        }
      }, 30000);
      
      console.log('[WebAuto] Anti-detection script loaded');
    })();
  `;
}

// 页面加载等待策略
function getWaitStrategies() {
  return {
    // 等待网络空闲
    waitForNetworkIdle: `(async () => {
      const maxWaitTime = 10000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const performanceEntries = performance.getEntriesByType('resource');
        const recentRequests = performanceEntries.filter(
          entry => Date.now() - entry.fetchStart < 1000
        );
        
        if (recentRequests.length === 0) {
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return false;
    })()`,
    
    // 等待DOM稳定
    waitForDOMStable: `(async () => {
      let lastHTMLLength = document.documentElement.outerHTML.length;
      let stableCount = 0;
      
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const currentHTMLLength = document.documentElement.outerHTML.length;
        
        if (Math.abs(currentHTMLLength - lastHTMLLength) < 100) {
          stableCount++;
          if (stableCount >= 3) return true;
        } else {
          stableCount = 0;
        }
        
        lastHTMLLength = currentHTMLLength;
      }
      return true;
    })()`,
    
    // 等待关键元素
    waitForKeyElements: `(async () => {
      const selectors = [
        'body',
        '.main',
        '.container',
        '.content',
        '[role="main"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetHeight > 0) {
          return true;
        }
      }
      
      return document.body.offsetHeight > 0;
    })()`
  };
}

export {
  getRandomUserAgent,
  getRandomViewport,
  getRandomTimezone,
  getRandomLocale,
  randomDelay,
  getHumanMouseMove,
  getAntiDetectionScript,
  getWaitStrategies
};
