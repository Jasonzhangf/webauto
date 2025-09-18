"use strict";
/**
 * 简化的Cookie管理器
 * 提供基本的Cookie持久化功能
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class CookieManager {
    storagePath;
    cookies = new Map();
    constructor(storagePath = './cookies') {
        this.storagePath = storagePath;
        this.ensureStorageDirectory();
    }
    /**
     * 确保存储目录存在
     */
    ensureStorageDirectory() {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }
    /**
     * 检查是否有指定域名的登录Cookie
     */
    hasLoginCookies(domain) {
        try {
            const cookieFile = path.join(this.storagePath, `${domain}.json`);
            if (fs.existsSync(cookieFile)) {
                const cookieData = fs.readFileSync(cookieFile, 'utf8');
                const cookies = JSON.parse(cookieData);
                if (Array.isArray(cookies)) {
                    // 检查是否包含关键登录Cookie
                    const hasSessionCookies = cookies.some(cookie => cookie.name.toLowerCase().includes('sub') || // 微博会话Cookie
                        cookie.name.toLowerCase().includes('srt') || // 登录状态
                        cookie.name.toLowerCase().includes('scf') || // 安全认证
                        cookie.name.toLowerCase().includes('xsrf') || // CSRF保护
                        cookie.name.toLowerCase().includes('csrf'));
                    // 检查Cookie是否过期
                    const hasValidCookies = cookies.some(cookie => {
                        if (cookie.expires === -1)
                            return true; // 会话Cookie
                        if (cookie.expires === 0)
                            return false; // 已过期
                        return cookie.expires * 1000 > Date.now(); // 检查过期时间
                    });
                    return hasSessionCookies && hasValidCookies;
                }
            }
            return false;
        }
        catch (error) {
            console.warn(`[CookieManager] Failed to check login cookies for ${domain}:`, error);
            return false;
        }
    }
    /**
     * 加载指定域名的Cookie
     */
    async loadCookies(context, domain) {
        try {
            const cookieFile = path.join(this.storagePath, `${domain}.json`);
            if (fs.existsSync(cookieFile)) {
                const cookieData = fs.readFileSync(cookieFile, 'utf8');
                const allCookies = JSON.parse(cookieData);
                if (Array.isArray(allCookies)) {
                    // 过滤出适用于目标域名的Cookie
                    const filteredCookies = allCookies.filter(cookie => {
                        const cookieDomain = cookie.domain || '';
                        // 检查Cookie域是否匹配目标域名
                        return cookieDomain === domain ||
                            cookieDomain === `.${domain}` ||
                            cookieDomain === domain.replace(/^www\./, '') ||
                            cookieDomain === `.${domain.replace(/^www\./, '')}` ||
                            domain.endsWith(cookieDomain.replace(/^\./, '')) ||
                            cookieDomain.endsWith(domain);
                    });
                    if (filteredCookies.length > 0) {
                        await context.addCookies(filteredCookies);
                        this.cookies.set(domain, filteredCookies);
                        console.log(`[CookieManager] Loaded ${filteredCookies.length} cookies for ${domain} (filtered from ${allCookies.length} total)`);
                        return true;
                    }
                    else {
                        console.warn(`[CookieManager] No applicable cookies found for ${domain} in ${allCookies.length} total cookies`);
                        return false;
                    }
                }
            }
            return false;
        }
        catch (error) {
            console.warn(`[CookieManager] Failed to load cookies for ${domain}:`, error);
            return false;
        }
    }
    /**
     * 保存当前页面的Cookie
     */
    async saveCookies(page) {
        try {
            const url = page.url();
            if (!url || url === 'about:blank') {
                return;
            }
            const domain = new URL(url).hostname;
            const cookies = await page.context().cookies();
            if (cookies.length > 0) {
                this.cookies.set(domain, cookies);
                const cookieFile = path.join(this.storagePath, `${domain}.json`);
                fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
                console.log(`[CookieManager] Saved ${cookies.length} cookies for ${domain}`);
            }
        }
        catch (error) {
            console.warn(`[CookieManager] Failed to save cookies:`, error);
        }
    }
    /**
     * 清除所有Cookie
     */
    async clearAllCookies() {
        try {
            this.cookies.clear();
            // 删除所有Cookie文件
            const files = fs.readdirSync(this.storagePath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(this.storagePath, file));
                }
            }
            console.log('[CookieManager] All cookies cleared');
        }
        catch (error) {
            console.warn('[CookieManager] Failed to clear cookies:', error);
        }
    }
    /**
     * 获取Cookie统计信息
     */
    getCookieStats() {
        const domainStats = {};
        let totalCookies = 0;
        for (const [domain, cookies] of this.cookies) {
            domainStats[domain] = cookies.length;
            totalCookies += cookies.length;
        }
        return {
            totalDomains: this.cookies.size,
            totalCookies,
            domainStats
        };
    }
}
exports.CookieManager = CookieManager;
//# sourceMappingURL=SimpleCookieManager.js.map