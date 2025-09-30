/**
 * 统一容器注册和发现系统
 * 提供基于文件库和自动发现的容器管理功能
 */
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
// ==================== 容器注册器 ====================
export class ContainerRegistry extends EventEmitter {
    constructor(libraryPath = './container-library') {
        super();
        this.containerLibrary = {};
        this.cache = new Map();
        this.lastRefresh = 0;
        this.cacheTimeout = 30000; // 30秒缓存
        this.libraryPath = libraryPath;
        this.initializeLibrary();
    }
    /**
     * 初始化容器库
     */
    async initializeLibrary() {
        try {
            await this.loadContainerLibrary();
            console.log('✅ 容器注册器初始化完成');
        }
        catch (error) {
            console.error('❌ 容器注册器初始化失败:', error.message);
        }
    }
    /**
     * 加载容器库
     */
    async loadContainerLibrary() {
        const globalIndexPath = path.join(this.libraryPath, 'global-index.json');
        if (!fs.existsSync(globalIndexPath)) {
            console.warn('⚠️ 容器库索引文件不存在，创建空库');
            this.containerLibrary = {};
            return;
        }
        try {
            const globalIndex = JSON.parse(fs.readFileSync(globalIndexPath, 'utf8'));
            for (const [website, websiteInfo] of Object.entries(globalIndex.websites)) {
                const indexPath = path.join(this.libraryPath, website, 'index.json');
                if (fs.existsSync(indexPath)) {
                    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                    const websiteContainers = new Map();
                    for (const container of indexData.containers) {
                        const containerPath = path.join(this.libraryPath, website, container.fileName);
                        if (fs.existsSync(containerPath)) {
                            const containerData = JSON.parse(fs.readFileSync(containerPath, 'utf8'));
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
            console.log('🔄 容器注册器缓存已刷新');
        }
        catch (error) {
            console.error('❌ 刷新缓存失败:', error.message);
        }
    }
    /**
     * 注册容器
     */
    async registerContainer(website, containerInfo) {
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
            this.emit('container:registered', {
                website,
                containerId: containerInfo.id,
                containerInfo
            });
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
        try {
            // 创建网站目录
            const websiteDir = path.join(this.libraryPath, website);
            if (!fs.existsSync(websiteDir)) {
                fs.mkdirSync(websiteDir, { recursive: true });
            }
            // 生成文件名
            const fileName = `${containerInfo.id}_${this.generateSelectorHash(containerInfo.selector)}_${containerInfo.type || 'container'}.json`;
            const filePath = path.join(websiteDir, fileName);
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
            fs.writeFileSync(filePath, JSON.stringify(containerData, null, 2));
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
        try {
            const websiteDir = path.join(this.libraryPath, website);
            const indexPath = path.join(websiteDir, 'index.json');
            let indexData = {
                website,
                generatedAt: new Date().toISOString(),
                containerCount: 0,
                containers: []
            };
            // 读取现有索引
            if (fs.existsSync(indexPath)) {
                indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
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
            fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
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
        try {
            const globalIndexPath = path.join(this.libraryPath, 'global-index.json');
            let globalIndex = {
                generatedAt: new Date().toISOString(),
                websites: {},
                statistics: {
                    totalContainers: 0,
                    totalWebsites: 0
                }
            };
            // 读取现有全局索引
            if (fs.existsSync(globalIndexPath)) {
                globalIndex = JSON.parse(fs.readFileSync(globalIndexPath, 'utf8'));
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
            fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2));
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
    /**
     * 更新容器使用统计
     */
    async updateContainerUsage(website, containerId, usageStats) {
        try {
            const container = await this.findContainer(website, containerId);
            if (container) {
                container.usage = {
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
                await this.saveContainerToFile(website, container);
                this.emit('container:usage_updated', {
                    website,
                    containerId,
                    usageStats
                });
                console.log(`📊 容器使用统计更新: ${website}:${containerId}`);
            }
        }
        catch (error) {
            console.error(`❌ 容器使用统计更新失败 ${website}:${containerId}:`, error.message);
        }
    }
    /**
     * 执行自动容器发现
     */
    async performAutoDiscovery(page, website) {
        console.log(`🔍 开始自动容器发现: ${website}`);
        try {
            const discoveryResult = await page.evaluate(() => {
                const containers = [];
                const relationships = [];
                const startTime = Date.now();
                // 查找常见的容器元素
                const containerSelectors = [
                    { id: 'page', selector: 'body', name: '页面容器', priority: 1 },
                    { id: 'main', selector: 'main, [role="main"]', name: '主内容容器', priority: 2 },
                    { id: 'header', selector: 'header, [role="banner"]', name: '页头容器', priority: 3 },
                    { id: 'footer', selector: 'footer, [role="contentinfo"]', name: '页脚容器', priority: 4 },
                    { id: 'navigation', selector: 'nav, [role="navigation"]', name: '导航容器', priority: 5 },
                    { id: 'sidebar', selector: 'aside, [role="complementary"]', name: '侧边栏容器', priority: 6 },
                    { id: 'content', selector: '[class*="content"], [id*="content"]', name: '内容容器', priority: 7 },
                    { id: 'list', selector: 'ul, ol, [role="list"]', name: '列表容器', priority: 8 },
                    { id: 'item', selector: 'li, [role="listitem"]', name: '列表项容器', priority: 9 },
                    { id: 'card', selector: '[class*="card"], [class*="panel"]', name: '卡片容器', priority: 10 }
                ];
                // 查找容器
                containerSelectors.forEach(({ id, selector, name, priority }) => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        const visibleElements = Array.from(elements).filter(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 &&
                                rect.width < window.innerWidth * 2 && rect.height < window.innerHeight * 2;
                        });
                        if (visibleElements.length > 0) {
                            const firstElement = visibleElements[0];
                            containers.push({
                                id: `${id}_${Date.now()}`,
                                originalId: id,
                                selector,
                                name,
                                priority,
                                elementCount: visibleElements.length,
                                rect: {
                                    width: firstElement.getBoundingClientRect().width,
                                    height: firstElement.getBoundingClientRect().height,
                                    top: firstElement.getBoundingClientRect().top,
                                    left: firstElement.getBoundingClientRect().left
                                },
                                className: firstElement.className,
                                tagName: firstElement.tagName
                            });
                        }
                    }
                    catch (e) {
                        console.warn(`容器查找失败 ${selector}:`, e.message);
                    }
                });
                // 分析层次结构
                const hierarchyAnalysis = {
                    root: 'body',
                    children: {},
                    relationships: []
                };
                // 简化的层次关系分析
                for (let i = 0; i < Math.min(containers.length, 5); i++) {
                    const parent = containers[i];
                    const children = containers.slice(i + 1, i + 3);
                    if (children.length > 0) {
                        hierarchyAnalysis.children[parent.id] = children.map(c => c.id);
                        children.forEach(child => {
                            hierarchyAnalysis.relationships.push({
                                parent: parent.id,
                                child: child.id,
                                type: 'contains'
                            });
                        });
                    }
                }
                return {
                    containers,
                    hierarchy: hierarchyAnalysis,
                    stats: {
                        totalContainers: containerSelectors.length,
                        discoveredContainers: containers.length,
                        successRate: containers.length / containerSelectors.length,
                        discoveryTime: Date.now() - startTime,
                        currentPage: window.location.href,
                        pageTitle: document.title
                    }
                };
            });
            // 注册发现的容器
            for (const container of discoveryResult.containers) {
                try {
                    const containerInfo = {
                        id: container.id,
                        website,
                        name: container.name,
                        selector: container.selector,
                        priority: container.priority,
                        description: `自动发现的${container.name}`,
                        type: 'auto-discovered',
                        isActive: true,
                        usage: {
                            accessCount: 1,
                            lastUsed: new Date().toISOString(),
                            successRate: 1,
                            success: true,
                            discoveryMethod: 'auto-discovery',
                            elementCount: container.elementCount
                        },
                        discovery: {
                            strategy: 'dom-analysis',
                            specificityThreshold: 50,
                            uniquenessThreshold: 0.8,
                            waitForElements: true,
                            timeout: 10000
                        },
                        metadata: {
                            originalId: container.originalId,
                            rect: container.rect,
                            className: container.className,
                            tagName: container.tagName,
                            discoveredAt: new Date().toISOString()
                        }
                    };
                    await this.registerContainer(website, containerInfo);
                }
                catch (error) {
                    console.error(`容器注册失败 ${container.id}:`, error.message);
                }
            }
            console.log(`✅ 自动容器发现完成: ${discoveryResult.stats.discoveredContainers} 个容器`);
            return discoveryResult;
        }
        catch (error) {
            console.error('❌ 自动容器发现失败:', error.message);
            throw error;
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
// ==================== 导出 ====================
export default ContainerRegistry;
//# sourceMappingURL=ContainerRegistry.js.map