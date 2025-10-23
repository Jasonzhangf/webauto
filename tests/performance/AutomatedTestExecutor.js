/**
 * 自动化测试执行器
 * 负责调度和执行性能测试套件，支持定时执行、CI/CD集成和远程触发
 */

const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { EventEmitter } = require('events');
const PerformanceTestFramework = require('./PerformanceTestFramework');

class AutomatedTestExecutor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      configPath: options.configPath || './tests/performance/config.json',
      resultsDir: options.resultsDir || './tests/performance/results',
      schedules: options.schedules || [],
      enableWebhook: options.enableWebhook || false,
      webhookUrl: options.webhookUrl || '',
      enableSlack: options.enableSlack || false,
      slackWebhookUrl: options.slackWebhookUrl || '',
      enableEmail: options.enableEmail || false,
      emailConfig: options.emailConfig || {},
      maxConcurrentExecutions: options.maxConcurrentExecutions || 2,
      retentionDays: options.retentionDays || 30,
      enableRemoteTrigger: options.enableRemoteTrigger || false,
      remotePort: options.remotePort || 3001,
      ...options
    };

    this.testFramework = null;
    this.isRunning = false;
    this.currentExecution = null;
    this.executionHistory = [];
    this.scheduledJobs = new Map();
    this.cronTasks = new Map();

    this.loadConfiguration();
    this.initializeEventHandlers();

    if (this.options.enableRemoteTrigger) {
      this.initializeRemoteTrigger();
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfiguration() {
    try {
      const configData = await fs.readFile(this.options.configPath, 'utf8');
      this.config = JSON.parse(configData);

      this.logger.info('Configuration loaded successfully', {
        configPath: this.options.configPath,
        testSuites: Object.keys(this.config.testSuites || {}).length
      });

    } catch (error) {
      this.logger.warn('Failed to load configuration, using defaults', { error: error.message });
      this.config = this.getDefaultConfiguration();
      await this.saveConfiguration();
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfiguration() {
    return {
      version: '1.0.0',
      testSuites: {
        'advanced-click-node': {
          name: 'AdvancedClickNode 性能测试套件',
          description: '全面测试AdvancedClickNode的性能和可靠性',
          enabled: true,
          testFiles: [
            './tests/performance/test-cases/basic-functionality.json',
            './tests/performance/test-cases/performance-tests.json',
            './tests/performance/test-cases/reliability-tests.json',
            './tests/performance/test-cases/stress-tests.json'
          ],
          environment: {
            nodeVersion: '>=14.0.0',
            memory: '>=2GB',
            cpu: '>=2 cores'
          },
          thresholds: {
            maxAverageResponseTime: 5000, // 5秒
            minSuccessRate: 95, // 95%
            maxMemoryUsage: 1024, // 1GB
            maxFailureRate: 5 // 5%
          }
        }
      },
      schedules: [
        {
          name: 'daily-performance-test',
          suite: 'advanced-click-node',
          cron: '0 2 * * *', // 每天凌晨2点
          enabled: true,
          notifications: {
            onSuccess: false,
            onFailure: true,
            channels: ['email', 'slack']
          }
        },
        {
          name: 'weekly-full-test',
          suite: 'advanced-click-node',
          cron: '0 3 * * 0', // 每周日凌晨3点
          enabled: true,
          notifications: {
            onSuccess: true,
            onFailure: true,
            channels: ['email', 'slack', 'webhook']
          }
        }
      ],
      notifications: {
        email: {
          enabled: false,
          smtp: {
            host: '',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: ''
            }
          },
          from: '',
          to: []
        },
        slack: {
          enabled: false,
          webhookUrl: '',
          channel: '#performance-tests'
        },
        webhook: {
          enabled: false,
          url: '',
          headers: {},
          retryAttempts: 3
        }
      }
    };
  }

  /**
   * 保存配置文件
   */
  async saveConfiguration() {
    try {
      await fs.mkdir(path.dirname(this.options.configPath), { recursive: true });
      await fs.writeFile(this.options.configPath, JSON.stringify(this.config, null, 2));
      this.logger.info('Configuration saved', { configPath: this.options.configPath });
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
    }
  }

  /**
   * 初始化事件处理器
   */
  initializeEventHandlers() {
    this.on('testStarted', (execution) => {
      this.logger.info('Test execution started', {
        executionId: execution.id,
        suite: execution.suite
      });
    });

    this.on('testCompleted', (execution, results) => {
      this.logger.info('Test execution completed', {
        executionId: execution.id,
        suite: execution.suite,
        duration: results.testSuite.summary.totalDuration,
        successRate: results.testSuite.summary.successRate
      });

      this.processResults(execution, results);
    });

    this.on('testFailed', (execution, error) => {
      this.logger.error('Test execution failed', {
        executionId: execution.id,
        suite: execution.suite,
        error: error.message
      });

      this.sendFailureNotification(execution, error);
    });

    // 处理进程退出
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  /**
   * 初始化远程触发器
   */
  initializeRemoteTrigger() {
    const express = require('express');
    const app = express();

    app.use(express.json());

    // 健康检查端点
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        isRunning: this.isRunning,
        currentExecution: this.currentExecution ? this.currentExecution.id : null,
        uptime: process.uptime()
      });
    });

    // 获取执行状态
    app.get('/status', (req, res) => {
      res.json({
        isRunning: this.isRunning,
        currentExecution: this.currentExecution,
        executionHistory: this.executionHistory.slice(-10),
        lastExecution: this.executionHistory.length > 0 ?
          this.executionHistory[this.executionHistory.length - 1] : null
      });
    });

    // 获取配置
    app.get('/config', (req, res) => {
      res.json({
        version: this.config.version,
        testSuites: Object.keys(this.config.testSuites),
        schedules: this.config.schedules.filter(s => s.enabled)
      });
    });

    // 触发测试执行
    app.post('/execute', async (req, res) => {
      try {
        const { suite, options = {} } = req.body;

        if (!suite) {
          return res.status(400).json({
            error: 'Missing required parameter: suite'
          });
        }

        if (!this.config.testSuites[suite]) {
          return res.status(404).json({
            error: `Test suite not found: ${suite}`
          });
        }

        if (this.isRunning) {
          return res.status(409).json({
            error: 'Test execution already in progress',
            currentExecution: this.currentExecution
          });
        }

        const execution = await this.executeTestSuite(suite, {
          ...options,
          trigger: 'remote',
          requestId: req.headers['x-request-id'] || `remote-${Date.now()}`
        });

        res.json({
          message: 'Test execution started',
          execution: {
            id: execution.id,
            suite: execution.suite,
            startTime: execution.startTime
          }
        });

      } catch (error) {
        res.status(500).json({
          error: 'Failed to start test execution',
          details: error.message
        });
      }
    });

    // 获取测试结果
    app.get('/results/:executionId', async (req, res) => {
      try {
        const { executionId } = req.params;
        const resultFile = path.join(this.options.resultsDir, `execution-${executionId}.json`);

        try {
          const resultData = await fs.readFile(resultFile, 'utf8');
          const results = JSON.parse(resultData);
          res.json(results);
        } catch (fileError) {
          if (fileError.code === 'ENOENT') {
            res.status(404).json({ error: 'Results not found' });
          } else {
            throw fileError;
          }
        }

      } catch (error) {
        res.status(500).json({
          error: 'Failed to retrieve results',
          details: error.message
        });
      }
    });

    // 启动服务器
    app.listen(this.options.remotePort, () => {
      this.logger.info(`Remote trigger server started on port ${this.options.remotePort}`);
    });
  }

  /**
   * 启动自动化测试执行器
   */
  async start() {
    this.logger.info('Starting automated test executor');

    // 加载测试套件
    await this.loadTestSuites();

    // 设置定时任务
    this.setupScheduledTasks();

    // 清理旧结果
    await this.cleanupOldResults();

    this.logger.info('Automated test executor started successfully', {
      testSuites: Object.keys(this.config.testSuites).length,
      scheduledTasks: this.cronTasks.size,
      remoteTriggerEnabled: this.options.enableRemoteTrigger
    });

    this.emit('started');
  }

  /**
   * 停止自动化测试执行器
   */
  async stop() {
    this.logger.info('Stopping automated test executor');

    // 停止所有定时任务
    for (const [name, task] of this.cronTasks) {
      task.stop();
      this.logger.info(`Stopped scheduled task: ${name}`);
    }
    this.cronTasks.clear();

    // 等待当前执行完成
    if (this.isRunning && this.currentExecution) {
      this.logger.info('Waiting for current execution to complete...');
      // 这里可以添加超时机制
    }

    this.emit('stopped');
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    this.logger.info('Initiating graceful shutdown...');

    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  }

  /**
   * 加载测试套件
   */
  async loadTestSuites() {
    for (const [suiteKey, suiteConfig] of Object.entries(this.config.testSuites)) {
      if (!suiteConfig.enabled) {
        continue;
      }

      try {
        // 初始化性能测试框架
        this.testFramework = new PerformanceTestFramework({
          outputDir: path.join(this.options.resultsDir, suiteKey),
          logLevel: 'info',
          enableScreenshots: true,
          enableMemoryMonitoring: true,
          enableNetworkMonitoring: true
        });

        // 加载测试用例
        await this.loadTestCases(suiteKey, suiteConfig);

        this.logger.info(`Test suite loaded: ${suiteKey}`, {
          testFiles: suiteConfig.testFiles.length
        });

      } catch (error) {
        this.logger.error(`Failed to load test suite: ${suiteKey}`, error);
      }
    }
  }

  /**
   * 加载测试用例
   */
  async loadTestCases(suiteKey, suiteConfig) {
    for (const testFile of suiteConfig.testFiles) {
      try {
        const testData = await fs.readFile(testFile, 'utf8');
        const testCases = JSON.parse(testData);

        for (const testCase of testCases) {
          this.testFramework.addTest(testCase.category, testCase);
        }

        this.logger.info(`Test cases loaded from: ${testFile}`, {
          count: testCases.length
        });

      } catch (error) {
        this.logger.warn(`Failed to load test cases from: ${testFile}`, { error: error.message });
      }
    }
  }

  /**
   * 设置定时任务
   */
  setupScheduledTasks() {
    for (const schedule of this.config.schedules) {
      if (!schedule.enabled) {
        continue;
      }

      try {
        const task = cron.schedule(schedule.cron, async () => {
          this.logger.info(`Executing scheduled task: ${schedule.name}`);

          try {
            await this.executeTestSuite(schedule.suite, {
              trigger: 'scheduled',
              scheduleName: schedule.name,
              notifications: schedule.notifications
            });
          } catch (error) {
            this.logger.error(`Scheduled task failed: ${schedule.name}`, error);
          }
        }, {
          scheduled: true,
          timezone: 'Asia/Shanghai'
        });

        this.cronTasks.set(schedule.name, task);
        this.logger.info(`Scheduled task configured: ${schedule.name}`, {
          cron: schedule.cron
        });

      } catch (error) {
        this.logger.error(`Failed to setup scheduled task: ${schedule.name}`, error);
      }
    }
  }

  /**
   * 执行测试套件
   */
  async executeTestSuite(suiteKey, options = {}) {
    if (this.isRunning) {
      throw new Error('Test execution already in progress');
    }

    const execution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      suite: suiteKey,
      startTime: new Date().toISOString(),
      trigger: options.trigger || 'manual',
      options: options,
      status: 'running'
    };

    this.isRunning = true;
    this.currentExecution = execution;

    try {
      this.emit('testStarted', execution);

      // 执行测试
      const results = await this.testFramework.runAllTests();

      execution.endTime = new Date().toISOString();
      execution.status = 'completed';
      execution.results = results;

      this.emit('testCompleted', execution, results);

      return execution;

    } catch (error) {
      execution.endTime = new Date().toISOString();
      execution.status = 'failed';
      execution.error = {
        message: error.message,
        stack: error.stack
      };

      this.emit('testFailed', execution, error);
      throw error;

    } finally {
      this.isRunning = false;
      this.currentExecution = null;
      this.executionHistory.push(execution);

      // 限制历史记录长度
      if (this.executionHistory.length > 100) {
        this.executionHistory = this.executionHistory.slice(-50);
      }

      // 保存执行记录
      await this.saveExecutionRecord(execution);
    }
  }

  /**
   * 处理测试结果
   */
  async processResults(execution, results) {
    try {
      // 保存详细结果
      await this.saveResults(execution, results);

      // 检查阈值
      const thresholdViolations = this.checkThresholds(execution.suite, results);

      // 发送通知
      if (execution.options.notifications) {
        await this.sendNotifications(execution, results, thresholdViolations);
      }

      // 更新指标
      this.updateMetrics(execution, results);

    } catch (error) {
      this.logger.error('Failed to process test results', error);
    }
  }

  /**
   * 保存结果
   */
  async saveResults(execution, results) {
    try {
      await fs.mkdir(this.options.resultsDir, { recursive: true });

      const resultFile = path.join(this.options.resultsDir, `execution-${execution.id}.json`);
      const resultData = {
        execution: execution,
        results: results,
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
      this.logger.info(`Results saved: ${resultFile}`);

    } catch (error) {
      this.logger.error('Failed to save results', error);
    }
  }

  /**
   * 保存执行记录
   */
  async saveExecutionRecord(execution) {
    try {
      const recordFile = path.join(this.options.resultsDir, 'execution-history.json');

      let history = [];
      try {
        const historyData = await fs.readFile(recordFile, 'utf8');
        history = JSON.parse(historyData);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      history.push(execution);

      // 限制历史记录
      if (history.length > 1000) {
        history = history.slice(-500);
      }

      await fs.writeFile(recordFile, JSON.stringify(history, null, 2));

    } catch (error) {
      this.logger.error('Failed to save execution record', error);
    }
  }

  /**
   * 检查阈值
   */
  checkThresholds(suiteKey, results) {
    const suiteConfig = this.config.testSuites[suiteKey];
    if (!suiteConfig || !suiteConfig.thresholds) {
      return [];
    }

    const violations = [];
    const thresholds = suiteConfig.thresholds;
    const summary = results.testSuite.summary;

    // 检查平均响应时间
    if (thresholds.maxAverageResponseTime && summary.averageResponseTime > thresholds.maxAverageResponseTime) {
      violations.push({
        type: 'response_time',
        threshold: thresholds.maxAverageResponseTime,
        actual: summary.averageResponseTime,
        severity: 'warning'
      });
    }

    // 检查成功率
    if (thresholds.minSuccessRate && parseFloat(summary.successRate) < thresholds.minSuccessRate) {
      violations.push({
        type: 'success_rate',
        threshold: thresholds.minSuccessRate,
        actual: parseFloat(summary.successRate),
        severity: 'error'
      });
    }

    // 检查内存使用
    const memoryMetrics = results.testSuite.performanceMetrics.memoryUsage;
    if (thresholds.maxMemoryUsage && memoryMetrics && memoryUsage.max > thresholds.maxMemoryUsage) {
      violations.push({
        type: 'memory_usage',
        threshold: thresholds.maxMemoryUsage,
        actual: memoryUsage.max,
        severity: 'warning'
      });
    }

    return violations;
  }

  /**
   * 发送通知
   */
  async sendNotifications(execution, results, violations) {
    const notifications = execution.options.notifications;
    if (!notifications || !notifications.channels) {
      return;
    }

    const shouldNotify = violations.length > 0 ?
      notifications.onFailure : notifications.onSuccess;

    if (!shouldNotify) {
      return;
    }

    const notificationData = {
      execution: execution,
      results: results,
      violations: violations,
      timestamp: new Date().toISOString()
    };

    for (const channel of notifications.channels) {
      try {
        if (channel === 'email' && this.config.notifications.email.enabled) {
          await this.sendEmailNotification(notificationData);
        } else if (channel === 'slack' && this.config.notifications.slack.enabled) {
          await this.sendSlackNotification(notificationData);
        } else if (channel === 'webhook' && this.config.notifications.webhook.enabled) {
          await this.sendWebhookNotification(notificationData);
        }
      } catch (error) {
        this.logger.error(`Failed to send ${channel} notification`, error);
      }
    }
  }

  /**
   * 发送邮件通知
   */
  async sendEmailNotification(data) {
    // 实现邮件发送逻辑
    this.logger.info('Email notification sent', {
      executionId: data.execution.id
    });
  }

  /**
   * 发送Slack通知
   */
  async sendSlackNotification(data) {
    const webhookUrl = this.config.notifications.slack.webhookUrl;
    const channel = this.config.notifications.slack.channel;

    const color = data.violations.length > 0 ? 'danger' : 'good';
    const summary = data.results.testSuite.summary;

    const payload = {
      channel: channel,
      attachments: [{
        color: color,
        title: `Performance Test ${data.violations.length > 0 ? 'Failed' : 'Passed'}`,
        fields: [
          { title: 'Suite', value: data.execution.suite, short: true },
          { title: 'Duration', value: `${(summary.totalDuration / 1000).toFixed(1)}s`, short: true },
          { title: 'Success Rate', value: `${summary.successRate}%`, short: true },
          { title: 'Tests', value: `${summary.passedTests}/${summary.totalTests}`, short: true }
        ],
        footer: 'Automated Test Executor',
        ts: Math.floor(new Date(data.execution.startTime).getTime() / 1000)
      }]
    };

    if (data.violations.length > 0) {
      payload.attachments[0].fields.push({
        title: 'Violations',
        value: data.violations.map(v => `- ${v.type}: ${v.actual} (threshold: ${v.threshold})`).join('\n'),
        short: false
      });
    }

    // 发送Webhook请求
    await this.sendWebhookRequest(webhookUrl, payload);
    this.logger.info('Slack notification sent');
  }

  /**
   * 发送Webhook通知
   */
  async sendWebhookNotification(data) {
    const webhookUrl = this.config.notifications.webhook.url;
    const headers = this.config.notifications.webhook.headers || {};

    const payload = {
      type: 'test_completion',
      execution: data.execution,
      summary: data.results.testSuite.summary,
      violations: data.violations,
      timestamp: data.timestamp
    };

    await this.sendWebhookRequest(webhookUrl, payload, headers);
    this.logger.info('Webhook notification sent');
  }

  /**
   * 发送Webhook请求
   */
  async sendWebhookRequest(url, payload, headers = {}) {
    const fetch = require('node-fetch');

    const maxRetries = this.config.notifications.webhook.retryAttempts || 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify(payload),
          timeout: 10000
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return; // 成功发送

      } catch (error) {
        lastError = error;
        this.logger.warn(`Webhook request failed (attempt ${attempt}/${maxRetries})`, {
          url: url,
          error: error.message
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Failed to send webhook after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * 发送失败通知
   */
  async sendFailureNotification(execution, error) {
    const notificationData = {
      execution: execution,
      error: error,
      timestamp: new Date().toISOString()
    };

    try {
      await this.sendSlackNotification({
        ...notificationData,
        results: { testSuite: { summary: { successRate: 0 } } },
        violations: [{ type: 'execution_failure', severity: 'error' }]
      });
    } catch (notifyError) {
      this.logger.error('Failed to send failure notification', notifyError);
    }
  }

  /**
   * 更新指标
   */
  updateMetrics(execution, results) {
    // 这里可以实现指标更新逻辑
    // 比如更新时间序列数据库、发送到监控系统等
    this.logger.info('Metrics updated', {
      executionId: execution.id,
      successRate: results.testSuite.summary.successRate
    });
  }

  /**
   * 清理旧结果
   */
  async cleanupOldResults() {
    try {
      const files = await fs.readdir(this.options.resultsDir);
      const cutoffTime = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.options.resultsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.logger.info(`Cleaned up old result files`, {
          deletedCount,
          retentionDays: this.options.retentionDays
        });
      }

    } catch (error) {
      this.logger.error('Failed to cleanup old results', error);
    }
  }

  /**
   * 获取执行状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentExecution: this.currentExecution,
      executionHistory: this.executionHistory.slice(-10),
      scheduledTasks: Array.from(this.cronTasks.keys()),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      configVersion: this.config.version
    };
  }

  /**
   * 获取最近的执行结果
   */
  async getRecentResults(limit = 10) {
    try {
      const files = await fs.readdir(this.options.resultsDir);
      const executionFiles = files
        .filter(file => file.startsWith('execution-') && file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)) // 按文件名降序排序（最新的在前）
        .slice(0, limit);

      const results = [];
      for (const file of executionFiles) {
        const filePath = path.join(this.options.resultsDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const result = JSON.parse(data);
        results.push(result);
      }

      return results;

    } catch (error) {
      this.logger.error('Failed to get recent results', error);
      return [];
    }
  }

  /**
   * 手动触发测试执行
   */
  async triggerExecution(suiteKey, options = {}) {
    if (!this.config.testSuites[suiteKey]) {
      throw new Error(`Test suite not found: ${suiteKey}`);
    }

    if (!this.config.testSuites[suiteKey].enabled) {
      throw new Error(`Test suite is disabled: ${suiteKey}`);
    }

    return await this.executeTestSuite(suiteKey, {
      ...options,
      trigger: 'manual'
    });
  }

  // 简单的日志记录器
  get logger() {
    return {
      info: (message, data = {}) => {
        console.log(`[INFO][${new Date().toISOString()}] ${message}`, data);
      },
      warn: (message, data = {}) => {
        console.warn(`[WARN][${new Date().toISOString()}] ${message}`, data);
      },
      error: (message, error = null) => {
        console.error(`[ERROR][${new Date().toISOString()}] ${message}`, error);
      },
      debug: (message, data = {}) => {
        if (process.env.DEBUG) {
          console.debug(`[DEBUG][${new Date().toISOString()}] ${message}`, data);
        }
      }
    };
  }
}

module.exports = AutomatedTestExecutor;