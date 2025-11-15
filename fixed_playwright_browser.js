/**
 * 修复版Playwright浏览器
 * 解决Camoufox ESM兼容性问题
 */

import { chromium } from 'playwright';

export class PlaywrightBrowser {
    constructor(config = {}) {
        this.config = {
            headless: false,
            locale: 'zh-CN',
            args: [
                '--start-maximized',
                '--disable-infobars',
                '--disable-extensions',
                '--disable-web-security',
                '--lang=zh-CN'
            ]
        };
        
        this.browser = null;
        this.context = null;
        this.pages = [];
    }
    
    async start() {
        console.log('🚀 启动Playwright浏览器...');
        
        try {
            
            this.browser = await chromium.launch(this.config);
            
            console.log('✅ Chromium浏览器启动成功');
            
            // 创建上下文
            this.context = await this.browser.newContext({
                locale: 'zh-CN',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            
            // 设置中文支持
            await this.context.setExtraHTTPHeaders({
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Charset': 'UTF-8'
            });
            
            // 反检测脚本
            const antiDetectionScript = `
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                    configurable: true
                });
                
                Object.defineProperty(navigator, 'language', {
                    get: () => 'zh-CN',
                    configurable: true
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['zh-CN', 'zh', 'en-US', 'en'],
                    configurable: true
                });
                
                Object.defineProperty(navigator, 'plugins', {
                    value: [{name: 'PDF Viewer'}, {name: 'Chrome PDF Viewer'}],
                    configurable: true
                });
                
                Object.defineProperty(screen, 'width', {
                    get: () => 1920,
                    configurable: true
                });
                
                Object.defineProperty(screen, 'height', {
                    get: () => 1080,
                    configurable: true
                });
            `;
            
            await this.context.addInitScript(antiDetectionScript);
            
            this._started = true;
            
            if (!this.config.headless) {
                console.log('🌐 GUI窗口模式');
                console.log('   请检查屏幕上是否有Chrome窗口');
                console.log('   如果没有，可能是macOS权限问题');
            }
            
        } catch (error) {
            console.error('❌ 浏览器启动失败:', error.message);
            throw error;
        }
    }
    
    async close() {
        if (this.context) {
            await this.context.close();
        }
        
        if (this.browser) {
            await this.browser.close();
            console.log('✅ 浏览器已关闭');
        }
        
        this._started = false;
    }
    
    async newPage() {
        if (!this._started) {
            throw new Error('浏览器未启动');
        }
        
        const page = await this.context.newPage();
        this.pages.push(page);
        return page;
    }
    
    async goto(url, waitTime = 3) {
        const page = await this.newPage();
        console.log(`🌍 导航到: ${url}`);
        
        await page.goto(url);
        
        if (waitTime > 0) {
            console.log(`⏳ 等待 ${waitTime} 秒...`);
            await page.waitForTimeout(waitTime * 1000);
        }
        
        const title = await page.title();
        console.log(`📰 页面标题: ${title}`);
        return page;
    }
    
    isStarted() {
        return this._started;
    }
    
    getPageCount() {
        return this.pages.length;
    }
    
    _started = false;
}
