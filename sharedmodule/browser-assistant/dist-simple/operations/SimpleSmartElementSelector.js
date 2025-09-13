"use strict";
/**
 * 简化的智能元素选择器
 * 提供基本的元素选择功能，不依赖AI分析
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartElementSelector = void 0;
const SimpleBaseModule_1 = require("../core/SimpleBaseModule");
/**
 * 简化的智能元素选择器
 * 提供基本的元素识别和选择功能
 */
class SmartElementSelector extends SimpleBaseModule_1.BaseBrowserModule {
    selectionCache = new Map();
    constructor() {
        super('SmartElementSelector');
    }
    /**
     * 子类初始化逻辑
     */
    async onInitialize() {
        this.logInfo('Initializing SmartElementSelector...');
    }
    /**
     * 注册模块能力
     */
    async registerCapabilities() {
        this.logInfo('Registering SmartElementSelector capabilities...');
    }
    /**
     * 健康检查
     */
    checkHealth() {
        return true;
    }
    /**
     * 子类清理逻辑
     */
    async onCleanup() {
        this.selectionCache.clear();
        this.logInfo('SmartElementSelector cleaned up');
    }
    /**
     * 选择单个元素
     */
    async selectElement(page, context) {
        try {
            const cacheKey = this.getCacheKey(page, context);
            // 检查缓存
            if (this.selectionCache.has(cacheKey)) {
                return this.selectionCache.get(cacheKey);
            }
            let selection = null;
            // 策略1: 基于CSS选择器
            if (context.type) {
                selection = await this.selectByType(page, context.type);
            }
            // 策略2: 基于文本内容
            if (!selection?.element && context.text) {
                selection = await this.selectByText(page, context.text);
            }
            // 策略3: 基于属性
            if (!selection?.element && context.attributes) {
                selection = await this.selectByAttributes(page, context.attributes);
            }
            // 策略4: 基于role
            if (!selection?.element && context.role) {
                selection = await this.selectByRole(page, context.role);
            }
            // 策略5: 通用回退策略
            if (!selection?.element) {
                selection = await this.selectFallback(page);
            }
            // 缓存结果
            if (selection) {
                this.selectionCache.set(cacheKey, selection);
            }
            return selection || {
                element: null,
                selector: '',
                confidence: 0,
                method: 'fallback'
            };
        }
        catch (error) {
            this.warn(`Element selection failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'fallback'
            };
        }
    }
    /**
     * 选择所有匹配的元素
     */
    async selectAllElements(page, context) {
        try {
            let selections = [];
            // 基于类型选择
            if (context.type) {
                const elements = await page.$$(`[type="${context.type}"], ${context.type}`);
                selections = elements.map(el => ({
                    element: el,
                    selector: context.type || '',
                    confidence: 0.8,
                    method: 'css'
                }));
            }
            // 基于文本选择
            if (selections.length === 0 && context.text) {
                const elements = await page.$$(`text=${context.text}`);
                selections = elements.map(el => ({
                    element: el,
                    selector: `text=${context.text}`,
                    confidence: 0.7,
                    method: 'text'
                }));
            }
            return selections;
        }
        catch (error) {
            this.warn(`Multi-element selection failed: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    /**
     * 基于类型选择元素
     */
    async selectByType(page, type) {
        try {
            // 常见类型的CSS选择器
            const typeSelectors = {
                'input': 'input',
                'button': 'button',
                'link': 'a',
                'select': 'select',
                'textarea': 'textarea',
                'checkbox': 'input[type="checkbox"]',
                'radio': 'input[type="radio"]',
                'submit': 'input[type="submit"], button[type="submit"]'
            };
            const selector = typeSelectors[type.toLowerCase()] || type;
            const element = await page.$(selector);
            return {
                element,
                selector,
                confidence: element ? 0.9 : 0,
                method: 'css'
            };
        }
        catch (error) {
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'css'
            };
        }
    }
    /**
     * 基于文本选择元素
     */
    async selectByText(page, text) {
        try {
            const selector = `text=${text}`;
            const element = await page.$(selector);
            return {
                element,
                selector,
                confidence: element ? 0.8 : 0,
                method: 'text'
            };
        }
        catch (error) {
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'text'
            };
        }
    }
    /**
     * 基于属性选择元素
     */
    async selectByAttributes(page, attributes) {
        try {
            // 构建属性选择器
            const attrSelectors = Object.entries(attributes)
                .map(([key, value]) => `[${key}="${value}"]`)
                .join('');
            const selector = attrSelectors;
            const element = await page.$(selector);
            return {
                element,
                selector,
                confidence: element ? 0.85 : 0,
                method: 'attributes'
            };
        }
        catch (error) {
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'attributes'
            };
        }
    }
    /**
     * 基于ARIA role选择元素
     */
    async selectByRole(page, role) {
        try {
            const selector = `[role="${role}"]`;
            const element = await page.$(selector);
            return {
                element,
                selector,
                confidence: element ? 0.75 : 0,
                method: 'css'
            };
        }
        catch (error) {
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'css'
            };
        }
    }
    /**
     * 回退选择策略
     */
    async selectFallback(page) {
        try {
            // 尝试找到第一个可交互的元素
            const element = await page.$('button, input, a, [role="button"], [tabindex]');
            return {
                element,
                selector: element ? 'button, input, a, [role="button"], [tabindex]' : '',
                confidence: element ? 0.5 : 0,
                method: 'fallback'
            };
        }
        catch (error) {
            return {
                element: null,
                selector: '',
                confidence: 0,
                method: 'fallback'
            };
        }
    }
    /**
     * 生成缓存键
     */
    getCacheKey(page, context) {
        const url = page.url();
        const contextStr = JSON.stringify(context);
        return `${url}:${contextStr}`;
    }
    /**
     * 获取元素选择建议
     */
    async getElementSuggestions(page, context) {
        const suggestions = [];
        if (context.type) {
            suggestions.push(context.type);
        }
        if (context.text) {
            suggestions.push(`text=${context.text}`);
        }
        if (context.attributes) {
            const attrSelector = Object.entries(context.attributes)
                .map(([key, value]) => `[${key}="${value}"]`)
                .join('');
            suggestions.push(attrSelector);
        }
        return suggestions;
    }
    /**
     * 清除选择缓存
     */
    clearCache() {
        this.selectionCache.clear();
        this.logInfo('Selection cache cleared');
    }
}
exports.SmartElementSelector = SmartElementSelector;
//# sourceMappingURL=SimpleSmartElementSelector.js.map