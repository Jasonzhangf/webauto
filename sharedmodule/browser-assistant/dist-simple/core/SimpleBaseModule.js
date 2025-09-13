"use strict";
/**
 * 简化的浏览器助手基类
 * 提供基础的生命周期管理和简单的日志功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBrowserModule = void 0;
class BaseBrowserModule {
    isInitialized = false;
    moduleName;
    constructor(moduleName) {
        this.moduleName = moduleName;
    }
    /**
     * 初始化模块
     */
    async initialize() {
        if (this.isInitialized) {
            this.warn('Module already initialized');
            return;
        }
        try {
            this.logInfo(`Initializing ${this.moduleName}...`);
            // 调用子类的初始化逻辑
            await this.onInitialize();
            this.isInitialized = true;
            this.logInfo(`${this.moduleName} initialized successfully`);
        }
        catch (error) {
            this.error(`Failed to initialize ${this.moduleName}:`, error);
            throw error;
        }
    }
    /**
     * 清理资源
     */
    async cleanup() {
        if (!this.isInitialized) {
            return;
        }
        try {
            this.logInfo(`Cleaning up ${this.moduleName}...`);
            // 调用子类的清理逻辑
            await this.onCleanup();
            this.isInitialized = false;
            this.logInfo(`${this.moduleName} cleaned up successfully`);
        }
        catch (error) {
            this.error(`Failed to cleanup ${this.moduleName}:`, error);
            throw error;
        }
    }
    /**
     * 获取模块状态
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            healthy: this.isInitialized && this.checkHealth(),
            moduleName: this.moduleName
        };
    }
    /**
     * 简单的日志方法
     */
    logInfo(message, data) {
        console.log(`[${this.moduleName}] INFO: ${message}`, data || '');
    }
    warn(message, data) {
        console.warn(`[${this.moduleName}] WARN: ${message}`, data || '');
    }
    error(message, error) {
        console.error(`[${this.moduleName}] ERROR: ${message}`, error || '');
    }
    debug(message, data) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[${this.moduleName}] DEBUG: ${message}`, data || '');
        }
    }
}
exports.BaseBrowserModule = BaseBrowserModule;
//# sourceMappingURL=SimpleBaseModule.js.map