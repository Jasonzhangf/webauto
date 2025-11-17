/**
 * 全局浏览器管理器
 * 对标Python版本的BrowserManager类
 * 统一所有浏览器调用的入口点
 */

import { BrowserConfig } from './browser-config.js';
import { BrowserError } from './browser-errors.js';
import { PlaywrightBrowser } from './playwright-browser.js';

export class BrowserManager {
    constructor() {
        if (BrowserManager._instance) {
            return BrowserManager._instance;
        }
        
        this._browser = null;
        this._config = BrowserConfig.getDefaultConfig();
        this._service = null;
        
        BrowserManager._instance = this;
    }

    static getInstance() {
        if (!BrowserManager._instance) {
            BrowserManager._instance = new BrowserManager();
        }
        return BrowserManager._instance;
    }

    /**
     * 获取浏览器实例
     * @param {Object} config - 自定义配置
     * @param {Object} kwargs - 其他参数
     * @returns {PlaywrightBrowser} 浏览器实例
     */
    getBrowser(config = null, kwargs = {}) {
        // Node 侧浏览器实现已封禁，任何直接 getBrowser 调用都应改为使用 Python BrowserService。
        throw new BrowserError(
            'BrowserManager.getBrowser() 已被禁用：\n' +
            '请通过 Python BrowserService / libs/browser/remote-service.js 控制浏览器，\n' +
            '不要在 Node 层直接启动 Playwright/Chromium。',
        );
    }

    /**
     * 启动浏览器并返回实例
     * @param {Object} config - 自定义配置
     * @param {Object} kwargs - 其他参数
     * @returns {Promise<CamoufoxBrowser>} 浏览器实例
     */
    async startBrowser(config = null, kwargs = {}) {
        // 同样禁用 Node 直接启动浏览器
        throw new BrowserError(
            'BrowserManager.startBrowser() 已被禁用：\n' +
            '统一改用 Python BrowserService 提供的会话创建接口。',
        );
    }

    /**
     * 快速测试
     * @param {string} url - 测试URL
     * @param {number} waitTime - 等待时间
     * @param {boolean} headless - 是否无头模式
     * @param {Object} config - 自定义配置
     */
    async quickTest(url = 'https://www.baidu.com', waitTime = 3, headless = false, config = null) {
        throw new BrowserError(
            'BrowserManager.quickTest() 已被禁用：请使用 Python 侧 quick_test 或 BrowserService 的测试接口。',
        );
    }

    /**
     * 隐匿模式
     * @param {boolean} headless - 是否无头模式
     * @returns {Promise<CamoufoxBrowser>} 浏览器实例
     */
    async stealthMode(headless = false) {
        throw new BrowserError(
            'BrowserManager.stealthMode() 已被禁用：请改用 Python browser_interface.stealth_mode。',
        );
    }

    /**
     * 无头模式
     * @returns {Promise<CamoufoxBrowser>} 浏览器实例
     */
    async headlessMode() {
        throw new BrowserError(
            'BrowserManager.headlessMode() 已被禁用：请改用 Python browser_interface.headless_mode。',
        );
    }

    /**
     * 关闭所有浏览器实例
     */
    async closeAll() {
        // 这里保持幂等，不再尝试关闭 Node 侧浏览器（因为不会真正创建）
        this._browser = null;
    }

    /**
     * 获取管理器状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            hasInstance: this._browser !== null,
            isStarted: this._browser ? this._browser.isStarted() : false,
            pageCount: this._browser ? this._browser.getPageCount() : 0,
            config: this._config,
            engine: this._browser && this._browser.engineInfo ? this._browser.engineInfo : { name: 'unknown' }
        };
    }

    /**
     * 获取默认配置
     * @returns {Object} 默认配置
     */
    getDefaultConfig() {
        return BrowserConfig.getDefaultConfig();
    }

    /**
     * 获取隐匿配置
     * @returns {Object} 隐匿配置
     */
    getStealthConfig() {
        return BrowserConfig.getStealthConfig();
    }

    /**
     * 获取无头配置
     * @returns {Object} 无头配置
     */
    getHeadlessConfig() {
        return BrowserConfig.getHeadlessConfig();
    }
}

// 单例实例
BrowserManager._instance = null;

// 创建全局实例
const browserManager = BrowserManager.getInstance();

// 全局快捷函数
// 既支持传入完整config，也支持仅传入控制参数（如 headless）
export const getBrowser = (arg = {}) => {
    const looksLikeConfig = arg && (
        'args' in arg || 'locale' in arg || 'profileId' in arg || 'persistSession' in arg || 'userAgent' in arg || 'viewport' in arg
    );
    if (looksLikeConfig) return browserManager.getBrowser(arg, { headless: arg.headless });
    return browserManager.getBrowser(null, arg);
};

export const startBrowser = (arg = {}) => {
    const looksLikeConfig = arg && (
        'args' in arg || 'locale' in arg || 'profileId' in arg || 'persistSession' in arg || 'userAgent' in arg || 'viewport' in arg
    );
    if (looksLikeConfig) return browserManager.startBrowser(arg, { headless: arg.headless });
    return browserManager.startBrowser(null, arg);
};

export const quickTest = (kwargs = {}) => browserManager.quickTest(
    kwargs.url || 'https://www.baidu.com',
    kwargs.waitTime || 3,
    kwargs.headless || false,
    kwargs.config || null
);

export const stealthMode = (kwargs = {}) => browserManager.stealthMode(kwargs.headless || false);
export const headlessMode = (kwargs = {}) => browserManager.headlessMode();
export const closeAll = () => browserManager.closeAll();
export const getManager = () => browserManager;

// 配置相关快捷函数
export const getDefaultConfig = () => browserManager.getDefaultConfig();
export const getStealthConfig = () => browserManager.getStealthConfig();
export const getHeadlessConfig = () => browserManager.getHeadlessConfig();

// 默认导出管理器实例
export default browserManager;
