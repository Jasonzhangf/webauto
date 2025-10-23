/**
 * AdvancedClickNode 性能和可靠性测试框架
 * 提供全面的性能监控、可靠性测试和自动化执行能力
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceTestFramework {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './tests/performance/results',
      logLevel: options.logLevel || 'info',
      maxConcurrentTests: options.maxConcurrentTests || 3,
      timeoutMs: options.timeoutMs || 300000, // 5分钟
      retries: options.retries || 2,
      enableScreenshots: options.enableScreenshots || true,
      enableMemoryMonitoring: options.enableMemoryMonitoring || true,
      enableNetworkMonitoring: options.enableNetworkMonitoring || true,
      ...options
    };

    this.results = {
      testSuite: {
        name: 'AdvancedClickNode Performance & Reliability Test',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: this.getEnvironmentInfo(),
        summary: {
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          totalDuration: 0,
          averageResponseTime: 0,
          successRate: 0
        },
        categories: {},
        detailedResults: [],
        performanceMetrics: {
          memoryUsage: [],
          responseTimes: [],
          errorRates: [],
          throughput: []
        },
        reliabilityMetrics: {
          crashCount: 0,
          timeoutCount: 0,
          errorFrequency: {},
          consistencyScores: []
        }
      }
    };

    this.logger = this.createLogger();
    this.testCategories = this.initializeTestCategories();
  }

  /**
   * 获取环境信息
   */
  getEnvironmentInfo() {
    const os = require('os');
    const process = require('process');

    return {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024) + 'MB',
      uptime: Math.round(os.uptime()) + 's',
      loadAverage: os.loadavg()
    };
  }

  /**
   * 创建日志记录器
   */
  createLogger() {
    return {
      info: (message, data = {}) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          data
        };
        console.log(`[INFO] ${message}`, data);
        this.logEntry(logEntry);
      },

      warn: (message, data = {}) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
          data
        };
        console.warn(`[WARN] ${message}`, data);
        this.logEntry(logEntry);
      },

      error: (message, error = null) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: 'error',
          message,
          error: error ? {
            message: error.message,
            stack: error.stack,
            code: error.code
          } : null
        };
        console.error(`[ERROR] ${message}`, error);
        this.logEntry(logEntry);
      },

      debug: (message, data = {}) => {
        if (this.options.logLevel === 'debug') {
          const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'debug',
            message,
            data
          };
          console.debug(`[DEBUG] ${message}`, data);
          this.logEntry(logEntry);
        }
      },

      entries: [],

      logEntry(entry) {
        this.entries.push(entry);
      },

      getLogs() {
        return this.entries;
      },

      clearLogs() {
        this.entries = [];
      }
    };
  }

  /**
   * 初始化测试类别
   */
  initializeTestCategories() {
    return {
      'basic-functionality': {
        name: '基础功能测试',
        description: '验证AdvancedClickNode的基本点击功能',
        priority: 'high',
        tests: []
      },
      'performance-tests': {
        name: '性能测试',
        description: '测试点击操作的性能指标',
        priority: 'high',
        tests: []
      },
      'reliability-tests': {
        name: '可靠性测试',
        description: '测试系统在各种条件下的稳定性',
        priority: 'high',
        tests: []
      },
      'stress-tests': {
        name: '压力测试',
        description: '测试系统在高负载下的表现',
        priority: 'medium',
        tests: []
      },
      'compatibility-tests': {
        name: '兼容性测试',
        description: '测试不同浏览器和网站的兼容性',
        priority: 'medium',
        tests: []
      },
      'error-handling-tests': {
        name: '错误处理测试',
        description: '测试各种错误情况的处理',
        priority: 'high',
        tests: []
      }
    };
  }

  /**
   * 添加测试用例
   */
  addTest(category, testConfig) {
    if (!this.testCategories[category]) {
      throw new Error(`Unknown test category: ${category}`);
    }

    const test = {
      id: testConfig.id || `${category}-${Date.now()}`,
      name: testConfig.name,
      description: testConfig.description,
      priority: testConfig.priority || 'medium',
      timeout: testConfig.timeout || this.options.timeoutMs,
      retries: testConfig.retries || this.options.retries,
      preconditions: testConfig.preconditions || [],
      steps: testConfig.steps || [],
      expectedResults: testConfig.expectedResults || [],
      performanceThresholds: testConfig.performanceThresholds || {},
      reliabilityThresholds: testConfig.reliabilityThresholds || {},
      tags: testConfig.tags || [],
      enabled: testConfig.enabled !== false
    };

    this.testCategories[category].tests.push(test);
    this.logger.info(`Added test to category ${category}: ${test.name}`, { testId: test.id });
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    this.logger.info('Starting comprehensive performance and reliability test suite');

    const startTime = performance.now();
    this.results.testSuite.summary.totalTests = this.countAllTests();

    for (const [categoryKey, category] of Object.entries(this.testCategories)) {
      this.logger.info(`Running test category: ${category.name}`);

      try {
        const categoryResults = await this.runTestCategory(categoryKey, category);
        this.results.testSuite.categories[categoryKey] = categoryResults;
      } catch (error) {
        this.logger.error(`Failed to run test category ${categoryKey}`, error);
        this.results.testSuite.categories[categoryKey] = {
          ...category,
          status: 'failed',
          error: error.message,
          tests: []
        };
      }
    }

    const endTime = performance.now();
    this.results.testSuite.summary.totalDuration = Math.round(endTime - startTime);
    this.calculateFinalMetrics();

    await this.saveResults();
    this.logger.info('Test suite completed', this.results.testSuite.summary);

    return this.results;
  }

  /**
   * 运行特定测试类别
   */
  async runTestCategory(categoryKey, category) {
    const categoryResults = {
      ...category,
      status: 'running',
      startTime: new Date().toISOString(),
      tests: [],
      summary: {
        total: category.tests.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        averageDuration: 0
      }
    };

    const testResults = [];
    let totalDuration = 0;

    for (const test of category.tests) {
      if (!test.enabled) {
        categoryResults.summary.skipped++;
        continue;
      }

      const testResult = await this.runSingleTest(test, categoryKey);
      testResults.push(testResult);

      if (testResult.status === 'passed') {
        categoryResults.summary.passed++;
      } else if (testResult.status === 'failed') {
        categoryResults.summary.failed++;
      } else {
        categoryResults.summary.skipped++;
      }

      totalDuration += testResult.duration;
    }

    categoryResults.tests = testResults;
    categoryResults.summary.averageDuration = testResults.length > 0 ?
      Math.round(totalDuration / testResults.length) : 0;
    categoryResults.status = categoryResults.summary.failed === 0 ? 'passed' : 'failed';
    categoryResults.endTime = new Date().toISOString();

    return categoryResults;
  }

  /**
   * 运行单个测试
   */
  async runSingleTest(test, categoryKey) {
    const testResult = {
      ...test,
      category: categoryKey,
      startTime: new Date().toISOString(),
      status: 'running',
      steps: [],
      performanceMetrics: {},
      reliabilityMetrics: {},
      errors: [],
      screenshots: [],
      logs: []
    };

    this.logger.info(`Running test: ${test.name}`, { testId: test.id, category: categoryKey });

    try {
      const startTime = performance.now();

      // 预条件检查
      await this.checkPreconditions(test, testResult);

      // 内存监控开始
      let memoryMonitor = null;
      if (this.options.enableMemoryMonitoring) {
        memoryMonitor = this.startMemoryMonitoring(testResult);
      }

      // 执行测试步骤
      for (let i = 0; i < test.steps.length; i++) {
        const step = test.steps[i];
        const stepResult = await this.executeStep(step, i, testResult);
        testResult.steps.push(stepResult);

        if (stepResult.status === 'failed') {
          throw new Error(`Step ${i + 1} failed: ${stepResult.error}`);
        }
      }

      // 停止内存监控
      if (memoryMonitor) {
        clearInterval(memoryMonitor);
      }

      const endTime = performance.now();
      testResult.duration = Math.round(endTime - startTime);
      testResult.endTime = new Date().toISOString();
      testResult.status = 'passed';

      // 验证期望结果
      await this.verifyExpectedResults(test, testResult);

      this.logger.info(`Test passed: ${test.name}`, {
        duration: testResult.duration,
        testId: test.id
      });

    } catch (error) {
      testResult.status = 'failed';
      testResult.error = {
        message: error.message,
        stack: error.stack,
        code: error.code
      };
      testResult.endTime = new Date().toISOString();

      this.logger.error(`Test failed: ${test.name}`, error);
    }

    this.results.testSuite.detailedResults.push(testResult);
    return testResult;
  }

  /**
   * 检查预条件
   */
  async checkPreconditions(test, testResult) {
    for (const precondition of test.preconditions) {
      try {
        await this.executePrecondition(precondition, testResult);
      } catch (error) {
        throw new Error(`Precondition failed: ${precondition.description || 'Unknown'} - ${error.message}`);
      }
    }
  }

  /**
   * 执行预条件
   */
  async executePrecondition(precondition, testResult) {
    // 这里可以实现各种预条件检查
    // 比如检查网络连接、检查服务状态、准备测试数据等
    this.logger.debug(`Executing precondition: ${precondition.description || 'Unknown'}`);

    if (precondition.type === 'network_check') {
      // 实现网络连接检查
    } else if (precondition.type === 'service_check') {
      // 实现服务状态检查
    } else if (precondition.type === 'data_preparation') {
      // 实现测试数据准备
    }
  }

  /**
   * 执行测试步骤
   */
  async executeStep(step, stepIndex, testResult) {
    const stepResult = {
      index: stepIndex,
      description: step.description || `Step ${stepIndex + 1}`,
      type: step.type,
      startTime: new Date().toISOString(),
      status: 'running'
    };

    try {
      this.logger.debug(`Executing step: ${stepResult.description}`);

      if (step.type === 'click_test') {
        await this.executeClickTest(step, stepResult, testResult);
      } else if (step.type === 'performance_test') {
        await this.executePerformanceTest(step, stepResult, testResult);
      } else if (step.type === 'reliability_test') {
        await this.executeReliabilityTest(step, stepResult, testResult);
      } else if (step.type === 'stress_test') {
        await this.executeStressTest(step, stepResult, testResult);
      } else {
        throw new Error(`Unknown step type: ${step.type}`);
      }

      stepResult.status = 'passed';
      stepResult.endTime = new Date().toISOString();

    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error = error.message;
      stepResult.endTime = new Date().toISOString();
      this.logger.error(`Step failed: ${stepResult.description}`, error);
    }

    return stepResult;
  }

  /**
   * 执行点击测试
   */
  async executeClickTest(step, stepResult, testResult) {
    const { WorkflowEngine } = require('../../workflows/engine/WorkflowEngine');

    const workflowConfig = step.workflowConfig;
    const engine = new WorkflowEngine();

    const result = await engine.executeWorkflow(workflowConfig);

    stepResult.result = result;
    stepResult.success = result.success;
    stepResult.duration = result.duration || 0;

    if (this.options.enableScreenshots && result.screenshots) {
      testResult.screenshots.push(...result.screenshots);
    }
  }

  /**
   * 执行性能测试
   */
  async executePerformanceTest(step, stepResult, testResult) {
    const iterations = step.iterations || 10;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      // 执行测试操作
      await this.executeClickTest(step, stepResult, testResult);

      const endTime = performance.now();
      results.push(endTime - startTime);
    }

    stepResult.performanceData = {
      iterations,
      results,
      average: results.reduce((a, b) => a + b, 0) / results.length,
      min: Math.min(...results),
      max: Math.max(...results),
      median: this.calculateMedian(results),
      p95: this.calculatePercentile(results, 95),
      p99: this.calculatePercentile(results, 99)
    };

    // 检查性能阈值
    if (step.performanceThresholds) {
      this.checkPerformanceThresholds(stepResult, step.performanceThresholds);
    }
  }

  /**
   * 执行可靠性测试
   */
  async executeReliabilityTest(step, stepResult, testResult) {
    const iterations = step.iterations || 100;
    const results = {
      success: 0,
      failure: 0,
      errors: {}
    };

    for (let i = 0; i < iterations; i++) {
      try {
        await this.executeClickTest(step, stepResult, testResult);
        results.success++;
      } catch (error) {
        results.failure++;
        const errorType = error.constructor.name;
        results.errors[errorType] = (results.errors[errorType] || 0) + 1;
      }
    }

    stepResult.reliabilityData = {
      iterations,
      successRate: (results.success / iterations) * 100,
      failureRate: (results.failure / iterations) * 100,
      errorDistribution: results.errors
    };

    // 检查可靠性阈值
    if (step.reliabilityThresholds) {
      this.checkReliabilityThresholds(stepResult, step.reliabilityThresholds);
    }
  }

  /**
   * 执行压力测试
   */
  async executeStressTest(step, stepResult, testResult) {
    const concurrency = step.concurrency || 5;
    const duration = step.duration || 60000; // 1分钟
    const promises = [];

    const startTime = Date.now();
    let operationCount = 0;

    const runOperation = async () => {
      while (Date.now() - startTime < duration) {
        try {
          await this.executeClickTest(step, stepResult, testResult);
          operationCount++;
        } catch (error) {
          // 记录错误但继续测试
        }

        // 短暂延迟避免过度占用资源
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    // 启动并发操作
    for (let i = 0; i < concurrency; i++) {
      promises.push(runOperation());
    }

    await Promise.all(promises);

    stepResult.stressData = {
      concurrency,
      duration,
      totalOperations: operationCount,
      operationsPerSecond: operationCount / (duration / 1000),
      actualDuration: Date.now() - startTime
    };
  }

  /**
   * 开始内存监控
   */
  startMemoryMonitoring(testResult) {
    return setInterval(() => {
      const memUsage = process.memoryUsage();
      testResult.performanceMetrics.memoryUsage = testResult.performanceMetrics.memoryUsage || [];
      testResult.performanceMetrics.memoryUsage.push({
        timestamp: new Date().toISOString(),
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      });
    }, 1000); // 每秒记录一次
  }

  /**
   * 验证期望结果
   */
  async verifyExpectedResults(test, testResult) {
    for (const expectedResult of test.expectedResults) {
      try {
        const verification = await this.verifyExpectedResult(expectedResult, testResult);
        testResult.verification = testResult.verification || [];
        testResult.verification.push(verification);

        if (!verification.passed) {
          throw new Error(`Expected result verification failed: ${verification.description}`);
        }
      } catch (error) {
        throw new Error(`Expected result verification error: ${error.message}`);
      }
    }
  }

  /**
   * 验证单个期望结果
   */
  async verifyExpectedResult(expectedResult, testResult) {
    // 这里实现各种验证逻辑
    const verification = {
      description: expectedResult.description || 'Unknown verification',
      type: expectedResult.type,
      passed: false,
      actual: null,
      expected: expectedResult.value,
      timestamp: new Date().toISOString()
    };

    if (expectedResult.type === 'click_success') {
      verification.actual = testResult.steps.some(step => step.success === true);
      verification.passed = verification.actual === expectedResult.value;
    } else if (expectedResult.type === 'performance_threshold') {
      const avgTime = testResult.performanceMetrics.averageResponseTime || 0;
      verification.actual = avgTime;
      verification.passed = avgTime <= expectedResult.value;
    } else if (expectedResult.type === 'reliability_threshold') {
      const reliabilityData = testResult.steps.find(step => step.reliabilityData);
      if (reliabilityData) {
        verification.actual = reliabilityData.reliabilityData.successRate;
        verification.passed = verification.actual >= expectedResult.value;
      }
    }

    return verification;
  }

  /**
   * 检查性能阈值
   */
  checkPerformanceThresholds(stepResult, thresholds) {
    const performanceData = stepResult.performanceData;

    if (thresholds.maxAverageTime && performanceData.average > thresholds.maxAverageTime) {
      throw new Error(`Average time ${performanceData.average}ms exceeds threshold ${thresholds.maxAverageTime}ms`);
    }

    if (thresholds.maxP95Time && performanceData.p95 > thresholds.maxP95Time) {
      throw new Error(`P95 time ${performanceData.p95}ms exceeds threshold ${thresholds.maxP95Time}ms`);
    }

    if (thresholds.maxMemoryUsage && stepResult.memoryUsage) {
      const maxMemory = Math.max(...stepResult.memoryUsage.map(m => m.heapUsed));
      if (maxMemory > thresholds.maxMemoryUsage) {
        throw new Error(`Memory usage ${maxMemory}MB exceeds threshold ${thresholds.maxMemoryUsage}MB`);
      }
    }
  }

  /**
   * 检查可靠性阈值
   */
  checkReliabilityThresholds(stepResult, thresholds) {
    const reliabilityData = stepResult.reliabilityData;

    if (thresholds.minSuccessRate && reliabilityData.successRate < thresholds.minSuccessRate) {
      throw new Error(`Success rate ${reliabilityData.successRate}% below threshold ${thresholds.minSuccessRate}%`);
    }

    if (thresholds.maxFailureRate && reliabilityData.failureRate > thresholds.maxFailureRate) {
      throw new Error(`Failure rate ${reliabilityData.failureRate}% exceeds threshold ${thresholds.maxFailureRate}%`);
    }
  }

  /**
   * 计算中位数
   */
  calculateMedian(numbers) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }

  /**
   * 计算百分位数
   */
  calculatePercentile(numbers, percentile) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * 计算最终指标
   */
  calculateFinalMetrics() {
    const summary = this.results.testSuite.summary;
    const detailedResults = this.results.testSuite.detailedResults;

    // 计算成功率
    summary.passedTests = detailedResults.filter(r => r.status === 'passed').length;
    summary.failedTests = detailedResults.filter(r => r.status === 'failed').length;
    summary.skippedTests = detailedResults.filter(r => r.status === 'skipped').length;
    summary.successRate = summary.totalTests > 0 ?
      (summary.passedTests / summary.totalTests * 100).toFixed(2) : 0;

    // 计算平均响应时间
    const responseTimes = detailedResults
      .filter(r => r.duration)
      .map(r => r.duration);

    if (responseTimes.length > 0) {
      summary.averageResponseTime = Math.round(
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      );
    }

    // 收集性能指标
    this.collectPerformanceMetrics();

    // 收集可靠性指标
    this.collectReliabilityMetrics();
  }

  /**
   * 收集性能指标
   */
  collectPerformanceMetrics() {
    const detailedResults = this.results.testSuite.detailedResults;

    // 响应时间分布
    const responseTimes = detailedResults
      .filter(r => r.duration)
      .map(r => r.duration);

    if (responseTimes.length > 0) {
      this.results.testSuite.performanceMetrics.responseTimes = {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        average: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        median: this.calculateMedian(responseTimes),
        p95: this.calculatePercentile(responseTimes, 95),
        p99: this.calculatePercentile(responseTimes, 99),
        distribution: this.createDistribution(responseTimes)
      };
    }

    // 内存使用统计
    const memoryUsages = detailedResults
      .filter(r => r.performanceMetrics && r.performanceMetrics.memoryUsage)
      .flatMap(r => r.performanceMetrics.memoryUsage.map(m => m.heapUsed));

    if (memoryUsages.length > 0) {
      this.results.testSuite.performanceMetrics.memoryUsage = {
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        average: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        peak: Math.max(...memoryUsages)
      };
    }
  }

  /**
   * 收集可靠性指标
   */
  collectReliabilityMetrics() {
    const detailedResults = this.results.testSuite.detailedResults;

    // 错误统计
    const errors = detailedResults.filter(r => r.error);
    this.results.testSuite.reliabilityMetrics.crashCount = errors.length;

    // 错误频率分析
    const errorTypes = {};
    errors.forEach(r => {
      const errorType = r.error.code || r.error.constructor.name;
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });
    this.results.testSuite.reliabilityMetrics.errorFrequency = errorTypes;

    // 一致性评分（基于相同测试的多次运行结果）
    const consistencyScores = this.calculateConsistencyScores();
    this.results.testSuite.reliabilityMetrics.consistencyScores = consistencyScores;
  }

  /**
   * 计算一致性评分
   */
  calculateConsistencyScores() {
    // 按测试名称分组
    const testGroups = {};
    this.results.testSuite.detailedResults.forEach(result => {
      const key = result.name;
      if (!testGroups[key]) {
        testGroups[key] = [];
      }
      testGroups[key].push(result);
    });

    // 计算每组的一致性
    const scores = {};
    Object.entries(testGroups).forEach(([testName, results]) => {
      if (results.length > 1) {
        const successRate = results.filter(r => r.status === 'passed').length / results.length;
        const durationVariance = this.calculateVariance(results.map(r => r.duration || 0));

        scores[testName] = {
          successRate,
          durationVariance,
          consistencyScore: successRate * (1 - Math.min(durationVariance / 10000, 1)) // 简化的一致性评分
        };
      }
    });

    return scores;
  }

  /**
   * 计算方差
   */
  calculateVariance(numbers) {
    if (numbers.length === 0) return 0;

    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * 创建分布数据
   */
  createDistribution(numbers) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const bins = 10;
    const binSize = (max - min) / bins;
    const distribution = new Array(bins).fill(0);

    numbers.forEach(num => {
      const binIndex = Math.min(Math.floor((num - min) / binSize), bins - 1);
      distribution[binIndex]++;
    });

    return {
      bins: bins,
      binSize: binSize,
      min: min,
      max: max,
      distribution: distribution.map((count, index) => ({
        range: `${Math.round(min + index * binSize)}-${Math.round(min + (index + 1) * binSize)}`,
        count: count
      }))
    };
  }

  /**
   * 统计所有测试数量
   */
  countAllTests() {
    return Object.values(this.testCategories)
      .reduce((total, category) => total + category.tests.length, 0);
  }

  /**
   * 保存测试结果
   */
  async saveResults() {
    try {
      await fs.mkdir(this.options.outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const resultFile = path.join(this.options.outputDir, `performance-test-results-${timestamp}.json`);
      const logFile = path.join(this.options.outputDir, `performance-test-logs-${timestamp}.json`);

      // 保存详细结果
      await fs.writeFile(resultFile, JSON.stringify(this.results, null, 2));

      // 保存日志
      await fs.writeFile(logFile, JSON.stringify(this.logger.getLogs(), null, 2));

      // 生成HTML报告
      await this.generateHtmlReport(timestamp);

      this.logger.info(`Results saved to ${resultFile}`);

    } catch (error) {
      this.logger.error('Failed to save results', error);
    }
  }

  /**
   * 生成HTML报告
   */
  async generateHtmlReport(timestamp) {
    const htmlTemplate = this.createHtmlReportTemplate();
    const htmlContent = htmlTemplate
      .replace('{{TITLE}}', 'AdvancedClickNode Performance Test Report')
      .replace('{{TIMESTAMP}}', new Date().toLocaleString())
      .replace('{{DATA}}', JSON.stringify(this.results, null, 2));

    const reportFile = path.join(this.options.outputDir, `performance-test-report-${timestamp}.html`);
    await fs.writeFile(reportFile, htmlContent);

    this.logger.info(`HTML report generated: ${reportFile}`);
  }

  /**
   * 创建HTML报告模板
   */
  createHtmlReportTemplate() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .test-item { background: #f8f9fa; margin: 10px 0; padding: 15px; border-radius: 8px; border-left: 4px solid #ddd; }
        .test-item.passed { border-left-color: #28a745; }
        .test-item.failed { border-left-color: #dc3545; }
        .test-item.skipped { border-left-color: #ffc107; }
        .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
        .chart-container { background: #f8f9fa; padding: 20px; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; }
        .status-passed { color: #28a745; }
        .status-failed { color: #dc3545; }
        .status-skipped { color: #ffc107; }
        .hidden { display: none; }
        .collapsible { cursor: pointer; user-select: none; }
        .collapsible:hover { background: #e9ecef; }
        .content { padding: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{TITLE}}</h1>
            <p>生成时间: {{TIMESTAMP}}</p>
        </div>

        <div class="section">
            <h2>测试概览</h2>
            <div class="summary" id="summary">
                <!-- 摘要数据将通过JavaScript动态填充 -->
            </div>
        </div>

        <div class="section">
            <h2>性能图表</h2>
            <div class="charts">
                <div class="chart-container">
                    <canvas id="responseTimeChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="successRateChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="memoryUsageChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="testDistributionChart"></canvas>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>详细测试结果</h2>
            <div id="testResults">
                <!-- 测试结果将通过JavaScript动态填充 -->
            </div>
        </div>
    </div>

    <script>
        const data = {{DATA}};

        // 填充摘要数据
        function populateSummary() {
            const summary = data.testSuite.summary;
            const summaryDiv = document.getElementById('summary');

            summaryDiv.innerHTML = \`
                <div class="metric">
                    <div class="metric-value">\${summary.totalTests}</div>
                    <div class="metric-label">总测试数</div>
                </div>
                <div class="metric">
                    <div class="metric-value status-passed">\${summary.passedTests}</div>
                    <div class="metric-label">通过测试</div>
                </div>
                <div class="metric">
                    <div class="metric-value status-failed">\${summary.failedTests}</div>
                    <div class="metric-label">失败测试</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${summary.successRate}%</div>
                    <div class="metric-label">成功率</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${summary.averageResponseTime}ms</div>
                    <div class="metric-label">平均响应时间</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${(summary.totalDuration / 1000).toFixed(1)}s</div>
                    <div class="metric-label">总执行时间</div>
                </div>
            \`;
        }

        // 填充测试结果
        function populateTestResults() {
            const resultsDiv = document.getElementById('testResults');
            const categories = data.testSuite.categories;

            let html = '';
            for (const [categoryKey, category] of Object.entries(categories)) {
                html += \`
                    <div class="collapsible" onclick="toggleContent('\${categoryKey}')">
                        <h3>\${category.name} (\${category.tests ? category.tests.length : 0} tests)</h3>
                    </div>
                    <div id="\${categoryKey}" class="content hidden">
                \`;

                if (category.tests) {
                    category.tests.forEach(test => {
                        const statusClass = test.status === 'passed' ? 'passed' :
                                          test.status === 'failed' ? 'failed' : 'skipped';
                        html += \`
                            <div class="test-item \${statusClass}">
                                <h4>\${test.name}</h4>
                                <p><strong>状态:</strong> <span class="status-\${statusClass}">\${test.status}</span></p>
                                <p><strong>描述:</strong> \${test.description || 'N/A'}</p>
                                <p><strong>执行时间:</strong> \${test.duration || 0}ms</p>
                                \${test.error ? \`<p><strong>错误:</strong> \${test.error.message}</p>\` : ''}
                                \${test.steps ? \`
                                    <details>
                                        <summary>详细步骤</summary>
                                        \${test.steps.map((step, index) => \`
                                            <div style="margin-left: 20px; margin-top: 10px;">
                                                <strong>步骤 \${index + 1}:</strong> \${step.description}<br>
                                                <strong>状态:</strong> \${step.status}
                                                \${step.duration ? \`<br><strong>耗时:</strong> \${step.duration}ms\` : ''}
                                                \${step.error ? \`<br><strong>错误:</strong> \${step.error}\` : ''}
                                            </div>
                                        \`).join('')}
                                    </details>
                                \` : ''}
                            </div>
                        \`;
                    });
                }

                html += '</div>';
            }

            resultsDiv.innerHTML = html;
        }

        // 切换内容显示
        function toggleContent(id) {
            const content = document.getElementById(id);
            content.classList.toggle('hidden');
        }

        // 创建图表
        function createCharts() {
            const performanceMetrics = data.testSuite.performanceMetrics;

            // 响应时间分布图
            if (performanceMetrics.responseTimes) {
                new Chart(document.getElementById('responseTimeChart'), {
                    type: 'bar',
                    data: {
                        labels: ['最小值', '平均值', '中位数', 'P95', 'P99', '最大值'],
                        datasets: [{
                            label: '响应时间 (ms)',
                            data: [
                                performanceMetrics.responseTimes.min,
                                performanceMetrics.responseTimes.average,
                                performanceMetrics.responseTimes.median,
                                performanceMetrics.responseTimes.p95,
                                performanceMetrics.responseTimes.p99,
                                performanceMetrics.responseTimes.max
                            ],
                            backgroundColor: '#007bff'
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: '响应时间分布'
                            }
                        }
                    }
                });
            }

            // 成功率图
            const summary = data.testSuite.summary;
            new Chart(document.getElementById('successRateChart'), {
                type: 'doughnut',
                data: {
                    labels: ['通过', '失败', '跳过'],
                    datasets: [{
                        data: [summary.passedTests, summary.failedTests, summary.skippedTests],
                        backgroundColor: ['#28a745', '#dc3545', '#ffc107']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: '测试结果分布'
                        }
                    }
                }
            });

            // 测试类别分布图
            const categories = Object.keys(data.testSuite.categories);
            const categoryData = categories.map(key => data.testSuite.categories[key].tests ? data.testSuite.categories[key].tests.length : 0);

            new Chart(document.getElementById('testDistributionChart'), {
                type: 'pie',
                data: {
                    labels: categories.map(key => data.testSuite.categories[key].name),
                    datasets: [{
                        data: categoryData,
                        backgroundColor: ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: '测试类别分布'
                        }
                    }
                }
            });
        }

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', function() {
            populateSummary();
            populateTestResults();
            createCharts();
        });
    </script>
</body>
</html>
    `;
  }

  /**
   * 获取测试结果摘要
   */
  getResultsSummary() {
    return this.results.testSuite.summary;
  }

  /**
   * 获取详细的性能指标
   */
  getPerformanceMetrics() {
    return this.results.testSuite.performanceMetrics;
  }

  /**
   * 获取可靠性指标
   */
  getReliabilityMetrics() {
    return this.results.testSuite.reliabilityMetrics;
  }

  /**
   * 导出结果为JSON
   */
  exportResults() {
    return JSON.stringify(this.results, null, 2);
  }
}

module.exports = PerformanceTestFramework;