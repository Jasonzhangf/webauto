/**
 * 简化的智能元素选择器
 * 提供基本的元素选择功能，不依赖AI分析
 */
import { Page, ElementHandle } from 'playwright';
import { BaseBrowserModule } from '../core/SimpleBaseModule';
export interface ElementContext {
    type?: string;
    text?: string;
    attributes?: Record<string, string>;
    role?: string;
    context?: string;
    screenshot?: Buffer;
    accessibilityTree?: any;
}
export interface ElementSelection {
    element: ElementHandle | null;
    selector: string;
    confidence: number;
    method: 'css' | 'attributes' | 'text' | 'fallback';
    alternativeSelectors?: string[];
}
/**
 * 简化的智能元素选择器
 * 提供基本的元素识别和选择功能
 */
export declare class SmartElementSelector extends BaseBrowserModule {
    private selectionCache;
    constructor();
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
     * 选择单个元素
     */
    selectElement(page: Page, context: ElementContext): Promise<ElementSelection>;
    /**
     * 选择所有匹配的元素
     */
    selectAllElements(page: Page, context: ElementContext): Promise<ElementSelection[]>;
    /**
     * 基于类型选择元素
     */
    private selectByType;
    /**
     * 基于文本选择元素
     */
    private selectByText;
    /**
     * 基于属性选择元素
     */
    private selectByAttributes;
    /**
     * 基于ARIA role选择元素
     */
    private selectByRole;
    /**
     * 回退选择策略
     */
    private selectFallback;
    /**
     * 生成缓存键
     */
    private getCacheKey;
    /**
     * 获取元素选择建议
     */
    getElementSuggestions(page: Page, context: ElementContext): Promise<string[]>;
    /**
     * 清除选择缓存
     */
    clearCache(): void;
}
//# sourceMappingURL=SimpleSmartElementSelector.d.ts.map