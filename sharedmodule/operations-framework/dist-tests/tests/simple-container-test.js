"use strict";
/**
 * 简化版容器系统测试
 * 用于验证统一容器注册系统的功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../src/containers/index.js");
const index_js_2 = require("../src/containers/index.js");
// ==================== 测试运行器 ====================
class SimpleContainerTestRunner {
    constructor() {
        this.testResults = [];
        this.startTime = Date.now();
    }
    async runAllTests() {
        console.log('🧪 开始简化版容器系统测试...');
        try {
            // 测试1: 统一容器注册系统初始化
            await this.runTest('统一容器注册系统初始化', this.testUnifiedRegistryInitialization);
            // 测试2: 容器类型注册
            await this.runTest('容器类型注册', this.testContainerTypeRegistration);
            // 测试3: 容器创建
            await this.runTest('容器创建', this.testContainerCreation);
            // 测试4: 向后兼容性
            await this.runTest('向后兼容性', this.testBackwardCompatibility);
            // 输出测试报告
            this.generateTestReport();
        }
        catch (error) {
            console.error('❌ 测试运行失败:', error);
        }
    }
    async runTest(name, testFn) {
        const testStartTime = Date.now();
        let result;
        try {
            await testFn.call(this);
            result = {
                name,
                success: true,
                executionTime: Date.now() - testStartTime
            };
        }
        catch (error) {
            result = {
                name,
                success: false,
                error: error.message,
                executionTime: Date.now() - testStartTime
            };
        }
        this.testResults.push(result);
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${name} (${result.executionTime}ms)`);
    }
    // ==================== 测试用例 ====================
    async testUnifiedRegistryInitialization() {
        if (!index_js_1.unifiedContainerRegistry) {
            throw new Error('统一容器注册系统未正确初始化');
        }
        console.log('    统一容器注册系统实例已创建');
    }
    async testContainerTypeRegistration() {
        // 注册容器类型
        index_js_1.unifiedContainerRegistry.registerContainerType('TestContainer', index_js_2.BaseSelfRefreshingContainer);
        // 验证注册
        if (!index_js_1.unifiedContainerRegistry.hasContainerType('TestContainer')) {
            throw new Error('容器类型注册失败');
        }
        const containerType = index_js_1.unifiedContainerRegistry.getContainerType('TestContainer');
        if (containerType !== index_js_2.BaseSelfRefreshingContainer) {
            throw new Error('容器类型获取失败');
        }
        console.log('    容器类型注册成功');
    }
    async testContainerCreation() {
        // 注册内置容器类型
        index_js_1.unifiedContainerRegistry.registerContainerType('BaseSelfRefreshingContainer', index_js_2.BaseSelfRefreshingContainer);
        index_js_1.unifiedContainerRegistry.registerContainerType('WeiboPageContainer', index_js_2.WeiboPageContainer);
        index_js_1.unifiedContainerRegistry.registerContainerType('WeiboLinkContainer', index_js_2.WeiboLinkContainer);
        // 验证创建
        const containerTypes = index_js_1.unifiedContainerRegistry.getAllContainerTypes();
        if (containerTypes.length === 0) {
            throw new Error('没有注册的容器类型');
        }
        console.log(`    已注册 ${containerTypes.length} 种容器类型`);
        console.log(`    容器类型: ${containerTypes.join(', ')}`);
    }
    async testBackwardCompatibility() {
        // 测试向后兼容的容器注册器
        const legacyRegistry = index_js_1.ContainerRegistry.getInstance();
        if (!legacyRegistry) {
            throw new Error('向后兼容的容器注册器未正确初始化');
        }
        // 测试向后兼容的API
        const containerTypes = legacyRegistry.getAllContainerTypes();
        if (!Array.isArray(containerTypes)) {
            throw new Error('向后兼容API返回错误类型');
        }
        console.log('    向后兼容性测试通过');
    }
    // ==================== 测试报告 ====================
    generateTestReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        const executionTime = Date.now() - this.startTime;
        const successRate = (passedTests / totalTests) * 100;
        console.log('\n📋 测试报告:');
        console.log('============');
        this.testResults.forEach((test, index) => {
            const status = test.success ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${test.name} (${test.executionTime}ms)`);
            if (!test.success) {
                console.log(`   失败原因: ${test.error}`);
            }
        });
        console.log('\n📊 测试总结:');
        console.log('============');
        console.log(`✅ 通过测试: ${passedTests}/${totalTests}`);
        console.log(`📈 成功率: ${successRate.toFixed(1)}%`);
        console.log(`⏱️ 总执行时间: ${executionTime}ms`);
        if (failedTests === 0) {
            console.log('\n🎉 所有测试通过！');
        }
        else {
            console.log(`\n💥 ${failedTests} 个测试失败`);
        }
    }
}
// ==================== 主程序入口 ====================
async function runSimpleContainerTests() {
    console.log('🚀 开始简化版容器系统测试');
    console.log('==========================');
    const testRunner = new SimpleContainerTestRunner();
    await testRunner.runAllTests();
}
// 如果直接运行此文件，执行测试
if (require.main === module) {
    runSimpleContainerTests()
        .then(() => {
        console.log('\n✅ 测试完成');
        process.exit(0);
    })
        .catch((error) => {
        console.error('💥 测试失败:', error);
        process.exit(1);
    });
}
exports.default = runSimpleContainerTests;
