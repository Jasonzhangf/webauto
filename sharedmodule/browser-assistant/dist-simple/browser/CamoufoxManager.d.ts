/**
 * Camoufox浏览器管理器
 * 基于xiaohongshu-mcp的浏览器管理模式，支持Cookie管理和反指纹检测
 */
import { Page } from 'playwright';
import { BaseBrowserModule } from '../core/SimpleBaseModule';
export interface CamoufoxConfig {
    headless?: boolean;
    launchTimeout?: number;
    defaultTimeout?: number;
    viewport?: {
        width: number;
        height: number;
    };
    userAgent?: string;
    browserArgs?: string[];
    ignoreDefaultArgs?: string[];
    /**
     * 是否自动注入已保存的登录Cookie
     */
    autoInjectCookies?: boolean;
    /**
     * 是否在无Cookie时等待用户手动登录
     */
    waitForLogin?: boolean;
    /**
     * 登录检测超时时间（秒）
     */
    loginTimeout?: number;
    /**
     * 目标域名（用于Cookie管理）
     */
    targetDomain?: string;
}
export declare const defaultConfig: CamoufoxConfig;
/**
 * Camoufox浏览器管理器
 * 提供浏览器生命周期管理、Cookie持久化和反指纹检测功能
 */
export declare class CamoufoxManager extends BaseBrowserModule {
    private browser;
    private context;
    private page;
    private cookieManager;
    private camoufoxConfig;
    protected isInitialized: boolean;
    constructor(camoufoxConfig?: CamoufoxConfig);
    /**
     * 子类初始化逻辑
     */
    protected onInitialize(): Promise<void>;
    /**
     * 注册模块能力
     */
    protected registerCapabilities(): Promise<void>;
    /**
     * 健康检查
     */
    protected checkHealth(): boolean;
    /**
     * 子类清理逻辑
     */
    protected onCleanup(): Promise<void>;
    /**
     * 获取当前页面
     */
    getCurrentPage(): Promise<Page>;
    /**
     * 创建新的页面实例 - 基于xiaohongshu-mcp的fresh instance模式
     */
    createFreshPage(): Promise<Page>;
    /**
     * 导航到指定URL
     */
    navigate(url: string, options?: {
        timeout?: number;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    }): Promise<void>;
    /**
     * 获取页面标题
     */
    getPageTitle(): Promise<string>;
    /**
     * 获取页面URL
     */
    getPageUrl(): Promise<string>;
    /**
     * 执行JavaScript
     */
    evaluate<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;
    /**
     * 等待页面稳定
     */
    private waitForPageStable;
    /**
     * 设置页面错误处理
     */
    private setupPageErrorHandling;
    /**
     * 加载当前域名的Cookie
     */
    private loadCookiesForCurrentDomain;
    /**
     * 检查目标域名是否有有效的登录Cookie
     */
    hasValidLoginCookies(): boolean;
    /**
     * 自动注入登录Cookie并尝试登录
     */
    autoLoginWithCookies(targetUrl: string): Promise<boolean>;
    /**
     * 检查当前登录状态
     */
    checkLoginStatus(): Promise<boolean>;
    /**
     * 等待用户手动登录
     */
    waitForUserLogin(): Promise<boolean>;
    /**
     * 初始化并自动处理登录流程
     */
    initializeWithAutoLogin(targetUrl?: string): Promise<void>;
    /**
     * 保存当前域名的Cookie
     */
    saveCookies(): Promise<void>;
    /**
     * 清除所有Cookie
     */
    clearAllCookies(): Promise<void>;
    /**
     * 截图
     */
    screenshot(options?: {
        fullPage?: boolean;
        path?: string;
        quality?: number;
    }): Promise<Buffer>;
    /**
     * 重启浏览器
     */
    restart(): Promise<void>;
    /**
     * 检查浏览器是否正在运行
     */
    isConnected(): boolean;
    /**
     * 获取配置信息
     */
    getConfig(): CamoufoxConfig;
    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<CamoufoxConfig>): void;
}
//# sourceMappingURL=CamoufoxManager.d.ts.map