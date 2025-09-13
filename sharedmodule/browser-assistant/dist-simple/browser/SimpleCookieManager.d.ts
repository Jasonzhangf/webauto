/**
 * 简化的Cookie管理器
 * 提供基本的Cookie持久化功能
 */
import { BrowserContext, Page } from 'playwright';
export interface CookieData {
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}
export declare class CookieManager {
    private storagePath;
    private cookies;
    constructor(storagePath?: string);
    /**
     * 确保存储目录存在
     */
    private ensureStorageDirectory;
    /**
     * 检查是否有指定域名的登录Cookie
     */
    hasLoginCookies(domain: string): boolean;
    /**
     * 加载指定域名的Cookie
     */
    loadCookies(context: BrowserContext, domain: string): Promise<boolean>;
    /**
     * 保存当前页面的Cookie
     */
    saveCookies(page: Page): Promise<void>;
    /**
     * 清除所有Cookie
     */
    clearAllCookies(): Promise<void>;
    /**
     * 获取Cookie统计信息
     */
    getCookieStats(): {
        totalDomains: number;
        totalCookies: number;
        domainStats: Record<string, number>;
    };
}
//# sourceMappingURL=SimpleCookieManager.d.ts.map