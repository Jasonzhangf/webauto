/**
 * WebAuto Operator Framework - 页面操作子基类
 * @package @webauto/operator-framework
 */
import { UniversalOperator } from './UniversalOperator';
export class PageBasedOperator extends UniversalOperator {
    constructor(config) {
        super({
            ...config,
            type: 'page-based'
        });
        this._browser = null;
        this._browserContext = null;
        this._page = null;
        this._pageConfig = config;
    }
    // 核心方法实现
    async initialize() {
        try {
            await this.initializeBrowser();
            await this.initializePage();
            await this.onPageReady(this._page);
            this.log('PageBasedOperator initialized successfully');
        }
        catch (error) {
            throw new Error(`PageBasedOperator initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async execute(params) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        const startTime = Date.now();
        try {
            const result = await this.executePageOperation(this._page, params);
            result.executionTime = Date.now() - startTime;
            this.addToExecutionHistory(result);
            return result;
        }
        catch (error) {
            const errorResult = this.createErrorResult(`Page operation failed: ${error instanceof Error ? error.message : String(error)}`);
            errorResult.executionTime = Date.now() - startTime;
            this.addToExecutionHistory(errorResult);
            return errorResult;
        }
    }
    async cleanup() {
        try {
            if (this._page) {
                await this._page.close();
                this._page = null;
            }
            if (this._browserContext) {
                await this._browserContext.close();
                this._browserContext = null;
            }
            if (this._browser) {
                await this._browser.close();
                this._browser = null;
            }
            this.log('PageBasedOperator cleaned up successfully');
        }
        catch (error) {
            this.log(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 页面操作方法
    async navigate(params) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        try {
            const response = await this._page.goto(params.url, {
                waitUntil: params.waitUntil || 'networkidle',
                timeout: params.timeout || this._pageConfig.timeout || 30000
            });
            return this.createSuccessResult({
                url: this._page.url(),
                status: response?.status(),
                title: await this._page.title()
            });
        }
        catch (error) {
            return this.createErrorResult(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async findElement(params) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        try {
            const element = await this._page.waitForSelector(params.selector, {
                timeout: params.timeout || 5000,
                state: params.state || 'visible'
            });
            if (!element) {
                return this.createErrorResult(`Element not found: ${params.selector}`);
            }
            return this.createSuccessResult({
                selector: params.selector,
                found: true,
                element: await element.evaluate(el => ({
                    tagName: el.tagName,
                    textContent: el.textContent,
                    innerHTML: el.innerHTML,
                    attributes: Array.from(el.attributes).reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {})
                }))
            });
        }
        catch (error) {
            return this.createErrorResult(`Element not found: ${params.selector}`);
        }
    }
    async extractText(params) {
        const elementResult = await this.findElement(params);
        if (!elementResult.success) {
            return elementResult;
        }
        try {
            const text = await this._page.textContent(params.selector);
            return this.createSuccessResult({
                selector: params.selector,
                text: text?.trim() || ''
            });
        }
        catch (error) {
            return this.createErrorResult(`Text extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async clickElement(params) {
        const elementResult = await this.findElement(params);
        if (!elementResult.success) {
            return elementResult;
        }
        try {
            await this._page.click(params.selector, {
                timeout: params.timeout || 5000
            });
            return this.createSuccessResult({
                selector: params.selector,
                clicked: true
            });
        }
        catch (error) {
            return this.createErrorResult(`Click failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async typeText(params) {
        const elementResult = await this.findElement(params);
        if (!elementResult.success) {
            return elementResult;
        }
        try {
            await this._page.fill(params.selector, params.text, {
                timeout: params.timeout || 5000
            });
            return this.createSuccessResult({
                selector: params.selector,
                typed: true,
                text: params.text
            });
        }
        catch (error) {
            return this.createErrorResult(`Type text failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async waitForNavigation(params = {}) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        try {
            await this._page.waitForNavigation({
                timeout: params.timeout || this._pageConfig.timeout || 30000
            });
            return this.createSuccessResult({
                url: this._page.url(),
                navigated: true
            });
        }
        catch (error) {
            return this.createErrorResult(`Wait for navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async takeScreenshot(params = {}) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        try {
            const screenshot = await this._page.screenshot({
                fullPage: params.fullPage || false,
                path: params.path
            });
            return this.createSuccessResult({
                screenshot: screenshot.toString('base64'),
                path: params.path,
                fullPage: params.fullPage || false
            });
        }
        catch (error) {
            return this.createErrorResult(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async executeScript(params) {
        if (!this._page) {
            return this.createErrorResult('Page not initialized');
        }
        try {
            const result = await this._page.evaluate(params.script, params.args || []);
            return this.createSuccessResult({
                script: params.script,
                result,
                executed: true
            });
        }
        catch (error) {
            return this.createErrorResult(`Script execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 获取页面状态
    getPage() {
        return this._page;
    }
    getBrowser() {
        return this._browser;
    }
    getBrowserContext() {
        return this._browserContext;
    }
    // 私有方法
    async initializeBrowser() {
        const { chromium } = require('playwright');
        const options = {
            headless: this._pageConfig.headless !== false,
            ...this._pageConfig.browserOptions
        };
        this._browser = await chromium.launch(options);
        this._browserContext = await this._browser.newContext({
            viewport: this._pageConfig.viewport || { width: 1920, height: 1080 }
        });
    }
    async initializePage() {
        if (!this._browserContext) {
            throw new Error('Browser context not initialized');
        }
        this._page = await this._browserContext.newPage();
        // 设置页面超时
        this._page.setDefaultTimeout(this._pageConfig.timeout || 30000);
        // 监听页面错误
        this._page.on('pageerror', (error) => {
            this.log(`Page error: ${error instanceof Error ? error.message : String(error)}`);
        });
        // 监听控制台消息
        this._page.on('console', (msg) => {
            this.log(`Console ${msg.type()}: ${msg.text()}`);
        });
    }
    log(message) {
        console.log(`[${this._config.name}] ${message}`);
    }
}
//# sourceMappingURL=PageBasedOperator.js.map