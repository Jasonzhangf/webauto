// 微博主页链接捕获工作流
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface WeiboConfig {
  target: number;
  url: string;
  postContainer: string;
  loginSelector: string;
}

interface CaptureResult {
  target: number;
  actual: number;
  success: boolean;
  links: Array<{ href: string; captureOrder: number }>;
  savedFile?: string;
}

class WeiboHomepageWorkflow {
  private allLinks: Set<string>;
  private config: WeiboConfig;

  constructor() {
    this.allLinks = new Set();
    this.config = {
      target: 50,
      url: 'https://weibo.com',
      postContainer: '.vue-recycle-scroller__item-view',
      loginSelector: '#app > div.woo-box-flex.woo-box-column.Frame_wrap_3g67Q > div.Frame_top_2ybWw > div > div.Nav_wrap_gHB1a.grayTheme > div > div > div.woo-box-flex.woo-box-alignCenter.woo-box-justifyCenter.Nav_mid_5pisP > div > div.woo-box-flex.woo-tab-nav > a:nth-child(5) > div > div > div > div > img'
    };
  }

  async execute(): Promise<CaptureResult> {
    console.log('🎯 ===== 执行微博主页链接捕获工作流 =====');

    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
      // 通用节点：加载Cookie
      await this.loadCookies(context);

      // 通用节点：导航到目标
      await page.goto(this.config.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 通用节点：验证登录
      await this.verifyLogin(page);

      // 特定节点：主页滚动捕获
      const result = await this.performScrollCapture(page);

      // 通用节点：保存结果
      await this.saveResults(result, 'homepage');

      return result;

    } finally {
      await browser.close();
    }
  }

  // 通用节点：加载Cookie
  async loadCookies(context: BrowserContext): Promise<void> {
    try {
      const cookiePath = join(__dirname, '..', 'sharedmodule', 'operations-framework', 'cookies.json');
      const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));

      const cookies = cookieData.map((cookie: any) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      }));

      await context.addCookies(cookies);
      console.log('✅ Cookie加载成功');
    } catch (error: any) {
      console.error('❌ Cookie加载失败:', error.message);
    }
  }

  // 通用节点：验证登录
  async verifyLogin(page: Page): Promise<boolean> {
    try {
      const loginElement = await page.$(this.config.loginSelector);
      if (loginElement) {
        const src = await loginElement.getAttribute('src');
        console.log('🔐 登录状态:', { found: true, src, valid: true });
        return true;
      }
      throw new Error('登录验证失败');
    } catch (error: any) {
      console.log('🔐 登录状态:', { found: false, src: null, valid: false });
      throw new Error('登录验证失败，请检查Cookie');
    }
  }

  // 特定节点：主页滚动捕获
  async performScrollCapture(page: Page): Promise<CaptureResult> {
    console.log('🔄 开始滚动捕获...');

    let scrollCount = 0;
    let noNewLinksCount = 0;
    const maxScrollAttempts = 200;

    // 初始捕获
    await this.captureCurrentLinks(page, '初始状态');

    while (scrollCount < maxScrollAttempts && this.allLinks.size < this.config.target && noNewLinksCount < 5) {
      scrollCount++;

      // 执行滚动
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1000);

      // 捕获链接
      const newCount = await this.captureCurrentLinks(page, `滚动 ${scrollCount}`);

      if (newCount === 0) {
        noNewLinksCount++;
        console.log(`   ⚠️ 无新增链接 (${noNewLinksCount}/5)`);
      } else {
        noNewLinksCount = 0;
        console.log(`   ✅ 新增 ${newCount} 个链接 (总计: ${this.allLinks.size})`);
      }

      // 检查是否到底
      if (await this.checkIfAtBottom(page)) {
        console.log('   📜 已到达页面底部');
        break;
      }
    }

    return {
      target: this.config.target,
      actual: this.allLinks.size,
      success: this.allLinks.size >= this.config.target,
      links: Array.from(this.allLinks).map((href, index) => ({ href, captureOrder: index + 1 }))
    };
  }

  // 特定节点：主页链接捕获
  async captureCurrentLinks(page: Page, context: string): Promise<number> {
    const newLinks = await page.evaluate((containerSelector: string) => {
      const containers = document.querySelectorAll(containerSelector);
      const postLinks = Array.from(containers).flatMap(container => {
        return Array.from(container.querySelectorAll('a')).filter(link => {
          return link.href.match(/weibo\.com\/\d+\/[A-Za-z0-9_\-]+/);
        }).map(link => link.href);
      });

      return [...new Set(postLinks)]; // 去重
    }, this.config.postContainer);

    let newCount = 0;
    newLinks.forEach(link => {
      if (!this.allLinks.has(link)) {
        this.allLinks.add(link);
        newCount++;
      }
    });

    if (newCount > 0) {
      console.log(`   ${context}: 发现 ${newLinks.length} 个链接，新增 ${newCount} 个`);
    }

    return newCount;
  }

  // 特定节点：检查是否到底
  async checkIfAtBottom(page: Page): Promise<boolean> {
    const state = await page.evaluate(() => ({
      scrollY: window.scrollY,
      pageHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight
    }));

    const scrollBuffer = 200;
    return state.scrollY + state.viewportHeight >= state.pageHeight - scrollBuffer;
  }

  // 通用节点：保存结果
  async saveResults(result: CaptureResult, workflowType: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputDir = join(process.env.HOME || '', '.webauto', 'weibo');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `weibo-links-${workflowType}-${timestamp}.json`;
      const filepath = join(outputDir, filename);

      const output = {
        ...result,
        timestamp,
        workflowType,
        method: 'Homepage Workflow'
      };

      fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
      console.log(`💾 结果已保存到: ${filepath}`);

      result.savedFile = filepath;
    } catch (error: any) {
      console.error('❌ 保存结果失败:', error.message);
    }
  }
}

// 导出工作流
export default WeiboHomepageWorkflow;

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  const workflow = new WeiboHomepageWorkflow();
  workflow.execute().then(result => {
    console.log('\n🎉 工作流执行完成!');
    console.log(`📊 结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`📈 捕获链接数: ${result.actual}`);
    if (result.savedFile) {
      console.log(`📄 结果文件: ${result.savedFile}`);
    }
  }).catch((error: any) => {
    console.error('💥 执行失败:', error.message);
    process.exit(1);
  });
}