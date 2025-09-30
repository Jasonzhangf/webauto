/**
 * 简化版容器系统测试
 * 用于验证统一容器注册系统的功能
 */

import { unifiedContainerRegistry, ContainerRegistry } from '../src/containers/index.js';
import { BaseSelfRefreshingContainer, WeiboPageContainer, WeiboLinkContainer } from '../src/containers/index.js';

// ==================== 测试配置 ====================

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  executionTime: number;
}

// ==================== 测试运行器 ====================

class SimpleContainerTestRunner {
  private testResults: TestResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async runAllTests(): Promise<void> {
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

    } catch (error) {
      console.error('❌ 测试运行失败:', error);
    }
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const testStartTime = Date.now();
    let result: TestResult;

    try {
      await testFn.call(this);
      result = {
        name,
        success: true,
        executionTime: Date.now() - testStartTime
      };
    } catch (error: any) {
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

  private async testUnifiedRegistryInitialization(): Promise<void> {
    if (!unifiedContainerRegistry) {
      throw new Error('统一容器注册系统未正确初始化');
    }
    console.log('    统一容器注册系统实例已创建');
  }

  private async testContainerTypeRegistration(): Promise<void> {
    // 注册容器类型
    unifiedContainerRegistry.registerContainerType('TestContainer', BaseSelfRefreshingContainer);
    
    // 验证注册
    if (!unifiedContainerRegistry.hasContainerType('TestContainer')) {
      throw new Error('容器类型注册失败');
    }
    
    const containerType = unifiedContainerRegistry.getContainerType('TestContainer');
    if (containerType !== BaseSelfRefreshingContainer) {
      throw new Error('容器类型获取失败');
    }
    
    console.log('    容器类型注册成功');
  }

  private async testContainerCreation(): Promise<void> {
    // 注册内置容器类型
    unifiedContainerRegistry.registerContainerType('BaseSelfRefreshingContainer', BaseSelfRefreshingContainer);
    unifiedContainerRegistry.registerContainerType('WeiboPageContainer', WeiboPageContainer);
    unifiedContainerRegistry.registerContainerType('WeiboLinkContainer', WeiboLinkContainer);
    
    // 验证创建
    const containerTypes = unifiedContainerRegistry.getAllContainerTypes();
    if (containerTypes.length === 0) {
      throw new Error('没有注册的容器类型');
    }
    
    console.log(`    已注册 ${containerTypes.length} 种容器类型`);
    console.log(`    容器类型: ${containerTypes.join(', ')}`);
  }

  private async testBackwardCompatibility(): Promise<void> {
    // 测试向后兼容的容器注册器
    const legacyRegistry = ContainerRegistry.getInstance();
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

  private generateTestReport(): void {
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
    } else {
      console.log(`\n💥 ${failedTests} 个测试失败`);
    }
  }
}

// ==================== 主程序入口 ====================

async function runSimpleContainerTests(): Promise<void> {
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

export default runSimpleContainerTests;