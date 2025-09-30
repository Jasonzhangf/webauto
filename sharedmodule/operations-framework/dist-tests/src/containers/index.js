"use strict";
/**
 * 微博容器系统统一导出文件
 * 提供所有容器类型的统一访问接口
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTAINER_SYSTEM_INFO = exports.CONTAINER_SYSTEM_VERSION = exports.containerRegistry = exports.unifiedContainerRegistry = exports.UnifiedContainerRegistry = exports.WeiboReplyContainer = exports.WeiboCommentContainer = exports.WeiboPaginationContainer = exports.WeiboScrollContainer = exports.WeiboLinkContainer = exports.WeiboPageContainer = exports.BaseSelfRefreshingContainer = void 0;
exports.createContainer = createContainer;
exports.getContainerTypes = getContainerTypes;
exports.hasContainerType = hasContainerType;
// 基础容器
var BaseSelfRefreshingContainer_js_1 = require("./BaseSelfRefreshingContainer.js");
Object.defineProperty(exports, "BaseSelfRefreshingContainer", { enumerable: true, get: function () { return BaseSelfRefreshingContainer_js_1.BaseSelfRefreshingContainer; } });
// 微博特定容器
var WeiboPageContainer_js_1 = require("./WeiboPageContainer.js");
Object.defineProperty(exports, "WeiboPageContainer", { enumerable: true, get: function () { return WeiboPageContainer_js_1.WeiboPageContainer; } });
var WeiboLinkContainer_js_1 = require("./WeiboLinkContainer.js");
Object.defineProperty(exports, "WeiboLinkContainer", { enumerable: true, get: function () { return WeiboLinkContainer_js_1.WeiboLinkContainer; } });
var WeiboScrollContainer_js_1 = require("./WeiboScrollContainer.js");
Object.defineProperty(exports, "WeiboScrollContainer", { enumerable: true, get: function () { return WeiboScrollContainer_js_1.WeiboScrollContainer; } });
var WeiboPaginationContainer_js_1 = require("./WeiboPaginationContainer.js");
Object.defineProperty(exports, "WeiboPaginationContainer", { enumerable: true, get: function () { return WeiboPaginationContainer_js_1.WeiboPaginationContainer; } });
var WeiboCommentContainer_js_1 = require("./WeiboCommentContainer.js");
Object.defineProperty(exports, "WeiboCommentContainer", { enumerable: true, get: function () { return WeiboCommentContainer_js_1.WeiboCommentContainer; } });
var WeiboReplyContainer_js_1 = require("./WeiboReplyContainer.js");
Object.defineProperty(exports, "WeiboReplyContainer", { enumerable: true, get: function () { return WeiboReplyContainer_js_1.WeiboReplyContainer; } });
// 统一容器注册系统
var UnifiedContainerRegistry_js_1 = require("./UnifiedContainerRegistry.js");
Object.defineProperty(exports, "UnifiedContainerRegistry", { enumerable: true, get: function () { return UnifiedContainerRegistry_js_1.UnifiedContainerRegistry; } });
Object.defineProperty(exports, "unifiedContainerRegistry", { enumerable: true, get: function () { return UnifiedContainerRegistry_js_1.unifiedContainerRegistry; } });
// 保持向后兼容的容器注册器
class ContainerRegistry {
    constructor() {
        this.containerTypes = new Map();
        this.registerDefaultContainers();
    }
    static getInstance() {
        if (!ContainerRegistry.instance) {
            ContainerRegistry.instance = new ContainerRegistry();
        }
        return ContainerRegistry.instance;
    }
    registerDefaultContainers() {
        // 注册内置容器类型到统一注册系统
        unifiedContainerRegistry.registerContainerType('BaseSelfRefreshingContainer', BaseSelfRefreshingContainer);
        unifiedContainerRegistry.registerContainerType('WeiboPageContainer', WeiboPageContainer);
        unifiedContainerRegistry.registerContainerType('WeiboLinkContainer', WeiboLinkContainer);
        unifiedContainerRegistry.registerContainerType('WeiboScrollContainer', WeiboScrollContainer);
        unifiedContainerRegistry.registerContainerType('WeiboPaginationContainer', WeiboPaginationContainer);
        unifiedContainerRegistry.registerContainerType('WeiboCommentContainer', WeiboCommentContainer);
        unifiedContainerRegistry.registerContainerType('WeiboReplyContainer', WeiboReplyContainer);
    }
    registerContainer(type, containerClass) {
        unifiedContainerRegistry.registerContainerType(type, containerClass);
    }
    getContainer(type) {
        return unifiedContainerRegistry.getContainerType(type);
    }
    hasContainer(type) {
        return unifiedContainerRegistry.hasContainerType(type);
    }
    getAllContainerTypes() {
        return unifiedContainerRegistry.getAllContainerTypes();
    }
    createContainer(type, config) {
        return unifiedContainerRegistry.createContainer(type, config);
    }
    getContainerInfo() {
        return unifiedContainerRegistry.getContainerInfo();
    }
}
// 导出单例实例
exports.containerRegistry = ContainerRegistry.getInstance();
// 便利函数
function createContainer(type, config) {
    return exports.containerRegistry.createContainer(type, config);
}
function getContainerTypes() {
    return exports.containerRegistry.getAllContainerTypes();
}
function hasContainerType(type) {
    return exports.containerRegistry.hasContainer(type);
}
// 容器系统版本信息
exports.CONTAINER_SYSTEM_VERSION = '1.0.0';
exports.CONTAINER_SYSTEM_INFO = {
    version: exports.CONTAINER_SYSTEM_VERSION,
    description: '微博容器系统 - 基于自刷新架构的动态内容处理系统',
    features: [
        '多触发源刷新机制',
        '动态操作注册和发现',
        '任务驱动的生命周期管理',
        '嵌套容器支持',
        '智能错误恢复',
        '性能监控和统计'
    ],
    supportedContainers: [
        '页面管理容器',
        '链接提取容器',
        '滚动控制容器',
        '分页控制容器',
        '评论处理容器',
        '回复处理容器'
    ],
    author: 'WebAuto Team',
    created: '2024-01-01',
    updated: new Date().toISOString().split('T')[0]
};
// 默认导出
exports.default = {
    // 基础容器
    BaseSelfRefreshingContainer,
    // 微博容器
    WeiboPageContainer,
    WeiboLinkContainer,
    WeiboScrollContainer,
    WeiboPaginationContainer,
    WeiboCommentContainer,
    WeiboReplyContainer,
    // 新的统一容器注册系统
    UnifiedContainerRegistry,
    unifiedContainerRegistry,
    // 向后兼容的工具类
    ContainerRegistry,
    containerRegistry: exports.containerRegistry,
    // 便利函数
    createContainer,
    getContainerTypes,
    hasContainerType,
    // 系统信息
    CONTAINER_SYSTEM_VERSION: exports.CONTAINER_SYSTEM_VERSION,
    CONTAINER_SYSTEM_INFO: exports.CONTAINER_SYSTEM_INFO
};
