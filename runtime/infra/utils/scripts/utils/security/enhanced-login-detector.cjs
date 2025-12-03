#!/usr/bin/env node

/**
 * 唯一的头像检测器 - 检测特定头像元素并自动保存Cookie
 * 当检测到指定selector时立即自动保存Cookie
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class EnhancedLoginDetector {
  constructor(config = {}) {
    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      headless: config.headless || false,
      verbose: config.verbose || true,
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };

    // 严格按照用户要求的目标selector
    this.targetAvatarSelectors = [
      // 核心目标selector
      'img[class*="Ctrls_avatar"]',
      '.Ctrls_avatar_3Hf0X',
      '.Ctrls_icon_2mxB4 img',
      'img[class*="Ctrls_icon"]',
      'img[alt*="profile"][class*="Ctrls"]'
    ];

    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastSaveTime = 0;
    this.saveCooldown = 5000; // 5秒冷却时间
  }

  /**
   * 启动头像检测器并自动保存Cookie
   */
  async startAvatarDetection() {
    console.log('🔍 启动头像检测器...');
    console.log('📋 目标selector: img[class*="Ctrls_avatar"], .Ctrls_avatar_3Hf0X, .Ctrls_icon_2mxB4');
    console.log('💡 检测到目标头像后将立即自动保存Cookie');

    try {
      // 启动浏览器
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.context = await this.browser.newContext({
        userAgent: this.config.userAgent,
        viewport: this.config.viewport,
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true
      });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.timeout);

      // 设置事件监听
      if (this.config.verbose) {
        this.page.on('console', msg => console.log(`📄 [页面] ${msg.text()}`));
        this.page.on('pageerror', error => console.warn(`⚠️ [页面错误] ${error.message}`));
      }

      // 导航到微博
      await this.page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout, 15000)
      });

      console.log('🌐 已导航到微博，开始实时检测...');
      console.log('🔄 检测到目标头像后将立即自动保存Cookie');

      // 开始实时检测
      const detectionResult = await this.startRealTimeDetection();

      return {
        success: true,
        detectionResult,
        browser: this.browser,
        context: this.context,
        page: this.page
      };

    } catch (error) {
      console.error('❌ 头像检测失败:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 启动实时头像检测和自动Cookie保存
   */
  async startRealTimeDetection() {
    console.log('🔍 启动实时头像检测和自动Cookie保存...');
    console.log('📋 目标selectors:');
    this.targetAvatarSelectors.forEach(selector => {
      console.log(`   - ${selector}`);
    });

    let detectionCount = 0;
    const maxDetections = 1000; // 最大检测次数防止无限循环
    const checkInterval = 2000; // 每2秒检测一次

    const detect = async () => {
      try {
        detectionCount++;

        if (detectionCount > maxDetections) {
          console.log('🛑 达到最大检测次数，停止检测');
          return false;
        }

        // 检测头像元素
        const result = await this.page.evaluate((selectors) => {
          let foundAvatar = null;
          const detectionResults = {};

          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              const visible = Array.from(elements).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 &&
                       el.offsetParent !== null &&
                       window.getComputedStyle(el).display !== 'none' &&
                       window.getComputedStyle(el).visibility !== 'hidden';
              });

              if (visible.length > 0) {
                detectionResults[selector] = visible.length;

                // 找到第一个符合条件的头像
                if (!foundAvatar && visible[0]) {
                  foundAvatar = visible[0];
                }
              }
            } catch (e) {
              // 忽略选择器错误
            }
          });

          return {
            foundAvatar: !!foundAvatar,
            avatarInfo: foundAvatar ? {
              src: foundAvatar.src,
              alt: foundAvatar.alt,
              className: foundAvatar.className,
              id: foundAvatar.id
            } : null,
            detectionResults,
            totalDetected: Object.values(detectionResults).reduce((sum, count) => sum + count, 0)
          };
        }, this.targetAvatarSelectors);

        // 如果检测到头像，立即保存Cookie
        if (result.foundAvatar) {
          console.log(`🎉 检测到登录头像！检测次数: ${detectionCount}`);
          console.log(`📊 检测结果: ${result.totalDetected} 个元素`);

          if (result.avatarInfo) {
            console.log(`🖼️  头像信息:`);
            console.log(`   - SRC: ${result.avatarInfo.src}`);
            console.log(`   - ALT: ${result.avatarInfo.alt}`);
            console.log(`   - CLASS: ${result.avatarInfo.className}`);
          }

          // 检查冷却时间
          const now = Date.now();
          if (now - this.lastSaveTime > this.saveCooldown) {
            console.log('💾 立即自动保存Cookie...');
            const saveResult = await this.saveAuthenticatedCookies();

            if (saveResult) {
              this.lastSaveTime = now;
              console.log('✅ Cookie保存成功！');

              // 返回成功结果
              return {
                success: true,
                detectionResult: result,
                cookieSaved: true,
                detectionAttempts: detectionCount
              };
            } else {
              console.warn('⚠️ Cookie保存失败，继续检测...');
            }
          } else {
            console.log(`⏳ 跳过保存，冷却时间未到 (${Math.round((this.saveCooldown - (now - this.lastSaveTime)) / 1000)}秒)`);
          }
        }

        // 每30秒显示一次进度
        if (detectionCount % 15 === 0) {
          console.log(`⏳ 持续检测中... (${detectionCount}/${maxDetections})`);
          console.log(`   - 当前页面: ${this.page.url()}`);
          console.log(`   - 页面标题: ${await this.page.title()}`);
        }

        // 继续检测
        setTimeout(detect, checkInterval);

      } catch (error) {
        console.warn(`⚠️ 检测异常: ${error.message}`);
        // 继续检测
        setTimeout(detect, checkInterval);
      }
    };

    // 开始检测
    detect();

    // 返回检测状态
    return {
      success: true,
      message: '实时头像检测已启动',
      detectionStarted: true
    };
  }

  /**
   * 检查登录状态（基于指定的头像selectors）
   */
  async checkLoginStatus() {
    try {
      const result = await this.page.evaluate((selectors) => {
        let foundAvatar = null;
        const detectionResults = {};

        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            const visible = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });

            if (visible.length > 0) {
              detectionResults[selector] = visible.length;

              // 找到第一个符合条件的头像
              if (!foundAvatar && visible[0]) {
                foundAvatar = visible[0];
              }
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 检查页面标题和URL
        const title = document.title;
        const url = window.location.href;
        const hasValidTitle = title && !title.includes('登录') && !title.includes('Login');
        const hasValidUrl = url && !url.includes('newlogin') && !url.includes('login') && !url.includes('visitor');

        // 严格的登录判断：必须有头像元素
        const hasAvatar = !!foundAvatar;
        const isLoggedIn = hasAvatar && hasValidTitle && hasValidUrl;

        return {
          foundAvatar,
          hasAvatar,
          hasValidTitle,
          hasValidUrl,
          isLoggedIn,
          detectionResults,
          totalDetected: Object.values(detectionResults).reduce((sum, count) => sum + count, 0),
          avatarInfo: foundAvatar ? {
            src: foundAvatar.src,
            alt: foundAvatar.alt,
            className: foundAvatar.className,
            id: foundAvatar.id
          } : null,
          details: {
            currentPage: url,
            pageTitle: title,
            avatarDetection: hasAvatar,
            detectedElements: Object.keys(detectionResults).length,
            validTitleCheck: hasValidTitle,
            validUrlCheck: hasValidUrl
          }
        };
      }, this.targetAvatarSelectors);

      return result;

    } catch (error) {
      return {
        foundAvatar: false,
        hasAvatar: false,
        hasValidTitle: false,
        hasValidUrl: false,
        isLoggedIn: false,
        error: error.message,
        detectionResults: {},
        totalDetected: 0,
        avatarInfo: null,
        details: {
          currentPage: '',
          pageTitle: '',
          avatarDetection: false,
          detectedElements: 0,
          validTitleCheck: false,
          validUrlCheck: false
        }
      };
    }
  }

  /**
   * 保存认证后的Cookie
   */
  async saveAuthenticatedCookies() {
    console.log('💾 保存认证后的Cookie...');

    try {
      const cookies = await this.context.cookies();

      // 只保存真正重要的认证Cookie
      const essentialCookieNames = [
        'SUB',           // 主要认证Cookie
        'WBPSESS',       // 会话Cookie
        'XSRF-TOKEN',    // CSRF保护
        'SUBP',          // 认证参数
        'ALF',           // 自动登录
        'SRT',           // 安全令牌
        'SCF',           // 安全配置
        'SSOLoginState'  // SSO登录状态
      ];

      const essentialCookies = cookies.filter(cookie =>
        cookie.name &&
        cookie.value &&
        cookie.domain &&
        essentialCookieNames.includes(cookie.name)
      );

      if (essentialCookies.length === 0) {
        console.warn('⚠️ 没有找到认证Cookie，可能还未真正登录');
        console.warn(`   当前Cookie总数: ${cookies.length}`);
        console.warn(`   Cookie列表: ${cookies.map(c => c.name).join(', ')}`);
        return false;
      }

      // 确保目录存在
      const cookieDir = path.dirname(this.config.cookieFile);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 保存Cookie
      fs.writeFileSync(this.config.cookieFile, JSON.stringify(essentialCookies, null, 2));

      if (this.config.verbose) {
        console.log('✅ 认证Cookie保存成功');
        console.log(`   保存路径: ${this.config.cookieFile}`);
        console.log(`   Cookie数量: ${essentialCookies.length}`);
        console.log(`   保存的Cookie: ${essentialCookies.map(c => c.name).join(', ')}`);
      }

      return true;

    } catch (error) {
      console.error('❌ Cookie保存失败:', error.message);
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    console.log('🧹 增强登录检测器资源已清理');
  }
}

/**
 * 便利函数：启动增强登录检测
 */
async function startEnhancedLoginDetection(config = {}) {
  const detector = new EnhancedLoginDetector(config);

  try {
    const result = await detector.startAvatarDetection();

    console.log('\n🎉 增强登录检测完成！');
    console.log(`✅ 检测状态: ${result.success ? '成功' : '失败'}`);
    console.log(`✅ 头像检测已启动: ${result.detectionStarted ? '是' : '否'}`);
    console.log(`✅ Cookie保存路径: ${detector.config.cookieFile}`);

    return {
      ...result,
      detector
    };

  } catch (error) {
    console.error('❌ 增强登录检测失败:', error.message);
    throw error;
  }
}

module.exports = {
  EnhancedLoginDetector,
  startEnhancedLoginDetection
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🧪 增强头像检测和自动Cookie保存系统');
    console.log('='.repeat(50));
    console.log('🎯 功能：实时检测指定的头像元素并自动保存Cookie');
    console.log('📋 目标selectors: img[class*="Ctrls_avatar"], .Ctrls_avatar_3Hf0X, .Ctrls_icon_2mxB4 img');

    try {
      const result = await startEnhancedLoginDetection({
        verbose: true,
        headless: false,
        timeout: 30000
      });

      console.log('\n📋 启动结果:');
      console.log(`✅ 启动状态: ${result.success ? '成功' : '失败'}`);
      console.log(`✅ 头像检测: ${result.detectionStarted ? '已启动' : '启动失败'}`);
      console.log(`✅ Cookie保存路径: ${result.detector.config.cookieFile}`);
      console.log(`✅ 冷却时间: ${result.detector.saveCooldown / 1000}秒`);

      if (result.success && result.detectionStarted) {
        console.log('\n🔄 系统正在实时检测中...');
        console.log('💡 当检测到目标头像元素时，系统会自动保存Cookie');
        console.log('📱 浏览器保持打开状态供登录操作...');
        console.log('⚠️ 按 Ctrl+C 退出程序');
      } else {
        console.log('\n❌ 系统启动失败，请检查配置和网络连接');
      }

    } catch (error) {
      console.error('\n💥 系统启动失败:', error.message);
      process.exit(1);
    }
  })();
}