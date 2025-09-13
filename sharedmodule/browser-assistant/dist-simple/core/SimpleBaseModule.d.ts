/**
 * 简化的浏览器助手基类
 * 提供基础的生命周期管理和简单的日志功能
 */
export declare abstract class BaseBrowserModule {
    protected isInitialized: boolean;
    protected moduleName: string;
    constructor(moduleName: string);
    /**
     * 初始化模块
     */
    initialize(): Promise<void>;
    /**
     * 清理资源
     */
    cleanup(): Promise<void>;
    /**
     * 获取模块状态
     */
    getStatus(): {
        initialized: boolean;
        healthy: boolean;
        moduleName: string;
    };
    /**
     * 子类需要实现的初始化逻辑
     */
    protected abstract onInitialize(): Promise<void>;
    /**
     * 子类需要实现的清理逻辑
     */
    protected abstract onCleanup(): Promise<void>;
    /**
     * 健康检查
     */
    protected abstract checkHealth(): boolean;
    /**
     * 简单的日志方法
     */
    protected logInfo(message: string, data?: any): void;
    protected warn(message: string, data?: any): void;
    protected error(message: string, error?: any): void;
    protected debug(message: string, data?: any): void;
}
//# sourceMappingURL=SimpleBaseModule.d.ts.map