import { UniversalOperator } from './UniversalOperator';
/**
 * 基础原子操作类
 * 所有原子操作都继承自此基类
 */
export class BaseAtomicOperation extends UniversalOperator {
    constructor(config = {}) {
        super({
            name: config.name || 'BaseAtomicOperation',
            type: 'atomic-operation',
            description: config.description || 'Base atomic operation',
            timeout: config.timeout || 30000,
            retryCount: config.retryCount || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        });
        this.config = config;
        this.stats = {
            executionCount: 0,
            successCount: 0,
            failureCount: 0,
            averageExecutionTime: 0,
            lastExecutionTime: 0
        };
    }
    /**
     * 执行前验证
     */
    async validate(context, params) {
        return true;
    }
    /**
     * 记录执行统计
     */
    recordStats(success, executionTime) {
        this.stats.executionCount++;
        this.stats.lastExecutionTime = executionTime;
        if (success) {
            this.stats.successCount++;
        }
        else {
            this.stats.failureCount++;
        }
        // 计算平均执行时间
        this.stats.averageExecutionTime =
            (this.stats.averageExecutionTime * (this.stats.executionCount - 1) + executionTime) /
                this.stats.executionCount;
    }
    /**
     * 获取操作统计信息
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            executionCount: 0,
            successCount: 0,
            failureCount: 0,
            averageExecutionTime: 0,
            lastExecutionTime: 0
        };
    }
}
//# sourceMappingURL=BaseAtomicOperation.js.map