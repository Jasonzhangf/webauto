import { BaseModule, ModuleInfo } from './rcc-basemodule';
import * as fs from 'fs-extra';
import * as path from 'path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { chromium } from 'playwright';
import * as open from 'open';

export interface QRCodeInfo {
  data: string;
  location: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
  };
  screenshotPath: string;
  displayTime: number;
}

export interface QRCodeLoginConfig {
  weiboUrl: string;
  timeout: number;        // 毫秒
  screenshotDir: string;
  displayQRCode: boolean;
}

export class QRCodeProcessor extends BaseModule {
  private browser: any;
  private context: any;
  private page: any;

  constructor() {
    const moduleInfo: ModuleInfo = {
      id: 'weibo-qrcode-processor',
      name: 'Weibo QR Code Processor',
      version: '1.0.0',
      description: 'Handles QR code generation, display, and login verification for Weibo',
      type: 'processor'
    };

    super(moduleInfo);
  }

  public async initialize(): Promise<void> {
    await super.initialize();
    this.logInfo('QR Code Processor initialized');
  }

  public async processQRCodeLogin(config: QRCodeLoginConfig, updateProgress?: (message: string) => Promise<void>): Promise<{
    success: boolean;
    qrCodeInfo?: QRCodeInfo;
    cookies?: any[];
    error?: string;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      this.logInfo('Starting QR code login process', { 
        weiboUrl: config.weiboUrl,
        timeout: config.timeout 
      });

      // 1. 启动浏览器（非headless模式用于截图）
      updateProgress?.('Launching browser for QR code login...');
      await this.launchBrowser();

      // 2. 打开微博登录页面
      updateProgress?.('Opening Weibo login page...');
      await this.openWeiboLogin(config.weiboUrl);

      // 3. 等待二维码加载
      updateProgress?.('Waiting for QR code to load...');
      await this.waitForQRCodeLoad();

      // 4. 截取并识别二维码
      updateProgress?.('Capturing and analyzing QR code...');
      const qrCodeInfo = await this.captureAndAnalyzeQRCode(config.screenshotDir);
      
      if (!qrCodeInfo) {
        throw new Error('Failed to detect QR code on the page');
      }

      // 5. 显示二维码（如果需要）
      if (config.displayQRCode) {
        updateProgress?.('Displaying QR code for scanning...');
        await this.displayQRCode(qrCodeInfo);
      }

      // 6. 等待扫码登录
      updateProgress?.('Waiting for QR code scan and login confirmation...');
      const loginResult = await this.waitForLoginConfirmation(config.timeout, updateProgress);

      // 7. 获取登录后的cookies
      let cookies = [];
      if (loginResult.success) {
        updateProgress?.('Extracting login cookies...');
        cookies = await this.extractCookies();
      }

      const executionTime = Date.now() - startTime;
      
      if (loginResult.success) {
        this.logInfo('QR code login successful', { 
          executionTime,
          qrCodeData: qrCodeInfo.data.substring(0, 50) + '...'
        });
        
        return {
          success: true,
          qrCodeInfo,
          cookies,
          executionTime
        };
      } else {
        throw new Error(loginResult.error || 'QR code login failed');
      }

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.error('QR code login process failed', { 
        error: error instanceof Error ? error.message : error,
        executionTime 
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      };
    } finally {
      // 清理浏览器资源
      await this.cleanup();
    }
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,  // 二维码登录需要非headless模式
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1200,800'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1200, height: 800 }
    });

    this.page = await this.context.newPage();
    
    this.logInfo('Browser launched successfully');
  }

  private async openWeiboLogin(weiboUrl: string): Promise<void> {
    // 微博二维码登录页面URL
    const loginUrl = 'https://weibo.com/login.php';
    
    await this.page.goto(loginUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // 检查是否有二维码登录选项（微博可能有多个登录方式）
    const qrCodeTab = await this.page.$('.qrcode-tab, [data-type="qrcode"], .qrcode-login, .qr_code_login, [href*="qrcode"]');
    if (qrCodeTab) {
      await qrCodeTab.click();
      await this.page.waitForTimeout(1000);
    }

    // 如果页面没有二维码，尝试直接导航到二维码登录页面
    const hasQRCode = await this.page.$('.qrcode-img, #qrcode, .qr-code, [class*="qrcode"]');
    if (!hasQRCode) {
      await this.page.goto('https://weibo.com/login.php?client=ssologin.js(v1.4.15)&entry=weibo', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    }

    this.logInfo('Weibo QR code login page opened');
  }

  private async waitForQRCodeLoad(): Promise<void> {
    // 等待二维码元素加载
    await this.page.waitForSelector('.qrcode-img, #qrcode, .qr-code, [class*="qrcode"]', {
      timeout: 30000
    });

    // 额外等待确保二维码完全加载
    await this.page.waitForTimeout(2000);
    
    this.logInfo('QR code loaded successfully');
  }

  private async captureAndAnalyzeQRCode(screenshotDir: string): Promise<QRCodeInfo | null> {
    try {
      // 确保截图目录存在
      await fs.ensureDir(screenshotDir);

      // 创建截图文件路径
      const timestamp = Date.now();
      const screenshotPath = path.join(screenshotDir, `qrcode_${timestamp}.png`);

      // 截取整个页面
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: false,
        type: 'png'
      });

      // 尝试找到二维码的具体位置并截取
      const qrCodeElement = await this.page.$('.qrcode-img, #qrcode, .qr-code, [class*="qrcode"]');
      let qrCodePath = screenshotPath;

      if (qrCodeElement) {
        const qrCodeBoundingBox = await qrCodeElement.boundingBox();
        if (qrCodeBoundingBox) {
          // 裁剪二维码区域
          const croppedPath = path.join(screenshotDir, `qrcode_${timestamp}_cropped.png`);
          
          await sharp(screenshotPath)
            .extract({
              left: Math.floor(qrCodeBoundingBox.x),
              top: Math.floor(qrCodeBoundingBox.y),
              width: Math.floor(qrCodeBoundingBox.width),
              height: Math.floor(qrCodeBoundingBox.height)
            })
            .toFile(croppedPath);
          
          qrCodePath = croppedPath;
        }
      }

      // 读取图像并识别二维码
      const imageBuffer = await fs.readFile(qrCodePath);
      const image = await sharp(imageBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Convert Buffer to Uint8ClampedArray for jsQR
      const uint8ClampedArray = new Uint8ClampedArray(image.data.buffer);
      const code = jsQR(uint8ClampedArray, image.info.width, image.info.height);

      if (code) {
        this.logInfo('QR code detected successfully', { 
          data: code.data.substring(0, 50) + '...',
          location: code.location 
        });

        return {
          data: code.data,
          location: code.location,
          screenshotPath: qrCodePath,
          displayTime: Date.now()
        };
      } else {
        this.warn('No QR code detected in screenshot');
        return null;
      }

    } catch (error) {
      this.error('Failed to capture or analyze QR code', { error });
      return null;
    }
  }

  private async displayQRCode(qrCodeInfo: QRCodeInfo): Promise<void> {
    try {
      this.logInfo('QR code displayed in browser window for scanning...');
      this.logInfo('Please use your mobile Weibo app to scan the QR code in the browser window');
      
      // 不再需要打开截图，因为浏览器已经在非headless模式下显示二维码
      // 用户可以直接在浏览器窗口中看到并扫描二维码
      
    } catch (error) {
      this.error('Failed to display QR code notification', { error });
      // 即使通知失败也继续流程
    }
  }

  private async waitForLoginConfirmation(timeout: number, updateProgress?: (message: string) => Promise<void>): Promise<{
    success: boolean;
    error?: string;
  }> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000; // 转换为毫秒

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 检查是否已经登录成功
        const isLoggedIn = await this.checkLoginStatus();
        
        if (isLoggedIn) {
          updateProgress?.('Login confirmed! Extracting session...');
          return { success: true };
        }

        // 检查是否二维码过期
        const isExpired = await this.checkQRCodeExpired();
        if (isExpired) {
          return { success: false, error: 'QR code has expired' };
        }

        // 更新进度
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 1000);
        updateProgress?.(`Waiting for scan... (${elapsed}s elapsed, ${remaining}s remaining)`);

        // 等待1秒后再次检查
        await this.page.waitForTimeout(1000);

      } catch (error) {
        this.warn('Error during login status check', { error });
        await this.page.waitForTimeout(1000);
      }
    }

    return { success: false, error: 'QR code login timeout' };
  }

  private async checkLoginStatus(): Promise<boolean> {
    try {
      // 检查是否跳转到登录成功页面
      const currentUrl = this.page.url();
      if (currentUrl.includes('weibo.com') && !currentUrl.includes('login')) {
        return true;
      }

      // 检查页面是否包含登录成功的元素
      const loginSuccessElements = [
        '.gn_name',           // 微博用户名
        '.S_bg2',            // 微博首页背景
        '[href*="/home"]',    // 首页链接
        '.WB_global_nav'      // 全局导航栏
      ];

      for (const selector of loginSuccessElements) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      // 检查cookie中是否有登录信息
      const cookies = await this.context.cookies();
      const hasLoginCookie = cookies.some((cookie: any) => 
        cookie.name.includes('SUB') || 
        cookie.name.includes('SINAGLOBAL') ||
        cookie.name.includes('ULV')
      );

      return hasLoginCookie;

    } catch (error) {
      this.warn('Error checking login status', { error });
      return false;
    }
  }

  private async checkQRCodeExpired(): Promise<boolean> {
    try {
      // 检查是否有二维码过期提示
      const expiredSelectors = [
        '.qrcode-expired',
        '.qrcode-refresh',
        '.refresh-btn',
        '[class*="expired"]',
        '[class*="refresh"]'
      ];

      for (const selector of expiredSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      return false;

    } catch (error) {
      this.warn('Error checking QR code expiration', { error });
      return false;
    }
  }

  private async extractCookies(): Promise<any[]> {
    try {
      const cookies = await this.context.cookies();
      
      // 过滤出微博相关的cookies
      const weiboCookies = cookies.filter((cookie: any) => 
        cookie.domain.includes('weibo.com') || 
        cookie.domain.includes('sina.com.cn')
      );

      this.logInfo('Cookies extracted', { 
        count: weiboCookies.length,
        domains: [...new Set(weiboCookies.map((c: any) => c.domain))]
      });

      return weiboCookies;

    } catch (error) {
      this.error('Failed to extract cookies', { error });
      return [];
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      
      this.logInfo('Browser resources cleaned up');
      
    } catch (error) {
      this.warn('Error during cleanup', { error });
    }
  }

  public async shutdown(): Promise<void> {
    await this.cleanup();
    await super.shutdown();
  }
}