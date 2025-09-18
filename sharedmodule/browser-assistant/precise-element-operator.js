#!/usr/bin/env node

/**
 * 精确元素操作架构系统 - 基于容器ID和内容列表的嵌套架构
 * 支持元素-操作绑定、内容列表、嵌套结构的精确网页操作框架
 */

/**
 * 基于容器和内容列表的元素定义接口
 */
class ContainerElement {
    constructor(config) {
        this.id = config.id || config.name; // 容器唯一ID
        this.name = config.name; // 容器名称
        this.description = config.description; // 容器描述
        this.type = config.type || 'container'; // 容器类型
        this.selectors = config.selectors || []; // CSS选择器列表
        this.contentList = config.contentList || []; // 内容列表（子容器）
        this.operations = config.operations || {}; // 可用操作列表
        this.metadata = config.metadata || {}; // 元数据
        this.children = {}; // 子元素映射
        this.parent = null; // 父容器
    }

    /**
     * 添加子容器到内容列表
     */
    addToContentList(childContainer) {
        this.contentList.push(childContainer);
        this.children[childContainer.id] = childContainer;
        childContainer.parent = this;
        return this;
    }

    /**
     * 获取指定类型的子容器
     */
    getContentByType(type) {
        return this.contentList.filter(child => child.type === type);
    }

    /**
     * 获取指定ID的子容器
     */
    getContentById(id) {
        return this.children[id] || null;
    }

    /**
     * 执行操作
     */
    async executeOperation(operationName, context = {}, params = {}) {
        const operation = this.operations[operationName];
        if (!operation) {
            throw new Error(`操作 '${operationName}' 在容器 '${this.id}' 中不存在`);
        }

        const operationContext = {
            container: this,
            element: context.element,
            page: context.page,
            finder: context.finder,
            ...context
        };

        return await operation.execute(operationContext, params);
    }

    /**
     * 检查是否有指定操作
     */
    hasOperation(operationName) {
        return !!this.operations[operationName];
    }

    /**
     * 获取所有可用操作名称
     */
    getAvailableOperations() {
        return Object.keys(this.operations);
    }

    /**
     * 转换为可序列化对象
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            selectors: this.selectors,
            contentList: this.contentList.map(child => child.id),
            operations: Object.keys(this.operations),
            metadata: this.metadata,
            parent: this.parent?.id || null
        };
    }
}

/**
 * 操作定义接口
 */
class OperationDefinition {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.action = config.action;
        this.parameters = config.parameters || {};
        this.preconditions = config.preconditions || [];
        this.postconditions = config.postconditions || [];
        this.timeout = config.timeout || 30000;
        this.retryCount = config.retryCount || 3;
        this.metadata = config.metadata || {};
    }

    /**
     * 执行操作
     */
    async execute(context, params = {}) {
        const mergedParams = { ...this.parameters, ...params };
        
        // 检查前置条件
        for (const condition of this.preconditions) {
            if (!await condition(context, mergedParams)) {
                throw new Error(`操作 ${this.name} 的前置条件失败`);
            }
        }

        // 执行操作
        const result = await this.action(context, mergedParams);

        // 检查后置条件
        for (const condition of this.postconditions) {
            if (!await condition(context, mergedParams, result)) {
                throw new Error(`操作 ${this.name} 的后置条件失败`);
            }
        }

        return result;
    }
}

/**
 * 元素查找器
 */
class ElementFinder {
    constructor(page) {
        this.page = page;
        this.cache = new Map();
    }

    /**
     * 查找元素
     */
    async findElement(elementDef, context = null) {
        const cacheKey = this.getCacheKey(elementDef, context);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const searchContext = context || this.page;
        
        for (const selector of elementDef.selectors) {
            try {
                const element = await searchContext.$(selector);
                if (element) {
                    // 检查条件
                    if (await this.checkConditions(element, elementDef.conditions)) {
                        this.cache.set(cacheKey, element);
                        return element;
                    }
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * 查找多个元素
     */
    async findElements(elementDef, context = null) {
        const allElements = [];
        const searchContext = context || this.page;
        
        for (const selector of elementDef.selectors) {
            try {
                const elements = await searchContext.$$(selector);
                for (const element of elements) {
                    if (await this.checkConditions(element, elementDef.conditions)) {
                        allElements.push(element);
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return allElements;
    }

    /**
     * 检查元素条件
     */
    async checkConditions(element, conditions) {
        if (!conditions || Object.keys(conditions).length === 0) {
            return true;
        }

        for (const [key, value] of Object.entries(conditions)) {
            switch (key) {
                case 'visible':
                    const isVisible = await element.isVisible();
                    if (isVisible !== value) return false;
                    break;
                case 'enabled':
                    const isEnabled = await element.isEnabled();
                    if (isEnabled !== value) return false;
                    break;
                case 'textContains':
                    const text = await element.textContent();
                    if (!text.includes(value)) return false;
                    break;
                case 'hasAttribute':
                    const hasAttr = await element.getAttribute(value.attribute);
                    if (!hasAttr) return false;
                    if (value.value && !hasAttr.includes(value.value)) return false;
                    break;
            }
        }

        return true;
    }

    /**
     * 获取缓存键
     */
    getCacheKey(elementDef, context) {
        return `${elementDef.name}_${context ? 'context' : 'page'}`;
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
}

/**
 * 元素操作执行器
 */
class ElementOperationExecutor {
    constructor(finder) {
        this.finder = finder;
    }

    /**
     * 执行元素操作
     */
    async executeOperation(elementDef, operationName, params = {}, context = null) {
        const operation = elementDef.operations[operationName];
        if (!operation) {
            throw new Error(`Operation ${operationName} not found on element ${elementDef.name}`);
        }

        // 查找元素
        const element = await this.finder.findElement(elementDef, context);
        if (!element) {
            throw new Error(`Element ${elementDef.name} not found`);
        }

        // 执行操作
        const operationContext = {
            element,
            page: this.finder.page,
            finder: this.finder,
            elementDef
        };

        return await operation.execute(operationContext, params);
    }

    /**
     * 批量执行操作
     */
    async executeBatch(operations) {
        const results = [];
        
        for (const op of operations) {
            try {
                const result = await this.executeOperation(
                    op.elementDef,
                    op.operationName,
                    op.params,
                    op.context
                );
                results.push({ success: true, result, operation: op });
            } catch (error) {
                results.push({ success: false, error: error.message, operation: op });
            }
        }
        
        return results;
    }
}

/**
 * 网页容器库
 */
class WebContainerLibrary {
    constructor() {
        this.containers = new Map();
        this.rootContainer = null;
    }

    /**
     * 注册容器
     */
    registerContainer(container) {
        this.containers.set(container.id, container);
        if (!this.rootContainer) {
            this.rootContainer = container;
        }
        return this;
    }

    /**
     * 获取容器
     */
    getContainer(id) {
        return this.containers.get(id);
    }

    /**
     * 设置根容器
     */
    setRootContainer(container) {
        this.rootContainer = container;
        this.registerContainer(container);
        return this;
    }

    /**
     * 获取根容器
     */
    getRootContainer() {
        return this.rootContainer;
    }

    /**
     * 查找容器
     */
    findContainer(id, startContainer = null) {
        const searchIn = startContainer || this.rootContainer;
        
        if (searchIn.id === id) {
            return searchIn;
        }

        for (const child of searchIn.contentList) {
            const found = this.findContainer(id, child);
            if (found) return found;
        }

        return null;
    }

    /**
     * 按类型查找所有容器
     */
    findByType(type, startContainer = null) {
        const searchIn = startContainer || this.rootContainer;
        const results = [];
        
        if (searchIn.type === type) {
            results.push(searchIn);
        }

        for (const child of searchIn.contentList) {
            results.push(...this.findByType(type, child));
        }

        return results;
    }

    /**
     * 导出库
     */
    export() {
        const exported = {
            containers: {},
            rootContainer: this.rootContainer?.id || null
        };

        for (const [id, container] of this.containers) {
            exported.containers[id] = container.toJSON();
        }

        return exported;
    }
}

/**
 * 精确网页操作器 - 基于容器架构
 */
class PreciseWebOperator {
    constructor(page) {
        this.page = page;
        this.finder = new ElementFinder(page);
        this.library = new WebContainerLibrary();
        this.operationHistory = [];
    }

    /**
     * 创建容器
     */
    createContainer(config) {
        const container = new ContainerElement(config);
        
        // 添加操作
        if (config.operations) {
            for (const [opName, opConfig] of Object.entries(config.operations)) {
                const operation = new OperationDefinition(opConfig);
                container.operations[opName] = operation;
            }
        }
        
        // 添加子容器
        if (config.contentList) {
            for (const childConfig of config.contentList) {
                const child = this.createContainer(childConfig);
                container.addToContentList(child);
            }
        }
        
        this.library.registerContainer(container);
        return container;
    }

    /**
     * 执行容器操作
     */
    async operate(containerId, operationName, params = {}) {
        const container = this.library.getContainer(containerId);
        if (!container) {
            throw new Error(`容器 '${containerId}' 不存在`);
        }

        // 查找DOM元素
        const element = await this.finder.findElement(container);
        if (!element) {
            throw new Error(`容器 '${containerId}' 的DOM元素未找到`);
        }

        const context = {
            element,
            page: this.page,
            finder: this.finder
        };

        const result = await container.executeOperation(operationName, context, params);
        
        // 记录操作历史
        this.operationHistory.push({
            timestamp: new Date().toISOString(),
            containerId,
            operationName,
            params,
            result: result ? 'success' : 'failed'
        });

        return result;
    }

    /**
     * 获取容器
     */
    getContainer(containerId) {
        return this.library.getContainer(containerId);
    }

    /**
     * 按类型获取容器列表
     */
    getContainersByType(type) {
        return this.library.findByType(type);
    }

    /**
     * 查找DOM元素
     */
    async findElement(containerId) {
        const container = this.library.getContainer(containerId);
        if (!container) {
            throw new Error(`容器 '${containerId}' 不存在`);
        }
        return await this.finder.findElement(container);
    }

    /**
     * 获取操作历史
     */
    getOperationHistory() {
        return this.operationHistory;
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.finder.clearCache();
    }

    /**
     * 导出容器库
     */
    exportLibrary() {
        return this.library.export();
    }
}

module.exports = {
    ContainerElement,
    OperationDefinition,
    ElementFinder,
    WebContainerLibrary,
    PreciseWebOperator
};