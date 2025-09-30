"use strict";
/**
 * 统一容器注册系统
 * 整合容器类型管理、实例管理、文件库管理和事件驱动支持
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedContainerRegistry = exports.UnifiedContainerRegistry = void 0;
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const EventBus_js_1 = require("../event-driven/EventBus.js");
// ==================== 容器类型管理器实现 ====================
class ContainerTypeManager {
    constructor() {
        this.containerTypes = new Map();
    }
    registerContainerType(type, containerClass) {
        this.containerTypes.set(type, containerClass);
        console.log(`📦 容器类型已注册: ${type}`);
    }
    getContainerType(type) {
        return this.containerTypes.get(type);
    }
    hasContainerType(type) {
        return this.containerTypes.has(type);
    }
    getAllContainerTypes() {
        return Array.from(this.containerTypes.keys());
    }
    createContainer(type, config) {
        const ContainerClass = this.getContainerType(type);
        if (!ContainerClass) {
            throw new Error(`未知的容器类型: ${type}`);
        }
        return new ContainerClass(config);
    }
    registerDefaultContainers(containers) {
        Object.entries(containers).forEach(([type, containerClass]) => {
            this.registerContainerType(type, containerClass);
        });
    }
}
// ==================== 容器实例管理器实现 ====================
class ContainerInstanceManager {
    constructor() {
        this.containerInstances = new Map();
    }
    registerContainerInstance(id, container) {
        this.containerInstances.set(id, container);
    }
    getContainerInstance(id) {
        return this.containerInstances.get(id);
    }
    hasContainerInstance(id) {
        return this.containerInstances.has(id);
    }
    getAllContainerInstances() {
        return new Map(this.containerInstances);
    }
    removeContainerInstance(id) {
        this.containerInstances.delete(id);
    }
    getContainerInstancesByType(type) {
        const instances = [];
        for (const [id, container] of this.containerInstances) {
            if (container.constructor.name === type || container.type === type) {
                instances.push(container);
            }
        }
        return instances;
    }
    clearAllInstances() {
        this.containerInstances.clear();
    }
}
// ==================== 容器库管理器实现 ====================
class ContainerLibraryManager {
    constructor(options) {
        this.containerLibrary = {};
        this.cache = new Map();
        this.lastRefresh = 0;
        this.libraryPath = options.libraryPath || './container-library';
        this.cacheTimeout = options.cacheTimeout || 30000; // 30秒缓存
        this.enableFileLibrary = options.enableFileLibrary !== false;
        if (this.enableFileLibrary) {
            this.initializeLibrary();
        }
    }
    /**
     * 初始化容器库
     */
    async initializeLibrary() {
        try {
            await this.loadContainerLibrary();
            console.log('✅ 容器库管理器初始化完成');
        }
        catch (error) {
            console.error('❌ 容器库管理器初始化失败:', error.message);
        }
    }
    /**
     * 加载容器库
     */
    async loadContainerLibrary() {
        if (!this.enableFileLibrary)
            return;
        const globalIndexPath = path_1.default.join(this.libraryPath, 'global-index.json');
        if (!fs_1.default.existsSync(globalIndexPath)) {
            console.warn('⚠️ 容器库索引文件不存在，创建空库');
            this.containerLibrary = {};
            return;
        }
        try {
            const globalIndex = JSON.parse(fs_1.default.readFileSync(globalIndexPath, 'utf8'));
            for (const [website, websiteInfo] of Object.entries(globalIndex.websites)) {
                const indexPath = path_1.default.join(this.libraryPath, website, 'index.json');
                if (fs_1.default.existsSync(indexPath)) {
                    const indexData = JSON.parse(fs_1.default.readFileSync(indexPath, 'utf8'));
                    const websiteContainers = new Map();
                    for (const container of indexData.containers) {
                        const containerPath = path_1.default.join(this.libraryPath, website, container.fileName);
                        if (fs_1.default.existsSync(containerPath)) {
                            const containerData = JSON.parse(fs_1.default.readFileSync(containerPath, 'utf8'));
                            websiteContainers.set(container.id, containerData);
                        }
                    }
                    this.containerLibrary[website] = {
                        containers: websiteContainers,
                        containerCount: websiteContainers.size,
                        metadata: {
                            loadedAt: new Date().toISOString(),
                            source: 'file-based-library'
                        }
                    };
                }
            }
            console.log(`🔄 容器库加载完成: ${Object.keys(this.containerLibrary).length} 个网站`);
        }
        catch (error) {
            console.error('❌ 容器库加载失败:', error.message);
            throw error;
        }
    }
    /**
     * 刷新缓存
     */
    async refreshCache() {
        const now = Date.now();
        if (now - this.lastRefresh < this.cacheTimeout) {
            return;
        }
        this.cache.clear();
        this.lastRefresh = now;
        try {
            for (const [website, websiteData] of Object.entries(this.containerLibrary)) {
                for (const [containerId, containerInfo] of websiteData.containers) {
                    this.cache.set(`${website}:${containerId}`, containerInfo);
                }
            }
            console.log('🔄 容器库缓存已刷新');
        }
        catch (error) {
            console.error('❌ 刷新缓存失败:', error.message);
        }
    }
    /**
     * 注册容器
     */
    async registerContainer(website, containerInfo) {
        if (!this.enableFileLibrary)
            return;
        try {
            // 确保网站存在
            if (!this.containerLibrary[website]) {
                this.containerLibrary[website] = {
                    containers: new Map(),
                    containerCount: 0,
                    metadata: {
                        createdAt: new Date().toISOString(),
                        website
                    }
                };
            }
            // 注册容器
            this.containerLibrary[website].containers.set(containerInfo.id, containerInfo);
            this.containerLibrary[website].containerCount = this.containerLibrary[website].containers.size;
            // 更新缓存
            this.cache.set(`${website}:${containerInfo.id}`, containerInfo);
            // 保存到文件系统
            await this.saveContainerToFile(website, containerInfo);
            console.log(`✅ 容器注册成功: ${website}:${containerInfo.id}`);
        }
        catch (error) {
            console.error(`❌ 容器注册失败 ${website}:${containerInfo.id}:`, error.message);
            throw error;
        }
    }
    /**
     * 保存容器到文件系统
     */
    async saveContainerToFile(website, containerInfo) {
        if (!this.enableFileLibrary)
            return;
        try {
            // 创建网站目录
            const websiteDir = path_1.default.join(this.libraryPath, website);
            if (!fs_1.default.existsSync(websiteDir)) {
                fs_1.default.mkdirSync(websiteDir, { recursive: true });
            }
            // 生成文件名
            const fileName = `${containerInfo.id}_${this.generateSelectorHash(containerInfo.selector)}_${containerInfo.type || 'container'}.json`;
            const filePath = path_1.default.join(websiteDir, fileName);
            // 保存容器数据
            const containerData = {
                ...containerInfo,
                registeredAt: new Date().toISOString(),
                metadata: {
                    ...containerInfo.metadata,
                    generatedAt: new Date().toISOString(),
                    fileVersion: '1.0.0'
                }
            };
            fs_1.default.writeFileSync(filePath, JSON.stringify(containerData, null, 2));
            // 更新索引
            await this.updateIndex(website, containerInfo.id, fileName, containerInfo.selector);
            console.log(`💾 容器文件保存成功: ${filePath}`);
        }
        catch (error) {
            console.error(`❌ 容器文件保存失败:`, error.message);
            throw error;
        }
    }
    /**
     * 更新索引文件
     */
    async updateIndex(website, containerId, fileName, selector) {
        if (!this.enableFileLibrary)
            return;
        try {
            const websiteDir = path_1.default.join(this.libraryPath, website);
            const indexPath = path_1.default.join(websiteDir, 'index.json');
            let indexData = {
                website,
                generatedAt: new Date().toISOString(),
                containerCount: 0,
                containers: []
            };
            // 读取现有索引
            if (fs_1.default.existsSync(indexPath)) {
                indexData = JSON.parse(fs_1.default.readFileSync(indexPath, 'utf8'));
            }
            // 更新容器列表
            const existingIndex = indexData.containers.findIndex((c) => c.id === containerId);
            const containerEntry = { id: containerId, fileName, selector };
            if (existingIndex >= 0) {
                indexData.containers[existingIndex] = containerEntry;
            }
            else {
                indexData.containers.push(containerEntry);
            }
            indexData.containerCount = indexData.containers.length;
            // 更新搜索索引
            indexData.searchIndex = this.buildSearchIndex(indexData.containers);
            // 保存索引
            fs_1.default.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
            // 更新全局索引
            await this.updateGlobalIndex(website, indexData.containerCount);
            console.log(`📝 索引文件更新成功: ${indexPath}`);
        }
        catch (error) {
            console.error(`❌ 索引文件更新失败:`, error.message);
            throw error;
        }
    }
    /**
     * 构建搜索索引
     */
    buildSearchIndex(containers) {
        const searchIndex = {
            byType: {},
            byPriority: {},
            byName: {}
        };
        containers.forEach(container => {
            // 按类型索引
            const type = 'container'; // 简化处理
            if (!searchIndex.byType[type]) {
                searchIndex.byType[type] = [];
            }
            searchIndex.byType[type].push(container.id);
            // 按优先级索引
            const priority = 999; // 简化处理
            if (!searchIndex.byPriority[priority]) {
                searchIndex.byPriority[priority] = [];
            }
            searchIndex.byPriority[priority].push(container.id);
            // 按名称索引
            searchIndex.byName[container.id] = container.id;
        });
        return searchIndex;
    }
    /**
     * 更新全局索引
     */
    async updateGlobalIndex(website, containerCount) {
        if (!this.enableFileLibrary)
            return;
        try {
            const globalIndexPath = path_1.default.join(this.libraryPath, 'global-index.json');
            let globalIndex = {
                generatedAt: new Date().toISOString(),
                websites: {},
                statistics: {
                    totalContainers: 0,
                    totalWebsites: 0
                }
            };
            // 读取现有全局索引
            if (fs_1.default.existsSync(globalIndexPath)) {
                globalIndex = JSON.parse(fs_1.default.readFileSync(globalIndexPath, 'utf8'));
            }
            // 更新网站信息
            globalIndex.websites[website] = {
                containerCount,
                path: `./container-library/${website}`,
                lastUpdated: new Date().toISOString()
            };
            // 更新统计信息
            globalIndex.statistics.totalWebsites = Object.keys(globalIndex.websites).length;
            globalIndex.statistics.totalContainers = Object.values(globalIndex.websites)
                .reduce((sum, website) => sum + website.containerCount, 0);
            // 保存全局索引
            fs_1.default.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2));
            console.log(`🌍 全局索引更新成功: ${globalIndexPath}`);
        }
        catch (error) {
            console.error(`❌ 全局索引更新失败:`, error.message);
        }
    }
    /**
     * 查找容器
     */
    async findContainer(website, containerId) {
        await this.refreshCache();
        // 首先从缓存查找
        const cacheKey = `${website}:${containerId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) || null;
        }
        // 从库中查找
        const websiteData = this.containerLibrary[website];
        if (websiteData) {
            const container = websiteData.containers.get(containerId);
            if (container) {
                this.cache.set(cacheKey, container);
                return container;
            }
        }
        return null;
    }
    /**
     * 按选择器查找容器
     */
    async findBySelector(website, selector) {
        await this.refreshCache();
        // 从库中查找
        const websiteData = this.containerLibrary[website];
        if (websiteData) {
            for (const [containerId, containerInfo] of websiteData.containers) {
                if (containerInfo.selector === selector) {
                    return containerInfo;
                }
            }
        }
        return null;
    }
    /**
     * 获取网站所有容器
     */
    async getWebsiteContainers(website) {
        await this.refreshCache();
        return this.containerLibrary[website]?.containers || new Map();
    }
    /**
     * 获取容器统计信息
     */
    async getStatistics() {
        await this.refreshCache();
        const stats = {
            totalContainers: 0,
            totalWebsites: 0,
            typeDistribution: {},
            websiteDistribution: {}
        };
        for (const [website, websiteData] of Object.entries(this.containerLibrary)) {
            stats.totalWebsites++;
            stats.totalContainers += websiteData.containerCount;
            stats.websiteDistribution[website] = websiteData.containerCount;
            for (const [containerId, containerInfo] of websiteData.containers) {
                const type = containerInfo.type || 'container';
                stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;
            }
        }
        return stats;
    }
    async updateContainerUsage(website, containerId, usageStats) {
        try {
            const container = await this.findContainer(website, containerId);
            if (container) {
                container.usage = {
                    accessCount: 0,
                    lastUsed: new Date().toISOString(),
                    successRate: 0,
                    success: false,
                    ...container.usage,
                    ...usageStats,
                    lastUsed: new Date().toISOString()
                };
                // 更新库和缓存
                if (this.containerLibrary[website]) {
                    this.containerLibrary[website].containers.set(containerId, container);
                    this.cache.set(`${website}:${containerId}`, container);
                }
                // 保存到文件
                if (this.enableFileLibrary) {
                    await this.saveContainerToFile(website, container);
                }
                console.log(`📊 容器使用统计更新: ${website}:${containerId}`);
            }
        }
        catch (error) {
            console.error(`❌ 容器使用统计更新失败 ${website}:${containerId}:`, error.message);
        }
    }
    /**
     * 生成选择器哈希
     */
    generateSelectorHash(selector) {
        let hash = 0;
        for (let i = 0; i < selector.length; i++) {
            const char = selector.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    }
}
// ==================== 事件驱动支持实现 ====================
class EventDrivenSupport extends events_1.EventEmitter {
    constructor(enableEventBus = true) {
        super();
        this.eventBus = new EventBus_js_1.EventBus();
    }
    async emit(event, data) {
        // 发送到内部事件总线
        const localResult = super.emit(event, data);
        // 发送到全局事件总线
        await this.eventBus.emit(event, data);
        return localResult;
    }
    on(event, handler) {
        super.on(event, handler);
        return this;
    }
    off(event, handler) {
        super.off(event, handler);
        return this;
    }
    getEventBus() {
        return this.eventBus;
    }
}
// ==================== 统一容器注册中心 ====================
class UnifiedContainerRegistry {
    constructor(options = {}) {
        this.options = options;
        this.typeManager = new ContainerTypeManager();
        this.instanceManager = new ContainerInstanceManager();
        this.libraryManager = new ContainerLibraryManager({
            libraryPath: options.libraryPath,
            cacheTimeout: options.cacheTimeout,
            enableFileLibrary: options.enableFileLibrary
        });
        this.eventSupport = new EventDrivenSupport(options.enableEventBus);
    }
    static getInstance(options) {
        if (!UnifiedContainerRegistry.instance) {
            UnifiedContainerRegistry.instance = new UnifiedContainerRegistry(options);
        }
        return UnifiedContainerRegistry.instance;
    }
    // ==================== 容器类型管理方法 ====================
    registerContainerType(type, containerClass) {
        this.typeManager.registerContainerType(type, containerClass);
    }
    getContainerType(type) {
        return this.typeManager.getContainerType(type);
    }
    hasContainerType(type) {
        return this.typeManager.hasContainerType(type);
    }
    getAllContainerTypes() {
        return this.typeManager.getAllContainerTypes();
    }
    createContainer(type, config) {
        const container = this.typeManager.createContainer(type, config);
        if (container) {
            // 注册容器实例
            if (container.config && container.config.id) {
                this.instanceManager.registerContainerInstance(container.config.id, container);
            }
            // 发出容器创建事件
            this.eventSupport.emit('container:created', {
                containerId: container.config?.id,
                containerType: type,
                timestamp: Date.now()
            });
        }
        return container;
    }
    registerDefaultContainers(containers) {
        this.typeManager.registerDefaultContainers(containers);
    }
    // ==================== 容器实例管理方法 ====================
    registerContainerInstance(id, container) {
        this.instanceManager.registerContainerInstance(id, container);
    }
    getContainerInstance(id) {
        return this.instanceManager.getContainerInstance(id);
    }
    hasContainerInstance(id) {
        return this.instanceManager.hasContainerInstance(id);
    }
    getAllContainerInstances() {
        return this.instanceManager.getAllContainerInstances();
    }
    removeContainerInstance(id) {
        this.instanceManager.removeContainerInstance(id);
    }
    getContainerInstancesByType(type) {
        return this.instanceManager.getContainerInstancesByType(type);
    }
    // ==================== 容器库管理方法 ====================
    async loadContainerLibrary(path) {
        if (path) {
            // 重新创建库管理器以使用新路径
            this.libraryManager = new ContainerLibraryManager({
                libraryPath: path,
                cacheTimeout: this.options.cacheTimeout,
                enableFileLibrary: this.options.enableFileLibrary
            });
        }
        await this.libraryManager.loadContainerLibrary();
    }
    async saveContainer(containerInfo) {
        await this.libraryManager.registerContainer(containerInfo.website, containerInfo);
    }
    async findContainer(website, containerId) {
        return await this.libraryManager.findContainer(website, containerId);
    }
    async findBySelector(website, selector) {
        return await this.libraryManager.findBySelector(website, selector);
    }
    async getWebsiteContainers(website) {
        return await this.libraryManager.getWebsiteContainers(website);
    }
    async updateContainerUsage(website, containerId, usageStats) {
        await this.libraryManager.updateContainerUsage(website, containerId, usageStats);
    }
    async getLibraryStatistics() {
        return await this.libraryManager.getStatistics();
    }
    // ==================== 事件驱动支持方法 ====================
    async emitEvent(event, data) {
        await this.eventSupport.emit(event, data);
    }
    onEvent(event, handler) {
        this.eventSupport.on(event, handler);
    }
    offEvent(event, handler) {
        this.eventSupport.off(event, handler);
    }
    getEventBus() {
        return this.eventSupport.getEventBus();
    }
    // ==================== 便利方法 ====================
    /**
     * 获取容器信息
     */
    getContainerInfo() {
        return [
            {
                type: 'BaseSelfRefreshingContainer',
                description: '自刷新容器基类，提供多触发源刷新机制',
                configInterface: 'ContainerConfig'
            },
            {
                type: 'WeiboPageContainer',
                description: '微博页面管理容器，负责整体页面状态和容器协调',
                configInterface: 'WeiboPageConfig'
            },
            {
                type: 'WeiboLinkContainer',
                description: '微博链接提取容器，专门处理链接发现和提取',
                configInterface: 'WeiboLinkConfig'
            },
            {
                type: 'WeiboScrollContainer',
                description: '微博滚动控制容器，专门处理页面滚动和无限加载',
                configInterface: 'WeiboScrollConfig'
            },
            {
                type: 'WeiboPaginationContainer',
                description: '微博分页控制容器，专门处理分页操作和多页内容加载',
                configInterface: 'WeiboPaginationConfig'
            },
            {
                type: 'WeiboCommentContainer',
                description: '微博评论容器，专门处理评论提取和动态加载',
                configInterface: 'WeiboCommentConfig'
            },
            {
                type: 'WeiboReplyContainer',
                description: '微博回复容器，专门处理评论下的回复内容',
                configInterface: 'WeiboReplyConfig'
            }
        ];
    }
    /**
     * 清理所有资源
     */
    cleanup() {
        this.instanceManager.clearAllInstances();
        console.log('🔄 容器注册中心已清理');
    }
}
exports.UnifiedContainerRegistry = UnifiedContainerRegistry;
// ==================== 导出 ====================
exports.unifiedContainerRegistry = UnifiedContainerRegistry.getInstance();
exports.default = UnifiedContainerRegistry;
