/**
 * 容器系统测试和验证脚本
 * 对整个容器系统进行全面的功能测试和性能验证
 */
import { chromium } from 'playwright';
import { containerRegistry } from '../src/containers/index.js';
// ==================== 测试运行器 ====================
export class ContainerSystemTestRunner {
    constructor(testConfig) {
        this.testConfig = testConfig;
        this.browser = null;
        this.page = null;
        this.testResults = [];
        this.startTime = Date.now();
    }
    // ==================== 主测试流程 ====================
    async runAllTests() {
        console.log('🧪 开始容器系统测试...');
        console.log(`📋 测试套件: ${this.testConfig.name}`);
        console.log(`📝 描述: ${this.testConfig.description}`);
        console.log(`⏱️ 超时时间: ${this.testConfig.timeout / 1000}秒`);
        try {
            // 初始化测试环境
            await this.initializeTestEnvironment();
            // 运行所有测试用例
            for (const testCase of this.testConfig.testCases) {
                console.log(`\n🔍 执行测试: ${testCase.name}`);
                await this.runTestCase(testCase);
            }
            // 生成测试报告
            const result = this.generateTestReport();
            console.log('\n✅ 测试完成!');
            console.log(`📊 测试结果: ${result.passedTests}/${result.totalTests} 通过 (${result.summary.successRate.toFixed(1)}%)`);
            return result;
        }
        catch (error) {
            console.error('❌ 测试运行失败:', error);
            throw error;
        }
        finally {
            await this.cleanupTestEnvironment();
        }
    }
    async runTestCase(testCase) {
        const testStartTime = Date.now();
        let result;
        try {
            // 设置测试环境
            if (testCase.setup) {
                await testCase.setup();
            }
            // 运行测试
            const testResult = await this.executeTest(testCase);
            // 验证结果
            const validationResult = this.validateTestResult(testResult, testCase.expected);
            result = {
                name: testCase.name,
                type: testCase.type,
                priority: testCase.priority,
                success: validationResult.success,
                executionTime: Date.now() - testStartTime,
                details: validationResult.details,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            result = {
                name: testCase.name,
                type: testCase.type,
                priority: testCase.priority,
                success: false,
                executionTime: Date.now() - testStartTime,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
        finally {
            // 清理测试环境
            if (testCase.teardown) {
                try {
                    await testCase.teardown();
                }
                catch (error) {
                    console.warn(`测试清理失败: ${error.message}`);
                }
            }
        }
        this.testResults.push(result);
        // 输出测试结果
        const status = result.success ? '✅' : '❌';
        const timeStr = `${result.executionTime}ms`;
        console.log(`  ${status} ${testCase.name} (${timeStr})`);
        if (!result.success) {
            console.log(`    💥 失败原因: ${result.error || '未知错误'}`);
        }
    }
    async executeTest(testCase) {
        switch (testCase.type) {
            case 'unit':
                return await this.runUnitTest(testCase);
            case 'integration':
                return await this.runIntegrationTest(testCase);
            case 'performance':
                return await this.runPerformanceTest(testCase);
            case 'error':
                return await this.runErrorTest(testCase);
            default:
                throw new Error(`不支持的测试类型: ${testCase.type}`);
        }
    }
    // ==================== 测试类型实现 ====================
    async runUnitTest(testCase) {
        console.log(`    🧪 单元测试: ${testCase.containerType}`);
        // 创建容器实例
        const container = containerRegistry.createContainer(testCase.containerType, testCase.config);
        // 验证容器基本属性
        if (!container || typeof container.initialize !== 'function') {
            throw new Error('容器创建失败或缺少必要方法');
        }
        // 验证配置属性
        if (container.config) {
            Object.keys(testCase.config).forEach(key => {
                if (container.config[key] === undefined) {
                    throw new Error(`配置属性 ${key} 未正确设置`);
                }
            });
        }
        return {
            containerCreated: true,
            hasInitializeMethod: typeof container.initialize === 'function',
            hasCleanupMethod: typeof container.cleanup === 'function',
            configValid: true
        };
    }
    async runIntegrationTest(testCase) {
        console.log(`    🔗 集成测试: ${testCase.containerType}`);
        if (!this.page) {
            throw new Error('页面未初始化');
        }
        // 创建容器
        const container = containerRegistry.createContainer(testCase.containerType, testCase.config);
        // 创建共享空间
        const sharedSpace = this.createSharedSpace();
        try {
            // 初始化容器
            await container.initialize(this.page, sharedSpace);
            // 执行基本操作
            await container.refresh({
                type: 'initialization',
                timestamp: Date.now()
            });
            // 等待一段时间观察容器行为
            await new Promise(resolve => setTimeout(resolve, 2000));
            // 获取容器状态
            const stats = container.getStats();
            const state = container.getState();
            return {
                containerInitialized: true,
                refreshExecuted: true,
                state,
                stats,
                sharedSpaceAccessible: true
            };
        }
        finally {
            await container.cleanup();
        }
    }
    async runPerformanceTest(testCase) {
        console.log(`    ⚡ 性能测试: ${testCase.containerType}`);
        if (!this.page) {
            throw new Error('页面未初始化');
        }
        const container = containerRegistry.createContainer(testCase.containerType, testCase.config);
        const sharedSpace = this.createSharedSpace();
        try {
            await container.initialize(this.page, sharedSpace);
            // 执行多次刷新操作
            const iterations = 10;
            const refreshTimes = [];
            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();
                await container.refresh({
                    type: 'timer',
                    timestamp: Date.now()
                });
                refreshTimes.push(Date.now() - startTime);
            }
            // 计算性能指标
            const averageTime = refreshTimes.reduce((a, b) => a + b, 0) / refreshTimes.length;
            const minTime = Math.min(...refreshTimes);
            const maxTime = Math.max(...refreshTimes);
            const timeStdDev = Math.sqrt(refreshTimes.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / refreshTimes.length);
            return {
                iterations,
                averageTime,
                minTime,
                maxTime,
                timeStdDev,
                performanceRating: this.ratePerformance(averageTime)
            };
        }
        finally {
            await container.cleanup();
        }
    }
    async runErrorTest(testCase) {
        console.log(`    💥 错误测试: ${testCase.containerType}`);
        // 测试容器创建错误
        try {
            containerRegistry.createContainer('NonExistentContainer', {});
            throw new Error('应该抛出容器类型错误');
        }
        catch (error) {
            if (!error.message.includes('未知的容器类型')) {
                throw new Error('错误处理不正确');
            }
        }
        // 测试配置错误
        const container = containerRegistry.createContainer(testCase.containerType, testCase.config);
        // 测试无页面上下文的操作
        try {
            await container.refresh({
                type: 'manual',
                timestamp: Date.now()
            });
            throw new Error('应该抛出页面上下文错误');
        }
        catch (error) {
            if (!error.message.includes('页面上下文') && !error.message.includes('未设置')) {
                throw new Error('错误处理不正确');
            }
        }
        return {
            errorHandling: true,
            unknownContainerError: true,
            missingContextError: true
        };
    }
    // ==================== 辅助方法 ====================
    async initializeTestEnvironment() {
        console.log('🔧 初始化测试环境...');
        this.browser = await chromium.launch({
            headless: this.testConfig.browserConfig.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewportSize(this.testConfig.browserConfig.viewport);
        // 导航到测试页面
        await this.page.goto('about:blank');
        console.log('✅ 测试环境初始化完成');
    }
    async cleanupTestEnvironment() {
        console.log('🧹 清理测试环境...');
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            console.log('✅ 测试环境清理完成');
        }
        catch (error) {
            console.warn('⚠️ 测试环境清理警告:', error.message);
        }
    }
    createSharedSpace() {
        return {
            fileHandler: {
                saveFile: async () => { },
                readFile: async () => null,
                deleteFile: async () => { }
            },
            dataStore: new Map(),
            config: {
                timeout: 30000,
                logLevel: 'info'
            }
        };
    }
    validateTestResult(actual, expected) {
        if (expected.success !== undefined && actual.success !== expected.success) {
            return {
                success: false,
                details: {
                    expected: `success: ${expected.success}`,
                    actual: `success: ${actual.success}`
                }
            };
        }
        if (expected.executionTime && actual.executionTime > expected.executionTime) {
            return {
                success: false,
                details: {
                    expected: `executionTime <= ${expected.executionTime}ms`,
                    actual: `executionTime: ${actual.executionTime}ms`
                }
            };
        }
        if (expected.resultCount && actual.resultCount !== undefined && actual.resultCount < expected.resultCount) {
            return {
                success: false,
                details: {
                    expected: `resultCount >= ${expected.resultCount}`,
                    actual: `resultCount: ${actual.resultCount}`
                }
            };
        }
        return { success: true, details: { actual, expected } };
    }
    ratePerformance(averageTime) {
        if (averageTime < 100)
            return 'excellent';
        if (averageTime < 500)
            return 'good';
        if (averageTime < 1000)
            return 'fair';
        return 'poor';
    }
    generateTestReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        const executionTime = Date.now() - this.startTime;
        const successRate = (passedTests / totalTests) * 100;
        const averageExecutionTime = this.testResults.reduce((sum, r) => sum + r.executionTime, 0) / totalTests;
        let performance;
        if (successRate >= 95 && averageExecutionTime < 500)
            performance = 'excellent';
        else if (successRate >= 80 && averageExecutionTime < 1000)
            performance = 'good';
        else if (successRate >= 60)
            performance = 'fair';
        else
            performance = 'poor';
        return {
            suiteName: this.testConfig.name,
            totalTests,
            passedTests,
            failedTests,
            executionTime,
            results: this.testResults,
            summary: {
                successRate,
                averageExecutionTime,
                performance
            }
        };
    }
}
// ==================== 测试配置 ====================
export const containerSystemTestConfig = {
    name: 'Container System Test Suite',
    description: '微博容器系统全面测试',
    timeout: 300000,
    browserConfig: {
        headless: true,
        viewport: { width: 1920, height: 1080 }
    },
    testCases: [
        // 单元测试
        {
            name: 'BaseSelfRefreshingContainer 基本功能测试',
            type: 'unit',
            priority: 'high',
            containerType: 'BaseSelfRefreshingContainer',
            config: {
                id: 'test-base-container',
                name: '测试基础容器',
                selector: 'body',
                enableAutoRefresh: true,
                refreshInterval: 1000
            },
            expected: {
                success: true
            }
        },
        {
            name: 'WeiboLinkContainer 配置验证测试',
            type: 'unit',
            priority: 'high',
            containerType: 'WeiboLinkContainer',
            config: {
                id: 'test-link-container',
                name: '测试链接容器',
                selector: '.Feed_body',
                maxLinks: 10,
                enableAutoScroll: true
            },
            expected: {
                success: true
            }
        },
        {
            name: 'WeiboScrollContainer 配置验证测试',
            type: 'unit',
            priority: 'high',
            containerType: 'WeiboScrollContainer',
            config: {
                id: 'test-scroll-container',
                name: '测试滚动容器',
                selector: 'body',
                enableAutoScroll: true,
                maxScrollAttempts: 5
            },
            expected: {
                success: true
            }
        },
        {
            name: 'WeiboPaginationContainer 配置验证测试',
            type: 'unit',
            priority: 'high',
            containerType: 'WeiboPaginationContainer',
            config: {
                id: 'test-pagination-container',
                name: '测试分页容器',
                selector: 'body',
                enableAutoPagination: true,
                maxPageAttempts: 3
            },
            expected: {
                success: true
            }
        },
        // 集成测试
        {
            name: '容器注册器功能测试',
            type: 'integration',
            priority: 'high',
            containerType: 'BaseSelfRefreshingContainer',
            config: {
                id: 'test-registry-container',
                name: '测试注册器',
                selector: 'body'
            },
            expected: {
                success: true
            }
        },
        {
            name: '容器初始化和清理测试',
            type: 'integration',
            priority: 'medium',
            containerType: 'WeiboLinkContainer',
            config: {
                id: 'test-lifecycle-container',
                name: '测试生命周期',
                selector: 'body',
                maxLinks: 5
            },
            expected: {
                success: true,
                executionTime: 5000
            }
        },
        // 性能测试
        {
            name: '容器刷新性能测试',
            type: 'performance',
            priority: 'medium',
            containerType: 'BaseSelfRefreshingContainer',
            config: {
                id: 'test-performance-container',
                name: '测试性能',
                selector: 'body',
                enableAutoRefresh: true,
                refreshInterval: 100
            },
            expected: {
                success: true,
                executionTime: 3000
            }
        },
        // 错误测试
        {
            name: '错误处理和边界条件测试',
            type: 'error',
            priority: 'medium',
            containerType: 'BaseSelfRefreshingContainer',
            config: {
                id: 'test-error-container',
                name: '测试错误处理',
                selector: 'body'
            },
            expected: {
                success: true
            }
        }
    ]
};
// ==================== 主程序入口 ====================
export async function runContainerSystemTests() {
    console.log('🚀 开始容器系统测试');
    console.log('==========================');
    const testRunner = new ContainerSystemTestRunner(containerSystemTestConfig);
    const result = await testRunner.runAllTests();
    // 输出详细报告
    console.log('\n📋 详细测试报告:');
    console.log('================');
    result.results.forEach((test, index) => {
        const status = test.success ? '✅' : '❌';
        const priority = test.priority === 'high' ? '🔴' : test.priority === 'medium' ? '🟡' : '🟢';
        console.log(`${index + 1}. ${status} ${priority} ${test.name} (${test.executionTime}ms)`);
        if (!test.success) {
            console.log(`   失败原因: ${test.error}`);
        }
    });
    console.log('\n📊 测试总结:');
    console.log('============');
    console.log(`🎯 总体评价: ${result.summary.performance.toUpperCase()}`);
    console.log(`✅ 通过测试: ${result.passedTests}/${result.totalTests}`);
    console.log(`📈 成功率: ${result.summary.successRate.toFixed(1)}%`);
    console.log(`⏱️ 总执行时间: ${result.executionTime / 1000}秒`);
    console.log(`⚡ 平均执行时间: ${result.summary.averageExecutionTime.toFixed(0)}ms`);
    return result;
}
// 如果直接运行此文件，执行测试
if (require.main === module) {
    runContainerSystemTests()
        .then(result => {
        process.exit(result.failedTests > 0 ? 1 : 0);
    })
        .catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=container-system-test.js.map