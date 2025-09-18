/**
 * 性能监控器 - 监控操作性能和系统状态
 */
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            operations: [],
            sessions: [],
            errors: [],
            warnings: []
        };
        
        this.currentSession = {
            startTime: null,
            operations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            totalDuration: 0,
            averageResponseTime: 0
        };
        
        this.thresholds = {
            slowOperation: 5000,
            verySlowOperation: 10000,
            highErrorRate: 0.3,
            memoryWarning: 500 * 1024 * 1024, // 500MB
            cpuWarning: 80 // 80%
        };
        
        this.alerts = [];
        this.recommendations = [];
    }

    /**
     * 记录操作性能
     */
    recordOperation(operation, success, duration) {
        const timestamp = Date.now();
        const operationMetric = {
            operation: operation.type || operation,
            success,
            duration,
            timestamp,
            details: this.extractOperationDetails(operation)
        };

        this.metrics.operations.push(operationMetric);
        
        // 更新当前会话
        this.updateSessionMetrics(operationMetric);
        
        // 检查性能警告
        this.checkPerformanceWarnings(operationMetric);
        
        // 限制历史记录长度
        if (this.metrics.operations.length > 1000) {
            this.metrics.operations = this.metrics.operations.slice(-500);
        }
        
        // 如果操作太慢，记录警告
        if (duration > this.thresholds.slowOperation) {
            this.addWarning('slow_operation', {
                operation: operation.type || operation,
                duration,
                threshold: this.thresholds.slowOperation
            });
        }
    }

    /**
     * 开始新会话
     */
    startSession() {
        this.currentSession = {
            startTime: Date.now(),
            operations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            totalDuration: 0,
            averageResponseTime: 0
        };
        
        console.log('🔍 开始新的性能监控会话');
    }

    /**
     * 结束会话
     */
    endSession() {
        if (this.currentSession.startTime) {
            this.currentSession.endTime = Date.now();
            this.currentSession.totalDuration = this.currentSession.endTime - this.currentSession.startTime;
            
            this.metrics.sessions.push({...this.currentSession});
            
            console.log(`📊 会话结束 - 操作: ${this.currentSession.operations}, 成功率: ${this.getSuccessRate()}%`);
        }
    }

    /**
     * 更新会话指标
     */
    updateSessionMetrics(operationMetric) {
        this.currentSession.operations++;
        
        if (operationMetric.success) {
            this.currentSession.successfulOperations++;
        } else {
            this.currentSession.failedOperations++;
        }
        
        // 更新平均响应时间
        const totalOps = this.currentSession.operations;
        const currentAvg = this.currentSession.averageResponseTime;
        const newDuration = operationMetric.duration;
        
        this.currentSession.averageResponseTime = 
            (currentAvg * (totalOps - 1) + newDuration) / totalOps;
    }

    /**
     * 检查性能警告
     */
    checkPerformanceWarnings(operationMetric) {
        const { operation, duration } = operationMetric;
        
        // 检查慢操作
        if (duration > this.thresholds.verySlowOperation) {
            this.addWarning('very_slow_operation', {
                operation,
                duration,
                threshold: this.thresholds.verySlowOperation
            });
        }
        
        // 检查错误率
        const errorRate = this.getErrorRate();
        if (errorRate > this.thresholds.highErrorRate) {
            this.addWarning('high_error_rate', {
                errorRate,
                threshold: this.thresholds.highErrorRate
            });
        }
        
        // 检查系统资源
        this.checkSystemResources();
    }

    /**
     * 检查系统资源
     */
    async checkSystemResources() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            // 检查内存使用
            if (memUsage.heapUsed > this.thresholds.memoryWarning) {
                this.addWarning('high_memory_usage', {
                    used: memUsage.heapUsed,
                    threshold: this.thresholds.memoryWarning
                });
            }
            
            // 检查CPU使用（简化版本）
            const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // 转换为秒
            if (cpuPercent > this.thresholds.cpuWarning) {
                this.addWarning('high_cpu_usage', {
                    usage: cpuPercent,
                    threshold: this.thresholds.cpuWarning
                });
            }
            
        } catch (error) {
            console.error('检查系统资源失败:', error.message);
        }
    }

    /**
     * 添加警告
     */
    addWarning(type, details) {
        const warning = {
            type,
            details,
            timestamp: Date.now(),
            severity: this.getWarningSeverity(type)
        };
        
        this.metrics.warnings.push(warning);
        this.alerts.push(warning);
        
        console.warn(`⚠️ 性能警告: ${type}`, details);
        
        // 生成建议
        const recommendation = this.generateRecommendation(type, details);
        if (recommendation) {
            this.recommendations.push(recommendation);
        }
    }

    /**
     * 添加错误
     */
    addError(error, operation) {
        const errorMetric = {
            error: error.message,
            stack: error.stack,
            operation: operation?.type || operation,
            timestamp: Date.now()
        };
        
        this.metrics.errors.push(errorMetric);
        
        // 限制错误记录长度
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-50);
        }
    }

    /**
     * 获取性能报告
     */
    getPerformanceReport() {
        const session = this.currentSession;
        const successRate = this.getSuccessRate();
        const avgResponseTime = this.getAverageResponseTime();
        const errorRate = this.getErrorRate();
        
        // 按操作类型分组统计
        const operationStats = this.getOperationStats();
        
        // 获取最近的警告
        const recentWarnings = this.metrics.warnings.filter(
            w => Date.now() - w.timestamp < 3600000 // 1小时内
        );
        
        return {
            session: {
                duration: session.endTime ? session.totalDuration : Date.now() - session.startTime,
                operations: session.operations,
                successfulOperations: session.successfulOperations,
                failedOperations: session.failedOperations,
                successRate,
                averageResponseTime: avgResponseTime,
                errorRate
            },
            operationStats,
            warnings: recentWarnings,
            alerts: this.alerts.slice(-10), // 最近10个警告
            recommendations: this.recommendations.slice(-5), // 最近5个建议
            thresholds: this.thresholds
        };
    }

    /**
     * 获取操作统计
     */
    getOperationStats() {
        const stats = new Map();
        
        for (const operation of this.metrics.operations) {
            const opType = operation.operation;
            
            if (!stats.has(opType)) {
                stats.set(opType, {
                    count: 0,
                    successes: 0,
                    failures: 0,
                    totalDuration: 0,
                    minDuration: Infinity,
                    maxDuration: 0,
                    averageDuration: 0
                });
            }
            
            const stat = stats.get(opType);
            stat.count++;
            stat.totalDuration += operation.duration;
            
            if (operation.success) {
                stat.successes++;
            } else {
                stat.failures++;
            }
            
            stat.minDuration = Math.min(stat.minDuration, operation.duration);
            stat.maxDuration = Math.max(stat.maxDuration, operation.duration);
            stat.averageDuration = stat.totalDuration / stat.count;
        }
        
        return Object.fromEntries(stats);
    }

    /**
     * 获取成功率
     */
    getSuccessRate() {
        const session = this.currentSession;
        if (!session || session.operations === 0) return 0;
        
        return (session.successfulOperations / session.operations) * 100;
    }

    /**
     * 获取平均响应时间
     */
    getAverageResponseTime() {
        const session = this.currentSession;
        return session.averageResponseTime || 0;
    }

    /**
     * 获取错误率
     */
    getErrorRate() {
        const session = this.currentSession;
        if (!session || session.operations === 0) return 0;
        
        return (session.failedOperations / session.operations) * 100;
    }

    /**
     * 获取警告严重程度
     */
    getWarningSeverity(type) {
        const severityMap = {
            'slow_operation': 'medium',
            'very_slow_operation': 'high',
            'high_error_rate': 'high',
            'high_memory_usage': 'medium',
            'high_cpu_usage': 'medium'
        };
        
        return severityMap[type] || 'low';
    }

    /**
     * 生成建议
     */
    generateRecommendation(type, details = {}) {
        const recommendations = {
            'slow_operation': `操作 ${details.operation || 'unknown'} 过慢 (${details.duration || 0}ms)，建议优化算法或增加延迟`,
            'very_slow_operation': `操作 ${details.operation || 'unknown'} 非常慢 (${details.duration || 0}ms)，建议检查网络连接或优化页面加载策略`,
            'high_error_rate': `错误率过高 (${((details.errorRate || 0) * 100).toFixed(1)}%)，建议检查登录状态或网络连接`,
            'high_memory_usage': `内存使用过高 (${((details.used || 0) / 1024 / 1024).toFixed(1)}MB)，建议定期清理浏览器缓存`,
            'high_cpu_usage': `CPU使用率过高 (${(details.usage || 0).toFixed(1)}%)，建议减少并发操作`
        };
        
        return {
            type,
            message: recommendations[type],
            timestamp: Date.now(),
            priority: this.getWarningSeverity(type)
        };
    }

    /**
     * 提取操作详情
     */
    extractOperationDetails(operation) {
        if (typeof operation === 'string') {
            return { type: operation };
        }
        
        if (typeof operation === 'object') {
            const details = { ...operation };
            
            // 移除可能的敏感信息
            delete details.password;
            delete details.token;
            delete details.cookie;
            
            return details;
        }
        
        return { type: 'unknown' };
    }

    /**
     * 导出性能数据
     */
    exportMetrics(format = 'json') {
        const data = {
            metrics: this.metrics,
            currentSession: this.currentSession,
            report: this.getPerformanceReport(),
            exportTime: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        return data;
    }

    /**
     * 重置指标
     */
    resetMetrics() {
        this.metrics = {
            operations: [],
            sessions: [],
            errors: [],
            warnings: []
        };
        
        this.alerts = [];
        this.recommendations = [];
        
        console.log('🔄 性能指标已重置');
    }

    /**
     * 获取实时性能状态
     */
    getRealTimeStatus() {
        return {
            sessionActive: this.currentSession.startTime !== null,
            sessionDuration: this.currentSession.startTime ? 
                Date.now() - this.currentSession.startTime : 0,
            operationsThisSession: this.currentSession.operations,
            successRate: this.getSuccessRate(),
            averageResponseTime: this.getAverageResponseTime(),
            recentAlerts: this.alerts.slice(-3),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

module.exports = { PerformanceMonitor };