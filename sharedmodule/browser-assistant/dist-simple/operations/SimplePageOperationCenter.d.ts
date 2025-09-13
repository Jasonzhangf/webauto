/**
 * 简化的页面操作中心
 * 提供基本的页面交互功能
 */
import { Page, ElementHandle } from 'playwright';
export interface ClickOptions {
    timeout?: number;
    force?: boolean;
    position?: {
        x: number;
        y: number;
    };
}
export interface TypeOptions {
    delay?: number;
    timeout?: number;
}
export interface ScrollOptions {
    direction: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    smooth?: boolean;
}
export interface ExtractOptions {
    includeLinks?: boolean;
    includeImages?: boolean;
    includeText?: boolean;
    maxDepth?: number;
}
export interface ExtractedContent {
    text: string;
    links: Array<{
        text: string;
        url: string;
    }>;
    images: Array<{
        src: string;
        alt?: string;
    }>;
    metadata: {
        title: string;
        url: string;
        timestamp: string;
    };
}
/**
 * 页面操作中心
 * 提供统一的页面交互接口
 */
export declare class PageOperationCenter {
    /**
     * 点击元素
     */
    click(page: Page, selector: string | ElementHandle, options?: ClickOptions): Promise<void>;
    /**
     * 输入文本
     */
    type(page: Page, selector: string | ElementHandle, text: string, options?: TypeOptions): Promise<void>;
    /**
     * 滚动页面
     */
    scroll(page: Page, options: ScrollOptions): Promise<void>;
    /**
     * 提取页面内容
     */
    extractContent(page: Page, options?: ExtractOptions): Promise<ExtractedContent>;
    /**
     * 等待元素
     */
    waitFor(page: Page, selector: string, options?: {
        timeout?: number;
        state?: 'attached' | 'detached' | 'visible' | 'hidden';
    }): Promise<void>;
    /**
     * 截图
     */
    screenshot(page: Page, options?: {
        fullPage?: boolean;
        path?: string;
        quality?: number;
    }): Promise<Buffer>;
    /**
     * 导航到URL
     */
    navigate(page: Page, url: string, options?: {
        timeout?: number;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    }): Promise<void>;
}
//# sourceMappingURL=SimplePageOperationCenter.d.ts.map