"use strict";
/**
 * 简化版BaseOperation实现，用于快速通过编译测试
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseOperation = void 0;
class BaseOperation {
    name;
    description;
    version;
    author;
    abstractCategories = [];
    supportedContainers = [];
    capabilities = [];
    performance = {
        speed: 'medium',
        accuracy: 'medium',
        successRate: 0.5,
        memoryUsage: 'medium'
    };
    requiredParameters = [];
    optionalParameters = {};
    stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0
    };
    config = {};
    startTime = 0;
    constructor() {
        this.startTime = Date.now();
    }
    validateParameters(params) {
        const errors = [];
        const warnings = [];
        // 检查必需参数
        for (const param of this.requiredParameters) {
            if (!(param in params)) {
                errors.push(`Missing required parameter: ${param}`);
            }
        }
        return {
            isValid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined,
            finalParams: params
        };
    }
    supportsContainer(containerType) {
        return this.supportedContainers.includes(containerType);
    }
    hasCapability(capability) {
        return this.capabilities.includes(capability);
    }
    getStats() {
        return { ...this.stats };
    }
    resetStats() {
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0
        };
    }
    getInfo() {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            author: this.author,
            categories: this.abstractCategories,
            capabilities: this.capabilities,
            performance: this.performance,
            requiredParameters: this.requiredParameters,
            optionalParameters: this.optionalParameters
        };
    }
}
exports.BaseOperation = BaseOperation;
//# sourceMappingURL=BaseOperationSimple.js.map