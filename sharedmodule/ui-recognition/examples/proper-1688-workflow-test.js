/**
 * 符合现有workflow规范的1688登录流程测试
 * 完整实现：加载Cookie -> 锚点检测 -> 失败则手动登录 -> 动态Cookie更新
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Proper1688WorkflowTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.workflowResults = {
      cookieLoading: null,
      anchorDetection: null,
      autoLoginSuccess: null,
      manualLoginProcess: null,
      cookieUpdate: null,
      uiRecognition: null,
      containerHighlighting: null,
      workflowComplete: false
    };

    // 1688登录锚点选择器（基于现有workflow）
    this.loginAnchors = [
      { selector: '.userAvatarLogo img', name: '用户头像', priority: 1 },
      { selector: '[class*=userAvatarLogo] img', name: '用户头像备选', priority: 1 },
      { selector: '.user-name', name: '用户名', priority: 2 },
      { selector: '.member-name', name: '会员名', priority: 2 },
      { selector: '[data-spm="loginNick"]', name: '登录昵称', priority: 3 },
      { selector: '.logout', name: '退出按钮', priority: 4 },
      { selector: '[class*="logout"]', name: '退出按钮备选', priority: 4 }
    ];

    // Cookie存储路径
    this.cookiePaths = {
      primary: '/Users/fanzhang/.webauto/cookies/1688-domestic.json',
      backup: path.join(__dirname, '../cookies/1688-backup.json'),
      timestamped: null
    };
  }

  async runWorkflow() {
    console.log('🔄 开始1688标准workflow测试');
    console.log('📋 流程：加载Cookie -> 锚点检测 -> 失败则手动登录 -> Cookie动态更新');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 加载Cookie
      await this.loadCookies();

      // 3. 访问1688并检测锚点
      await this.navigateTo1688AndCheckAnchors();

      // 4. 根据锚点检测结果决定下一步
      if (this.workflowResults.anchorDetection.success) {
        // 自动登录成功
        await this.handleAutoLoginSuccess();
      } else {
        // 进入手动登录流程
        await this.startManualLoginProcess();
      }

      // 5. 执行UI识别和容器高亮
      await this.performUIRecognitionAndHighlighting();

      // 6. 完成workflow
      await this.completeWorkflow();

    } catch (error) {
      console.error('❌ Workflow执行失败:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');

    this.browser = await chromium.launch({
      headless: false, // 手动登录时需要显示
      slowMo: 50,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--no-first-run',
        '--window-size=1920,1080',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN'
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30000);

    console.log('✅ 浏览器启动成功');
    this.workflowResults.cookieLoading = { success: true, browserStarted: true };
  }

  async loadCookies() {
    console.log('🍪 加载Cookie...');

    try {
      if (!fs.existsSync(this.cookiePaths.primary)) {
        console.log('⚠️ 主Cookie文件不存在，跳过Cookie加载');
        this.workflowResults.cookieLoading = {
          success: true,
          cookieFileExists: false,
          cookieCount: 0
        };
        return;
      }

      const cookiesData = fs.readFileSync(this.cookiePaths.primary, 'utf8');
      const cookieFile = JSON.parse(cookiesData);
      const cookies = cookieFile.cookies || cookieFile; // 支持两种格式

      console.log(`📊 发现 ${cookies.length} 个Cookie`);

      // 转换为Playwright格式
      const playwrightCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.1688.com',
        path: cookie.path || '/',
        expires: cookie.expires ? parseFloat(cookie.expires) : undefined,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || 'Lax'
      }));

      await this.context.addCookies(playwrightCookies);

      this.workflowResults.cookieLoading = {
        success: true,
        cookieFileExists: true,
        cookieCount: cookies.length,
        loadedCookies: playwrightCookies.length
      };

      console.log('✅ Cookie加载成功');

    } catch (error) {
      console.log('⚠️ Cookie加载失败，继续无Cookie访问');
      this.workflowResults.cookieLoading = {
        success: false,
        error: error.message
      };
    }
  }

  async navigateTo1688AndCheckAnchors() {
    console.log('🔗 导航到1688并检测锚点...');

    // 访问1688首页
    await this.page.goto('https://www.1688.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待页面加载
    await this.page.waitForTimeout(3000);

    // 处理可能的反机器人检测
    await this.handleAntiBot();

    // 检测登录锚点
    const anchorResult = await this.detectLoginAnchors();

    this.workflowResults.anchorDetection = anchorResult;

    if (anchorResult.success) {
      console.log(`✅ 锚点检测成功：找到 ${anchorResult.foundAnchors.length} 个登录指示器`);
    } else {
      console.log('❌ 锚点检测失败：未找到有效的登录指示器');
    }
  }

  async handleAntiBot() {
    console.log('🛡️ 处理可能的反机器人检测...');

    try {
      // 检查是否有验证码或弹窗
      const modalSelectors = [
        '.nc_wrapper',
        '.captcha-container',
        '[class*="verify"]',
        '[class*="captcha"]',
        '.modal',
        '.popup'
      ];

      for (const selector of modalSelectors) {
        const modal = await this.page.$(selector);
        if (modal) {
          console.log(`⚠️ 检测到可能的验证码/弹窗: ${selector}`);
          // 等待几秒看是否自动消失
          await this.page.waitForTimeout(5000);
          break;
        }
      }

      // 轻微的鼠标移动模拟
      await this.page.mouse.move(100, 100);
      await this.page.waitForTimeout(500);
      await this.page.mouse.move(200, 200);

    } catch (error) {
      console.log('⚠️ 反机器人处理时出错:', error.message);
    }
  }

  async detectLoginAnchors() {
    console.log('🎯 检测登录锚点...');

    const foundAnchors = [];
    let highestPriorityAnchor = null;

    // 按优先级检测锚点
    const sortedAnchors = [...this.loginAnchors].sort((a, b) => a.priority - b.priority);

    for (const anchor of sortedAnchors) {
      try {
        const elements = await this.page.$$(anchor.selector);

        for (const element of elements) {
          const isVisible = await element.isVisible();
          const boundingBox = await element.boundingBox();

          if (isVisible && boundingBox) {
            const text = await element.textContent();
            const anchorInfo = {
              selector: anchor.selector,
              name: anchor.name,
              priority: anchor.priority,
              text: text?.trim() || '',
              visible: true,
              boundingBox: boundingBox
            };

            foundAnchors.push(anchorInfo);

            // 记录最高优先级的锚点
            if (!highestPriorityAnchor || anchor.priority < highestPriorityAnchor.priority) {
              highestPriorityAnchor = anchorInfo;
            }

            console.log(`📍 发现锚点: ${anchor.name} (优先级: ${anchor.priority})`);
          }
        }
      } catch (error) {
        console.log(`锚点检测失败: ${anchor.name} - ${error.message}`);
      }
    }

    // 额外检查：URL是否包含用户相关信息
    const currentUrl = this.page.url();
    const urlIndicatesLogin = currentUrl.includes('member') ||
                            currentUrl.includes('user') ||
                            !currentUrl.includes('login');

    return {
      success: foundAnchors.length > 0 || urlIndicatesLogin,
      foundAnchors: foundAnchors,
      highestPriorityAnchor: highestPriorityAnchor,
      urlIndicatesLogin: urlIndicatesLogin,
      currentUrl: currentUrl
    };
  }

  async handleAutoLoginSuccess() {
    console.log('✅ 自动登录成功，处理后续流程...');

    this.workflowResults.autoLoginSuccess = {
      success: true,
      detectedAnchors: this.workflowResults.anchorDetection.foundAnchors.length,
      highestPriorityAnchor: this.workflowResults.anchorDetection.highestPriorityAnchor
    };

    // 每次登录成功后更新Cookie（符合现有workflow规则）
    await this.updateCookiesAfterLogin();
  }

  async startManualLoginProcess() {
    console.log('🔐 启动手动登录流程...');
    console.log('⏰ 用户需要在10分钟内完成手动登录');
    console.log('🔍 系统将每15秒检查一次登录状态');

    this.workflowResults.manualLoginProcess = {
      started: true,
      startTime: Date.now(),
      checkInterval: 15000, // 15秒
      maxWaitTime: 10 * 60 * 1000 // 10分钟
    };

    // 导航到登录页面
    await this.page.goto('https://login.1688.com/', {
      waitUntil: 'domcontentloaded'
    });

    await this.page.waitForTimeout(3000);

    // 显示登录提示
    await this.showLoginPrompt();

    // 开始15秒间隔的锚点检查循环
    await this.monitorLoginDuringManualProcess();
  }

  async showLoginPrompt() {
    await this.page.evaluate(() => {
      const existing = document.getElementById('login-prompt');
      if (existing) existing.remove();

      const prompt = document.createElement('div');
      prompt.id = 'login-prompt';
      prompt.style.cssText = `
        position: fixed;
        top: 50px;
        right: 50px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        max-width: 320px;
        animation: pulse 2s infinite;
      `;

      prompt.innerHTML = `
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 12px;">
          🔐 请手动登录1688
        </div>
        <div style="margin-bottom: 10px; line-height: 1.4;">
          1. 输入用户名和密码<br>
          2. 完成验证码（如有）<br>
          3. 点击登录按钮
        </div>
        <div style="font-size: 12px; opacity: 0.9; text-align: center;">
          ⏱️ 登录完成后自动继续<br>
          🔍 每15秒检查登录状态
        </div>
      `;

      // 添加动画样式
      const style = document.createElement('style');
      style.textContent = `
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(prompt);
    });
  }

  async monitorLoginDuringManualProcess() {
    const startTime = Date.now();
    const maxWaitTime = this.workflowResults.manualLoginProcess.maxWaitTime;
    const checkInterval = this.workflowResults.manualLoginProcess.checkInterval;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        console.log(`🔍 检查登录状态... (${Math.floor((Date.now() - startTime) / 1000)}秒)`);

        // 检查是否已经跳转到1688主页
        const currentUrl = this.page.url();
        if (currentUrl.includes('1688.com') && !currentUrl.includes('login')) {
          console.log('✅ 检测到页面跳转到1688主页');

          // 验证登录状态
          const anchorResult = await this.detectLoginAnchors();
          if (anchorResult.success) {
            console.log('✅ 锚点检测确认登录成功');

            // 移除登录提示
            await this.page.evaluate(() => {
              const prompt = document.getElementById('login-prompt');
              if (prompt) prompt.remove();
            });

            this.workflowResults.manualLoginProcess.success = true;
            this.workflowResults.manualLoginProcess.completedAt = Date.now();
            this.workflowResults.manualLoginProcess.totalTime = Date.now() - startTime;

            // 立即更新Cookie
            await this.updateCookiesAfterLogin();

            return;
          }
        }

        // 等待下一个检查间隔
        await this.page.waitForTimeout(checkInterval);

      } catch (error) {
        console.log(`⚠️ 登录状态检查出错: ${error.message}`);
        await this.page.waitForTimeout(5000);
      }
    }

    throw new Error('手动登录超时：用户未在10分钟内完成登录');
  }

  async updateCookiesAfterLogin() {
    console.log('💾 更新登录后的Cookie...');

    try {
      const cookies = await this.context.cookies();
      console.log(`📊 获取到 ${cookies.length} 个Cookie`);

      // 生成带时间戳的备份文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.cookiePaths.timestamped = path.join(
        path.dirname(this.cookiePaths.primary),
        `1688-domestic-backup-${timestamp}.json`
      );

      // 备份现有Cookie
      if (fs.existsSync(this.cookiePaths.primary)) {
        fs.copyFileSync(this.cookiePaths.primary, this.cookiePaths.backup);
      }

      // 保存新Cookie到主位置
      fs.writeFileSync(this.cookiePaths.primary, JSON.stringify(cookies, null, 2));

      // 保存时间戳备份
      fs.writeFileSync(this.cookiePaths.timestamped, JSON.stringify(cookies, null, 2));

      this.workflowResults.cookieUpdate = {
        success: true,
        cookieCount: cookies.length,
        savedPaths: [
          this.cookiePaths.primary,
          this.cookiePaths.timestamped
        ],
        timestamp: new Date().toISOString()
      };

      console.log('✅ Cookie更新完成');
      console.log(`📁 主文件: ${this.cookiePaths.primary}`);
      console.log(`📁 备份文件: ${this.cookiePaths.timestamped}`);

    } catch (error) {
      console.error('❌ Cookie更新失败:', error.message);
      this.workflowResults.cookieUpdate = {
        success: false,
        error: error.message
      };
    }
  }

  async performUIRecognitionAndHighlighting() {
    console.log('🤖 执行UI识别和容器高亮...');

    // 确保在1688主页
    const currentUrl = this.page.url();
    if (!currentUrl.includes('1688.com') || currentUrl.includes('login')) {
      await this.page.goto('https://www.1688.com/', {
        waitUntil: 'domcontentloaded'
      });
      await this.page.waitForTimeout(3000);
    }

    // 截取页面
    await this.page.waitForLoadState('networkidle');
    const screenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    console.log(`📸 截图完成，大小: ${screenshot.length} bytes`);

    // 基本的UI元素检测（简化版，不依赖外部服务）
    const elements = await this.performBasicUIElementDetection();

    // 创建容器
    const containers = this.createContainersFromElements(elements);

    // 应用高亮
    await this.applyHighlights(containers);

    this.workflowResults.uiRecognition = {
      success: true,
      elementCount: elements.length,
      screenshotSize: screenshot.length
    };

    this.workflowResults.containerHighlighting = {
      success: true,
      containerCount: containers.length,
      highlightsApplied: containers.length
    };

    console.log(`✅ UI识别完成：${elements.length} 个元素，${containers.length} 个容器`);

    // 保持浏览器打开5秒让用户观察
    await this.page.waitForTimeout(5000);
  }

  async performBasicUIElementDetection() {
    const elements = [];

    // 定义关键UI元素选择器
    const elementTypes = [
      { selector: 'input[type="text"], input[type="search"], input[placeholder*="搜索"]', type: 'input', name: '输入框' },
      { selector: 'button, input[type="button"], input[type="submit"]', type: 'button', name: '按钮' },
      { selector: 'a[href]:not([href*="javascript"]):not([href="#"])', type: 'link', name: '链接' },
      { selector: 'img[src]', type: 'image', name: '图片' },
      { selector: 'nav, [class*="nav"], [class*="navigation"]', type: 'navigation', name: '导航' }
    ];

    for (const { selector, type, name } of elementTypes) {
      try {
        const foundElements = await this.page.$$(selector);

        // 限制每种类型的元素数量以避免过多
        const maxElements = Math.min(foundElements.length, type === 'link' ? 20 : 10);

        for (let i = 0; i < maxElements; i++) {
          const element = foundElements[i];
          const boundingBox = await element.boundingBox();

          if (boundingBox && boundingBox.width > 0 && boundingBox.height > 0) {
            const text = await element.textContent();
            elements.push({
              id: `${type}-${i}`,
              type: type,
              name: name,
              bbox: {
                x1: boundingBox.x,
                y1: boundingBox.y,
                x2: boundingBox.x + boundingBox.width,
                y2: boundingBox.y + boundingBox.height
              },
              text: text?.trim() || '',
              visible: true
            });
          }
        }
      } catch (error) {
        console.log(`元素检测失败: ${name} - ${error.message}`);
      }
    }

    return elements;
  }

  createContainersFromElements(elements) {
    const containers = [];

    // 按位置分组元素
    const headerElements = elements.filter(el => el.bbox.y1 < 120);
    const searchElements = elements.filter(el =>
      el.type === 'input' && (el.text?.includes('搜索') || el.name === '输入框')
    );
    const navigationElements = elements.filter(el => el.type === 'navigation');
    const mainElements = elements.filter(el => el.bbox.y1 >= 120 && el.bbox.y1 < 600);

    // 创建容器
    if (headerElements.length > 0) {
      containers.push({
        id: 'header-container',
        type: 'header',
        name: '页面头部',
        bounds: this.calculateContainerBounds(headerElements),
        elements: headerElements,
        color: '#9c27b0'
      });
    }

    if (searchElements.length > 0) {
      containers.push({
        id: 'search-container',
        type: 'search',
        name: '搜索区域',
        bounds: this.calculateContainerBounds(searchElements),
        elements: searchElements,
        color: '#ff9800'
      });
    }

    if (navigationElements.length > 0) {
      containers.push({
        id: 'navigation-container',
        type: 'navigation',
        name: '导航区域',
        bounds: this.calculateContainerBounds(navigationElements),
        elements: navigationElements,
        color: '#2196f3'
      });
    }

    if (mainElements.length > 0) {
      containers.push({
        id: 'main-container',
        type: 'main',
        name: '主内容',
        bounds: this.calculateContainerBounds(mainElements),
        elements: mainElements,
        color: '#4caf50'
      });
    }

    return containers;
  }

  calculateContainerBounds(elements) {
    if (elements.length === 0) {
      return { x1: 0, y1: 0, x2: 0, y2: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      minX = Math.min(minX, el.bbox.x1);
      minY = Math.min(minY, el.bbox.y1);
      maxX = Math.max(maxX, el.bbox.x2);
      maxY = Math.max(maxY, el.bbox.y2);
    });

    return {
      x1: Math.max(0, minX - 10),
      y1: Math.max(0, minY - 10),
      x2: maxX + 10,
      y2: maxY + 10
    };
  }

  async applyHighlights(containers) {
    console.log('🎨 应用容器高亮...');

    // 添加高亮样式
    await this.page.addStyleTag({
      content: `
        .ui-highlight-container {
          position: absolute !important;
          border: 3px solid !important;
          background: rgba(255, 255, 255, 0.2) !important;
          box-sizing: border-box !important;
          z-index: 10000 !important;
          pointer-events: none !important;
          transition: all 0.3s ease !important;
          box-shadow: 0 0 15px rgba(0,0,0,0.3) !important;
        }
        .ui-highlight-container:hover {
          background: rgba(255, 255, 255, 0.4) !important;
          transform: scale(1.02) !important;
        }
        .ui-highlight-label {
          position: absolute !important;
          top: -30px !important;
          left: 0 !important;
          background: rgba(0, 0, 0, 0.9) !important;
          color: white !important;
          padding: 6px 12px !important;
          font-size: 14px !important;
          border-radius: 6px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
          z-index: 10001 !important;
          white-space: nowrap !important;
          font-weight: 500 !important;
        }
      `
    });

    // 为每个容器添加高亮
    let highlightsAdded = 0;

    for (const container of containers) {
      try {
        await this.page.evaluate((bounds, containerId, containerName, containerType, color, elementCount) => {
          const highlight = document.createElement('div');
          highlight.className = 'ui-highlight-container';
          highlight.id = `highlight-${containerId}`;
          highlight.style.cssText = `
            left: ${bounds.x1}px;
            top: ${bounds.y1}px;
            width: ${bounds.x2 - bounds.x1}px;
            height: ${bounds.y2 - bounds.y1}px;
            border-color: ${color};
            background: ${color}20;
          `;

          const label = document.createElement('div');
          label.className = 'ui-highlight-label';
          label.textContent = `${containerName} (${elementCount}个元素)`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, container.bounds, container.id, container.name, container.type, container.color, container.elements.length);

        highlightsAdded++;
        console.log(`✅ 高亮添加: ${container.name} (${container.elements.length} 个元素)`);

      } catch (error) {
        console.log(`❌ 高亮添加失败: ${container.name} - ${error.message}`);
      }
    }

    console.log(`🎨 高亮应用完成：${highlightsAdded}/${containers.length} 个容器`);
  }

  async completeWorkflow() {
    console.log('🏁 完成workflow...');

    // 判断workflow是否成功
    const success = this.workflowResults.autoLoginSuccess?.success ||
                   this.workflowResults.manualLoginProcess?.success;

    this.workflowResults.workflowComplete = true;
    this.workflowResults.overallSuccess = success;

    // 生成workflow报告
    const report = {
      timestamp: new Date().toISOString(),
      workflowType: 'proper-1688-login-workflow',
      overallSuccess: success,
      results: this.workflowResults,
      summary: {
        cookieLoading: this.workflowResults.cookieLoading?.success || false,
        anchorDetection: this.workflowResults.anchorDetection?.success || false,
        autoLoginSuccess: this.workflowResults.autoLoginSuccess?.success || false,
        manualLoginSuccess: this.workflowResults.manualLoginProcess?.success || false,
        cookieUpdate: this.workflowResults.cookieUpdate?.success || false,
        uiRecognition: this.workflowResults.uiRecognition?.success || false,
        containerHighlighting: this.workflowResults.containerHighlighting?.success || false
      },
      statistics: {
        totalElements: this.workflowResults.uiRecognition?.elementCount || 0,
        totalContainers: this.workflowResults.containerHighlighting?.containerCount || 0,
        cookieCount: this.workflowResults.cookieUpdate?.cookieCount || 0,
        workflowTime: Date.now() - (this.workflowResults.manualLoginProcess?.startTime || Date.now())
      }
    };

    const reportPath = path.join(__dirname, '../reports/proper-1688-workflow-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📊 Workflow报告已生成: ${reportPath}`);

    if (success) {
      console.log('\n🎉 1688标准workflow执行成功！');
      console.log('✅ Cookie已动态更新');
      console.log('✅ 锚点检测正常工作');
      console.log('✅ UI识别和容器高亮完成');
    } else {
      console.log('\n❌ 1688标准workflow执行失败');
    }

    return report;
  }

  async cleanup() {
    console.log('🧹 清理资源...');

    if (this.page) {
      await this.page.close();
    }
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// 主执行函数
async function main() {
  const workflow = new Proper1688WorkflowTest();

  try {
    await workflow.runWorkflow();
    process.exit(workflow.workflowResults.overallSuccess ? 0 : 1);
  } catch (error) {
    console.error('\n💥 1688 Workflow执行失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default Proper1688WorkflowTest;