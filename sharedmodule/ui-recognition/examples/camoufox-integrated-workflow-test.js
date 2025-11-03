/**
 * 基于现有标准工作流的Camoufox集成测试
 * 直接复用现有的1688 workflow引擎，添加Camoufox安全特性
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入现有的工作流组件
import Proper1688WorkflowTest from './proper-1688-workflow-test.js';

class CamoufoxIntegratedWorkflowTest extends Proper1688WorkflowTest {
  constructor() {
    super(); // 继承所有标准工作流功能

    // Camoufox特定配置
    this.camoufoxConfig = {
      executablePath: '/opt/homebrew/bin/camoufox',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-extensions-except=/opt/homebrew/lib/camoufox/camoufox.xpi',
        '--user-data-dir=/tmp/camoufox-integrated-' + Date.now(),
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occlusion',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ]
    };

    // 扩展测试结果以包含Camoufox特性
    this.workflowResults.browserSecurity = null;
    this.workflowResults.camoufoxLaunch = null;
    this.workflowResults.safetyChecks = null;
  }

  async launchCamoufoxBrowser() {
    console.log('🦊 启动Camoufox安全浏览器...');

    try {
      // 使用 launchPersistentContext 来支持 userDataDir
      this.context = await chromium.launchPersistentContext('/tmp/camoufox-integrated-' + Date.now(), {
        headless: false,
        executablePath: this.camoufoxConfig.executablePath,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/118.0',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        args: this.camoufoxConfig.args.filter(arg => !arg.startsWith('--user-data-dir'))
      });

      this.page = this.context.pages()[0] || await this.context.newPage();
      this.page.setDefaultTimeout(30000);
      await this.page.setDefaultNavigationTimeout(60000);

      console.log('✅ Camoufox浏览器启动成功');
      this.workflowResults.camoufoxLaunch = {
        success: true,
        browserType: 'camoufox',
        timestamp: Date.now()
      };

      return true;

    } catch (error) {
      console.log('❌ Camoufox启动失败，回退到Chromium:', error.message);

      // 回退到标准Chromium配置
      return await this.launchStandardBrowser();
    }
  }

  async launchStandardBrowser() {
    console.log('🔄 回退到标准Chromium浏览器...');

    try {
      // 使用 launchPersistentContext 简化启动过程
      this.context = await chromium.launchPersistentContext('/tmp/chromium-integrated-' + Date.now(), {
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

      this.workflowResults.camoufoxLaunch = {
        success: true,
        browserType: 'chromium',
        fallback: true,
        timestamp: Date.now()
      };

      console.log('✅ 标准Chromium浏览器启动成功');
      return true;

    } catch (error) {
      console.log('❌ 标准浏览器启动也失败:', error.message);
      this.workflowResults.camoufoxLaunch = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      return false;
    }
  }

  async runCamoufoxIntegratedWorkflow() {
    console.log('🔄 开始Camoufox集成workflow测试');

    try {
      // 1. 启动Camoufox浏览器（或回退到标准浏览器）
      const browserLaunched = await this.launchCamoufoxBrowser();
      if (!browserLaunched) {
        throw new Error('浏览器启动失败');
      }

      // 2. 执行标准1688 workflow（继承自父类）
      console.log('📋 执行标准1688登录workflow...');
      await this.runWorkflow();

      // 3. 添加Camoufox特定的安全检查
      await this.performCamoufoxSafetyChecks();

      // 4. 生成集成测试报告
      await this.generateIntegratedReport();

      console.log('✅ Camoufox集成workflow测试完成');

    } catch (error) {
      console.error('❌ Camoufox集成workflow测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async performCamoufoxSafetyChecks() {
    console.log('🔒 执行Camoufox安全检查...');

    try {
      // 检查当前页面是否安全
      const currentUrl = this.page.url();
      const isBlocked = currentUrl.includes('verify') ||
                      currentUrl.includes('captcha') ||
                      currentUrl.includes('risk');

      // 检查用户代理是否正确设置
      const userAgent = await this.page.evaluate(() => navigator.userAgent);
      const isCorrectUA = userAgent.includes('Firefox') || userAgent.includes('Chrome');

      // 检查是否有自动化检测特征
      const hasAutomationFeatures = await this.page.evaluate(() => {
        return window.navigator.webdriver ||
               window.chrome?.runtime?.onConnect ||
               document.documentElement.getAttribute('webdriver');
      });

      this.workflowResults.safetyChecks = {
        success: true,
        currentUrl: currentUrl,
        isBlocked: isBlocked,
        userAgent: userAgent,
        isCorrectUA: isCorrectUA,
        hasAutomationFeatures: hasAutomationFeatures,
        safetyScore: isBlocked ? 0 : (isCorrectUA && !hasAutomationFeatures ? 100 : 70),
        timestamp: Date.now()
      };

      console.log(`  📊 安全评分: ${this.workflowResults.safetyChecks.safetyScore}/100`);

      if (isBlocked) {
        console.log('  🚫 检测到可能的风控页面');
      } else {
        console.log('  ✅ 安全检查通过');
      }

    } catch (error) {
      console.log(`  ❌ 安全检查失败: ${error.message}`);
      this.workflowResults.safetyChecks = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async generateIntegratedReport() {
    console.log('📊 生成Camoufox集成测试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'camoufox-integrated-workflow',
      testResults: this.workflowResults,
      integration: {
        standardWorkflowUsed: true,
        camoufoxFeatures: {
          browserLaunch: this.workflowResults.camoufoxLaunch?.success || false,
          securityChecks: this.workflowResults.safetyChecks?.success || false,
          safetyScore: this.workflowResults.safetyChecks?.safetyScore || 0
        },
        inheritedFeatures: {
          cookieManagement: !!this.workflowResults.cookieLoading,
          anchorDetection: !!this.workflowResults.anchorDetection,
          loginWorkflow: !!this.workflowResults.manualLoginProcess,
          uiRecognition: !!this.workflowResults.uiRecognition
        }
      },
      summary: {
        overallSuccess: this.workflowResults.workflowComplete,
        browserType: this.workflowResults.camoufoxLaunch?.browserType || 'unknown',
        loginSuccess: this.workflowResults.anchorDetection?.hasAnchors || false,
        safetyScore: this.workflowResults.safetyChecks?.safetyScore || 0,
        recommendations: this.generateRecommendations()
      }
    };

    const reportPath = path.join(__dirname, '../reports/camoufox-integrated-workflow-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 集成测试报告已生成: ${reportPath}`);

    // 输出关键结果
    console.log('\n🎯 集成测试结果总结:');
    console.log(`  浏览器类型: ${report.summary.browserType}`);
    console.log(`  整体成功: ${report.summary.overallSuccess ? '✅' : '❌'}`);
    console.log(`  登录状态: ${report.summary.loginSuccess ? '✅' : '❌'}`);
    console.log(`  安全评分: ${report.summary.safetyScore}/100`);

    return report;
  }

  generateRecommendations() {
    const recommendations = [];

    if (!this.workflowResults.camoufoxLaunch?.success) {
      recommendations.push('Camoufox启动失败，检查安装和配置');
    }

    if (this.workflowResults.safetyChecks?.safetyScore < 80) {
      recommendations.push('安全评分较低，可能需要优化反检测配置');
    }

    if (!this.workflowResults.anchorDetection?.hasAnchors) {
      recommendations.push('未检测到登录锚点，可能需要手动登录');
    }

    if (this.workflowResults.workflowComplete) {
      recommendations.push('workflow成功完成，可以继续后续UI识别操作');
    }

    return recommendations;
  }

  // 重写父类的cleanup方法以包含Camoufox特定的清理
  async cleanup() {
    console.log('🧹 清理Camoufox集成资源...');

    try {
      // 清理context（使用launchPersistentContext时只需要清理context）
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // 清理browser（如果存在的话）
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      console.log('✅ 集成资源清理完成');
    } catch (error) {
      console.log(`⚠️ 清理过程中出现错误: ${error.message}`);
    }
  }
}

// 主执行函数
async function main() {
  const test = new CamoufoxIntegratedWorkflowTest();

  try {
    await test.runCamoufoxIntegratedWorkflow();
    console.log('\n✅ Camoufox集成workflow测试完成');
  } catch (error) {
    console.error('\n💥 Camoufox集成workflow测试失败:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CamoufoxIntegratedWorkflowTest;