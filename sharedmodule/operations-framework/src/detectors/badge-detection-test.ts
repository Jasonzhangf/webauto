#!/usr/bin/env node

/**
 * 徽章检测测试
 * 测试微博登录状态的徽章检测功能
 */

// 注意：此文件为测试/诊断脚本，仍然保留直接使用 Playwright。
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

console.log('🔍 徽章检测测试...\n');

interface BadgeDetectionResult {
  success: boolean;
  badgeDetected: boolean;
  loginConfirmed: boolean;
  visibleBadges: number;
  totalBadges: number;
  hasWeiboCookies: boolean;
  details: string;
  detectedElements: string[];
  isLoggedIn: boolean;
}

interface BadgeInfo {
  selector: string;
  count: number;
  visible: boolean;
}

class BadgeDetector {
  private cookiesPath: string;

  constructor() {
    this.cookiesPath = path.join(process.env.HOME || '~', '.webauto/cookies/weibo-cookies.json');
  }

  async testBadgeDetection(): Promise<BadgeDetectionResult> {
    let browser = null;
    let context = null;

    try {
      console.log('📍 步骤1: 读取Cookie文件...');
      const cookieData = await fs.readFile(this.cookiesPath, 'utf8');
      const cookies = JSON.parse(cookieData);

      console.log(`✅ Cookie文件: ${this.cookiesPath}`);
      console.log(`📊 Cookie数量: ${cookies.length}`);

      // 检查关键Cookie
      const essentialCookies = ['SUB', 'WBPSESS', 'XSRF-TOKEN'];
      const foundEssential = essentialCookies.filter(name =>
        cookies.some(cookie => cookie.name === name)
      );

      const hasWeiboCookies = foundEssential.length === 3;
      console.log(`🔑 关键Cookie: ${foundEssential.join(', ')}`);
      console.log(`📊 Cookie验证: ${hasWeiboCookies ? '✅ 通过' : '❌ 失败'}`);

      console.log('\n🌐 步骤2: 启动浏览器(headless模式)...');
      browser = await chromium.launch({
        headless: true, // headless模式，不弹出窗口
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

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true
      });

      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      // 设置调试监听器
      page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
      page.on('pageerror', error => console.log(`[Page Error] ${error.message}`));

      console.log('\n🍪 步骤3: 加载Cookie到浏览器...');
      await context.addCookies(cookies);

      // 验证加载
      const loadedCookies = await context.cookies();
      console.log(`✅ 成功加载 ${loadedCookies.length} 个Cookie`);

      console.log('\n🌐 步骤4: 访问微博首页...');
      await page.goto('https://weibo.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      await page.waitForTimeout(5000);

      console.log(`✅ 访问成功: ${page.url()}`);

      console.log('\n🔍 步骤5: 开始徽章检测...');
      const badgeResult = await this.detectBadges(page);

      console.log('\n📊 徽章检测结果:');
      console.log(`  - 徽章检测: ${badgeResult.badgeDetected ? '✅ 成功' : '❌ 失败'}`);
      console.log(`  - 登录确认: ${badgeResult.loginConfirmed ? '✅ 确认' : '❌ 未确认'}`);
      console.log(`  - 可见徽章: ${badgeResult.visibleBadges}/${badgeResult.totalBadges}`);
      console.log(`  - Cookie验证: ${badgeResult.hasWeiboCookies ? '✅ 通过' : '❌ 失败'}`);
      console.log(`  - 综合登录: ${badgeResult.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

      if (badgeResult.detectedElements.length > 0) {
        console.log('\n🔍 检测到的元素:');
        badgeResult.detectedElements.forEach((element, index) => {
          console.log(`  ${index + 1}. ${element}`);
        });
      }

      return badgeResult;

    } catch (error) {
      console.log(`❌ 测试失败: ${error.message}`);
      return {
        success: false,
        badgeDetected: false,
        loginConfirmed: false,
        visibleBadges: 0,
        totalBadges: 0,
        hasWeiboCookies: false,
        details: `检测过程中出现错误: ${error.message}`,
        detectedElements: [],
        isLoggedIn: false
      };

    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  /**
   * 检测徽章元素
   */
  async detectBadges(page: any): Promise<BadgeDetectionResult> {
    const result = {
      success: true,
      badgeDetected: false,
      loginConfirmed: false,
      visibleBadges: 0,
      totalBadges: 0,
      hasWeiboCookies: false,
      details: '',
      detectedElements: [] as string[],
      isLoggedIn: false
    };

    try {
      // 1. 检查登录按钮/链接（未登录状态）
      const loginSelectors = [
        'a[href*="login"]',
        '.login-btn',
        '.S_login',
        'a[node-type="loginBtn"]',
        '.gn_login',
        '[title="登录"]',
        'text="登录"',
        'text="立即登录"'
      ];

      let hasLoginElements = false;
      for (const selector of loginSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            hasLoginElements = true;
            result.detectedElements.push(`登录元素: ${selector} (${elements.length}个)`);
            break;
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      // 2. 检测徽章元素（已登录状态）- 优化为最关键的标识
      const badgeSelectors = [
        // 关键标识：微博用户链接（已确认有效）
        'a[href*="/u/"]',

        // 其他辅助标识
        'img[src*="avatar"]',
        'img[alt*="头像"]',
        '.avatar',
        '.user-avatar',
        '.headpic',
        '.face',

        // 微博特有的用户标识
        '.gn_header .gn_nav',
        '.S_header .S_nav',
        '[action-data*="uid"]',
        'a[href*="/home"]',

        // 用户信息选择器
        '.username',
        '.user-name',
        '.gn_name',
        '.S_name',
        '[node-type="name"]'
      ];

      let badgeCount = 0;
      const detectedBadges: BadgeInfo[] = [];

      for (const selector of badgeSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            badgeCount++;
            const visible = await this.areElementsVisible(elements);
            detectedBadges.push({
              selector: selector,
              count: elements.length,
              visible: visible
            });
            result.detectedElements.push(`徽章元素: ${selector} (${elements.length}个, ${visible ? '可见' : '隐藏'})`);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      // 徽章检测结果 - 专门针对确认有效的用户链接标识
      const visibleBadges = detectedBadges.filter(badge => badge.visible);
      result.visibleBadges = visibleBadges.length;
      result.totalBadges = badgeCount;

      // 关键标识：a[href*="/u/"] 用户链接元素（已确认有效的登录标识）
      const userLinksBadge = detectedBadges.find(badge => badge.selector === 'a[href*="/u/"]');
      result.badgeDetected = userLinksBadge && userLinksBadge.visible && userLinksBadge.count >= 10; // 至少10个用户链接才确认登录

      // 3. 检查其他用户元素
      const additionalUserSelectors = [
        '.gn_header_right',
        '.S_header_right',
        '.Header_right',
        '.header-right'
      ];

      let additionalUserCount = 0;
      for (const selector of additionalUserSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            additionalUserCount++;
            result.detectedElements.push(`辅助用户元素: ${selector} (${elements.length}个)`);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      const totalUserElements = badgeCount + additionalUserCount;

      // 4. 检查Cookie验证
      const cookies = await page.context().cookies();
      result.hasWeiboCookies = cookies.some(cookie =>
        cookie.name === 'SUB' ||
        cookie.name === 'WBPSESS' ||
        cookie.name === 'XSRF-TOKEN'
      );

      // 5. 检查页面内容
      const pageContent = await page.content();
      const hasLogoutText = pageContent.includes('退出') || pageContent.includes('注销');
      const hasUserText = pageContent.includes('我的首页') || pageContent.includes('个人中心');

      // 徽章检测确认逻辑
      result.loginConfirmed = result.badgeDetected && result.hasWeiboCookies;

      // 综合判断逻辑
      if (result.loginConfirmed) {
        // 徽章检测确认登录
        result.isLoggedIn = true;
        result.details = `徽章检测确认: ${visibleBadges.length}个可见徽章 + 有效Cookie`;
      } else if (hasLoginElements && totalUserElements === 0 && !result.hasWeiboCookies) {
        // 明显的未登录状态
        result.isLoggedIn = false;
        result.details = '检测到登录按钮，无用户元素，无有效Cookie';
      } else if (!hasLoginElements && totalUserElements >= 2 && result.hasWeiboCookies) {
        // 明显的已登录状态
        result.isLoggedIn = true;
        result.details = `检测到 ${totalUserElements} 个用户元素，有有效Cookie，无登录按钮`;
      } else if (totalUserElements >= 3 && result.hasWeiboCookies) {
        // 倾向于已登录
        result.isLoggedIn = true;
        result.details = `检测到多个用户元素 (${totalUserElements}个) 和有效Cookie`;
      } else if (hasLoginElements) {
        // 倾向于未登录
        result.isLoggedIn = false;
        result.details = '检测到登录按钮，用户元素较少';
      } else if (result.hasWeiboCookies && hasUserText) {
        // Cookie和文本内容验证
        result.isLoggedIn = true;
        result.details = 'Cookie有效且页面包含用户相关文本';
      } else {
        // 不确定状态
        result.isLoggedIn = result.hasWeiboCookies;
        result.details = '状态不确定，基于Cookie判断';
      }

      // 保存截图
      await page.screenshot({
        path: './badge-detection-result.png',
        fullPage: true
      });

      console.log('\n🔍 详细检测信息:');
      console.log(`  - 登录元素: ${hasLoginElements ? '是' : '否'}`);
      console.log(`  - 用户元素总数: ${totalUserElements}`);
      console.log(`  - 徽章元素: ${badgeCount}`);
      console.log(`  - 可见徽章: ${visibleBadges.length}`);
      console.log(`  - 有效Cookie: ${result.hasWeiboCookies ? '是' : '否'}`);
      console.log(`  - 退出文本: ${hasLogoutText ? '是' : '否'}`);
      console.log(`  - 用户文本: ${hasUserText ? '是' : '否'}`);
      console.log(`  - 徽章确认登录: ${result.loginConfirmed ? '是' : '否'}`);

      return result;

    } catch (error) {
      result.success = false;
      result.details = `检测过程中出现错误: ${error.message}`;
      console.log('❌ 徽章检测失败:', error.message);
      return result;
    }
  }

  /**
   * 检查元素是否可见
   */
  async areElementsVisible(elements: any[]): Promise<boolean> {
    for (const element of elements.slice(0, 3)) { // 最多检查前3个元素
      try {
        const isVisible = await element.isVisible();
        if (isVisible) {
          return true;
        }
      } catch (e) {
        // 忽略检查错误
      }
    }
    return false;
  }
}

// 运行测试
async function runBadgeDetectionTest() {
  const detector = new BadgeDetector();

  try {
    const result = await detector.testBadgeDetection();

    console.log('\n📋 徽章检测测试结果:');
    console.log(`执行状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);

    if (result.success) {
      console.log(`徽章检测: ${result.badgeDetected ? '✅ 成功' : '❌ 失败'}`);
      console.log(`登录确认: ${result.loginConfirmed ? '✅ 确认' : '❌ 未确认'}`);
      console.log(`综合登录: ${result.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);
      console.log(`可见徽章: ${result.visibleBadges}/${result.totalBadges}`);
      console.log(`Cookie验证: ${result.hasWeiboCookies ? '✅ 通过' : '❌ 失败'}`);
      console.log(`检测详情: ${result.details}`);

      if (result.loginConfirmed) {
        console.log('\n🎉 徽章检测确认登录状态成功！');
        console.log('✅ Core/Detector架构下的徽章检测功能正常！');
      } else {
        console.log('\n⚠️ 徽章检测未确认登录状态，需要进一步优化');
      }
    } else {
      console.log(`错误: ${result.details}`);
    }

    console.log('\n🔍 测试完成，浏览器已关闭');

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.log('💥 程序执行失败:', error.message);
    process.exit(1);
  }
}

// 启动测试
runBadgeDetectionTest();
