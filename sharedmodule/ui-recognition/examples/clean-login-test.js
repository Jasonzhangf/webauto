/**
 * 清理的登录测试 - 不注入Cookie，让用户手动登录
 * 检测到登录成功后保存Cookie
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CleanLoginTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.testResults = {
      browserLaunch: null,
      cleanNavigation: null,
      loginDetection: null,
      cookieSave: null,
      finalVerification: null
    };
  }

  async runCleanLoginTest() {
    console.log('🧹 开始清理登录测试（不注入Cookie）');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 清理导航到1688（不注入Cookie）
      await this.cleanNavigateTo1688();

      // 3. 持续监测登录状态
      const loginSuccess = await this.monitorLoginProcess();

      if (loginSuccess) {
        console.log('✅ 检测到用户登录成功！');

        // 4. 保存Cookie
        await this.saveCookies();

        // 5. 验证Cookie
        await this.verifySavedCookies();

        // 6. 生成测试报告
        await this.generateTestReport();
      } else {
        console.log('⏰ 登录监测超时');
        await this.generateTimeoutReport();
      }

    } catch (error) {
      console.error('❌ 清理登录测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');

    try {
      // 使用 launchPersistentContext 简化启动
      this.context = await chromium.launchPersistentContext('/tmp/clean-login-' + Date.now(), {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--no-first-run'
        ]
      });

      this.page = this.context.pages()[0] || await this.context.newPage();
      this.page.setDefaultTimeout(30000);

      // 确保浏览器窗口在最前面
      await this.page.bringToFront();

      console.log('✅ 浏览器启动成功');
      console.log('📌 浏览器窗口应该已打开，请查看屏幕上的1688登录页面');
      this.testResults.browserLaunch = {
        success: true,
        browserType: 'chromium',
        timestamp: Date.now()
      };

    } catch (error) {
      console.log('❌ 浏览器启动失败:', error.message);
      this.testResults.browserLaunch = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      throw error;
    }
  }

  async cleanNavigateTo1688() {
    console.log('🔗 清理导航到1688（不注入Cookie）...');

    try {
      // 直接导航到1688主页
      await this.page.goto('https://www.1688.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 等待页面加载完成
      await this.page.waitForTimeout(3000);

      console.log('✅ 清理导航完成');
      console.log('📌 1688登录页面已加载，请立即在浏览器中完成登录操作！');
      console.log('📌 登录成功后系统会自动检测并保存Cookie');

      this.testResults.cleanNavigation = {
        success: true,
        url: this.page.url(),
        timestamp: Date.now()
      };

    } catch (error) {
      console.log('❌ 导航失败:', error.message);
      this.testResults.cleanNavigation = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      throw error;
    }
  }

  async monitorLoginProcess() {
    console.log('👀 开始监测登录过程（最长等待5分钟）...');

    const maxWaitTime = 300000; // 5分钟
    const checkInterval = 10000; // 10秒检查间隔
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        console.log(`  🔍 检查登录状态... (${Math.floor((Date.now() - startTime) / 1000)}秒)`);

        // 检查是否已经登录（通过用户头像等登录指标）
        const isLoggedIn = await this.checkIfLoggedIn();

        if (isLoggedIn) {
          console.log('  ✅ 检测到登录成功！');
          this.testResults.loginDetection = {
            success: true,
            loginTime: Date.now(),
            duration: Date.now() - startTime,
            timestamp: Date.now()
          };
          return true;
        }

        // 检查当前是否在登录页面
        const currentUrl = this.page.url();
        const isLoginPage = currentUrl.includes('login.1688.com') ||
                           currentUrl.includes('passport.1688.com') ||
                           currentUrl.includes('signin');

        if (!isLoginPage) {
          console.log('  📍 当前不在登录页面，等待用户操作...');
        }

        // 等待下一次检查
        console.log('  ⏳ 等待用户登录或页面变化...');
        await this.page.waitForTimeout(checkInterval);

      } catch (error) {
        console.log(`  ⚠️ 检查过程中出错: ${error.message}`);
        await this.page.waitForTimeout(checkInterval);
      }
    }

    console.log('  ⏰ 登录监测超时');
    this.testResults.loginDetection = {
      success: false,
      reason: 'timeout',
      duration: maxWaitTime,
      timestamp: Date.now()
    };
    return false;
  }

  async checkIfLoggedIn() {
    console.log('  🔍 检查登录状态...');

    try {
      // 检查用户头像（最可靠的登录指标）
      const avatarSelectors = [
        '.userAvatarLogo img',
        '.user-avatar img',
        '.avatar img',
        '.user-info .avatar',
        '.login-user .avatar'
      ];

      let hasAvatar = false;
      let avatarInfo = null;

      for (const selector of avatarSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const bbox = await element.boundingBox();
              if (bbox && bbox.width > 0 && bbox.height > 0) {
                hasAvatar = true;
                avatarInfo = {
                  selector,
                  bbox: {
                    x1: bbox.x,
                    y1: bbox.y,
                    x2: bbox.x + bbox.width,
                    y2: bbox.y + bbox.height
                  },
                  width: bbox.width,
                  height: bbox.height
                };
                console.log(`    ✅ 找到用户头像: ${selector} (${bbox.width}x${bbox.height})`);
                break;
              }
            }
          }
        } catch (error) {
          // 忽略单个错误
        }
      }

      // 检查其他登录指标
      const currentUrl = this.page.url();
      const isLoggedIn = !currentUrl.includes('login') &&
                       !currentUrl.includes('signin') &&
                       !currentUrl.includes('passport') &&
                       currentUrl.includes('1688.com');

      if (hasAvatar && isLoggedIn) {
        console.log('    ✅ 用户头像存在且URL正确，确认登录成功');
        return true;
      }

      // 检查是否有登录后的元素
      const logoutSelectors = ['.logout', '.member-logout', '[class*="logout"]'];
      let hasLogout = false;

      for (const selector of logoutSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              hasLogout = true;
              console.log(`    ✅ 找到退出按钮: ${selector}`);
              break;
            }
          }
        } catch (error) {
          // 忽略单个错误
        }
      }

      if (hasLogout) {
        console.log('    ✅ 检测到退出按钮，确认登录成功');
        return true;
      }

      console.log(`    ❌ 未检测到明确的登录指标`);
      console.log(`    - 用户头像: ${hasAvatar ? '✅' : '❌'}`);
      console.log(`    - 登录状态URL: ${isLoggedIn ? '✅' : '❌'}`);
      console.log(`    - 退出按钮: ${hasLogout ? '✅' : '❌'}`);

      return false;

    } catch (error) {
      console.log(`    ❌ 登录状态检查失败: ${error.message}`);
      return false;
    }
  }

  async saveCookies() {
    console.log('💾 保存登录后的Cookie...');

    try {
      // 获取所有Cookie
      const cookies = await this.context.cookies();
      console.log(`    📊 获取到 ${cookies.length} 个Cookie`);

      // 过滤重要Cookie
      const importantCookies = cookies.filter(cookie => {
        return cookie.name.includes('session') ||
               cookie.name.includes('token') ||
               cookie.name.includes('login') ||
               cookie.name.includes('auth') ||
               cookie.name.includes('user') ||
               cookie.domain.includes('1688');
      });

      console.log(`    🎯 重要Cookie: ${importantCookies.length} 个`);

      // 创建Cookie数据结构
      const cookieData = {
        timestamp: Date.now(),
        url: this.page.url(),
        userAgent: await this.page.evaluate(() => navigator.userAgent),
        cookies: cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        })),
        importantCookies: importantCookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain
        })),
        summary: {
          totalCookies: cookies.length,
          importantCookies: importantCookies.length,
          domain: this.page.url(),
          updateTime: new Date().toISOString()
        }
      };

      // 保存到标准Cookie路径
      const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
      const cookieDir = path.dirname(cookiePath);

      // 确保目录存在
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 备份现有Cookie（如果存在）
      if (fs.existsSync(cookiePath)) {
        const backupPath = `${cookiePath}.backup.${Date.now()}`;
        fs.copyFileSync(cookiePath, backupPath);
        console.log(`    📋 已备份现有Cookie到: ${backupPath}`);
      }

      // 保存新Cookie
      fs.writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));

      console.log(`    ✅ Cookie保存成功: ${cookiePath}`);
      this.testResults.cookieSave = {
        success: true,
        cookiePath,
        totalCookies: cookies.length,
        importantCookies: importantCookies.length,
        timestamp: Date.now()
      };

    } catch (error) {
      console.log(`    ❌ Cookie保存失败: ${error.message}`);
      this.testResults.cookieSave = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async verifySavedCookies() {
    console.log('✅ 验证保存的Cookie...');

    try {
      const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';

      if (!fs.existsSync(cookiePath)) {
        console.log('    ❌ Cookie文件不存在');
        return false;
      }

      const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));

      console.log(`    ✅ Cookie文件存在: ${cookieData.summary.totalCookies} 个Cookie`);
      console.log(`    ✅ 重要Cookie: ${cookieData.summary.importantCookies} 个`);
      console.log(`    ✅ 保存时间: ${cookieData.summary.updateTime}`);

      this.testResults.finalVerification = {
        success: true,
        cookieFileExists: true,
        cookieCount: cookieData.summary.totalCookies,
        importantCookies: cookieData.summary.importantCookies,
        timestamp: Date.now()
      };

      return true;

    } catch (error) {
      console.log(`    ❌ Cookie验证失败: ${error.message}`);
      this.testResults.finalVerification = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      return false;
    }
  }

  async generateTestReport() {
    console.log('📊 生成测试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'clean-login-test',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        cleanNavigationSuccess: this.testResults.cleanNavigation?.success || false,
        loginDetectionSuccess: this.testResults.loginDetection?.success || false,
        cookieSaveSuccess: this.testResults.cookieSave?.success || false,
        verificationSuccess: this.testResults.finalVerification?.success || false,
        overallSuccess: this.testResults.cookieSave?.success || false
      },
      processFlow: [
        '1. 启动浏览器（不注入Cookie）',
        '2. 清理导航到1688',
        '3. 等待用户手动登录',
        '4. 检测登录状态',
        '5. 保存登录后的Cookie',
        '6. 验证Cookie保存'
      ],
      recommendations: [
        'Cookie已更新，可以继续后续的UI识别操作',
        '建议定期检查Cookie有效性',
        '如果登录失效，可以重新运行此测试'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/clean-login-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 测试报告已生成: ${reportPath}`);

    // 输出关键结果
    console.log('\n🎯 测试结果总结:');
    console.log(`  浏览器启动: ${this.testResults.browserLaunch?.success ? '✅' : '❌'}`);
    console.log(`  清理导航: ${this.testResults.cleanNavigation?.success ? '✅' : '❌'}`);
    console.log(`  登录检测: ${this.testResults.loginDetection?.success ? '✅' : '❌'}`);
    console.log(`  Cookie保存: ${this.testResults.cookieSave?.success ? '✅' : '❌'}`);
    console.log(`  整体成功: ${report.summary.overallSuccess ? '✅' : '❌'}`);

    if (this.testResults.cookieSave?.success) {
      console.log(`  保存的Cookie: ${this.testResults.cookieSave.totalCookies} 个`);
      console.log(`  重要Cookie: ${this.testResults.cookieSave.importantCookies} 个`);
    }

    return report;
  }

  async generateTimeoutReport() {
    console.log('⏰ 生成超时报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'clean-login-timeout',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        cleanNavigationSuccess: this.testResults.cleanNavigation?.success || false,
        loginDetectionSuccess: false,
        reason: 'timeout',
        overallSuccess: false
      },
      recommendations: [
        '检查登录页面是否正常显示',
        '检查网络连接状态',
        '手动尝试登录后重新运行测试',
        '考虑增加等待时间'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/clean-login-timeout-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 超时报告已生成: ${reportPath}`);
  }

  async cleanup() {
    console.log('🧹 清理资源...');

    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      console.log('✅ 资源清理完成');
    } catch (error) {
      console.log(`⚠️ 清理过程中出现错误: ${error.message}`);
    }
  }
}

// 主执行函数
async function main() {
  const test = new CleanLoginTest();

  console.log('📌 请准备好手动登录1688账户');
  console.log('📌 测试将在5分钟内监测登录状态');
  console.log('📌 登录成功后会自动保存Cookie\n');

  try {
    await test.runCleanLoginTest();
    console.log('\n✅ 清理登录测试完成');
  } catch (error) {
    console.error('\n💥 清理登录测试失败:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CleanLoginTest;