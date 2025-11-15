/**
 * WebAuto 浏览器统一入口 (Node.js版本)
 * 
 * 这是项目中Node.js环境的浏览器导入点
 * 所有浏览器操作都应该通过这个文件进行
 * 
 * 使用方法:
 *   import { getBrowser, quickTest, stealthMode } from './browser.js';
 *   
 *   // 简单使用
 *   const browser = await getBrowser();
 *   await browser.start();
 *   const page = await browser.newPage();
 *   await page.goto('https://www.baidu.com');
 *   await browser.close();
 *   
 *   // 快速测试
 *   await quickTest();
 *   
 *   // 隐匿模式
 *   const browser = await stealthMode();
 *   const page = await browser.newPage();
 *   await page.goto('https://example.com');
 *   await browser.close();
 */

// 导入所有必要的功能
import {
    // 管理器类
    BrowserManager,
    
    // 快捷函数
    getBrowser,
    startBrowser,
    quickTest,
    stealthMode,
    headlessMode,
    closeAll,
    getManager,
    
    // 配置函数
    getDefaultConfig,
    getStealthConfig,
    getHeadlessConfig,
} from './browser-manager.js';

// 安装导入安全防护（禁止外部直接 import camoufox/playwright）
import './security/enforce-imports.js';

// 启动远程通信服务（无条件）
import { startBrowserService } from './remote-service.js';
import { loadBrowserServiceConfig } from './browser-service-config.js';
const __service = (() => {
    try {
        const cfg = loadBrowserServiceConfig();
        return startBrowserService({ host: cfg.host, port: cfg.port });
    } catch (e) {
        // 已有其它进程占用时忽略
        return null;
    }
})();

// 重新导出核心类以便直接使用
import browserManager from './browser-manager.js';

// 重新导出配置类
export { BrowserConfig } from './browser-config.js';

// 重新导出异常类
export {
    BrowserError,
    BrowserNotStartedError,
    PageNotCreatedError,
    NavigationError,
    ElementNotFoundError,
    TimeoutError,
    CookieError
} from './browser-errors.js';

export {
    BrowserManager,
    browserManager,
    getManager,
    
    // 快捷函数
    getBrowser,
    startBrowser,
    quickTest,
    stealthMode,
    headlessMode,
    closeAll,
    
    // 配置
    getDefaultConfig,
    getStealthConfig,
    getHeadlessConfig,
};

// 重新导出Cookie管理器
export { CookieManager } from './cookie-manager.js';

// 远程服务启动器
export { startBrowserService } from './remote-service.js';

// 指纹管理（可选直接使用）
export { generateFingerprint, applyFingerprint } from './fingerprint-manager.js';

// 版本号
export const __version__ = '3.1.0';

// 测试函数
export async function testBrowser() {
    console.log('WebAuto Node.js 浏览器统一入口测试');
    console.log('='.repeat(40));
    
    try {
        console.log('\n1. 快速测试:');
        await quickTest({ headless: true, waitTime: 2 });
        
        console.log('\n2. 状态检查:');
        const manager = getManager();
        const status = manager.getStatus();
        console.log(`管理器状态:`, status);
        
        console.log('\n3. 配置检查:');
        console.log(`默认配置:`, getDefaultConfig());
        console.log(`隐匿配置参数数:`, getStealthConfig().args?.length || 0);
        
        console.log('\n✓ 统一入口测试成功！');
        
    } catch (error) {
        console.error(`\n测试失败:`, error);
        
    } finally {
        await closeAll();
        console.log('\n浏览器已关闭');
    }
}

// 如果是直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
    testBrowser().catch(console.error);
}
