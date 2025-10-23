# AdvancedClickNode 性能和可靠性测试框架

## 📋 概述

这是一个专门为 AdvancedClickNode 设计的全面性能和可靠性测试框架。它提供了完整的测试基础设施，包括性能监控、可靠性验证、自动化执行和详细报告生成。

## 🎯 主要特性

### 🚀 核心功能
- **全面的测试覆盖** - 支持基础功能、性能、可靠性、压力和兼容性测试
- **实时性能监控** - 监控内存使用、响应时间、成功率等关键指标
- **自动化执行** - 支持定时任务、远程触发和CI/CD集成
- **丰富的报告** - 生成HTML可视化报告、JSON详细数据和日志文件
- **多通知渠道** - 支持邮件、Slack、Webhook等多种通知方式

### 📊 性能测试能力
- 响应时间分析（平均值、P95、P99等）
- 内存使用监控和峰值检测
- 吞吐量测试和并发性能评估
- 性能阈值验证和违规告警

### 🔒 可靠性测试能力
- 多次迭代的稳定性测试
- 错误类型分布和频率分析
- 一致性评分和变化检测
- 崩溃和超时统计

## 🛠️ 安装和配置

### 依赖项

```bash
# 基础依赖
npm install

# 可选依赖（用于自动化执行器）
npm install node-cron node-fetch express
```

### 目录结构

```
tests/performance/
├── PerformanceTestFramework.js     # 核心测试框架
├── AutomatedTestExecutor.js        # 自动化执行器
├── demo.js                         # 演示脚本
├── README.md                       # 说明文档
├── config.json                     # 配置文件（自动生成）
├── test-cases/                     # 测试用例目录
│   ├── basic-functionality.json
│   ├── performance-tests.json
│   ├── reliability-tests.json
│   └── stress-tests.json
├── results/                        # 测试结果目录（自动创建）
│   ├── execution-*.json            # 详细执行结果
│   ├── performance-test-*.html     # HTML可视化报告
│   └── performance-test-*.json     # JSON数据文件
└── logs/                           # 日志文件（自动创建）
```

## 🚀 快速开始

### 1. 基础测试框架演示

```bash
# 运行基础演示
node demo.js basic

# 运行完整演示
node demo.js full
```

### 2. 直接使用测试框架

```javascript
const PerformanceTestFramework = require('./PerformanceTestFramework');

// 创建测试框架实例
const testFramework = new PerformanceTestFramework({
  outputDir: './test-results',
  logLevel: 'info',
  enableScreenshots: true,
  enableMemoryMonitoring: true
});

// 添加测试用例
testFramework.addTest('basic-functionality', {
  id: 'my-test',
  name: '我的测试',
  description: '测试描述',
  // ... 测试配置
});

// 运行测试
const results = await testFramework.runAllTests();
console.log('测试结果:', results.testSuite.summary);
```

### 3. 使用自动化执行器

```javascript
const AutomatedTestExecutor = require('./AutomatedTestExecutor');

// 创建执行器实例
const executor = new AutomatedTestExecutor({
  enableRemoteTrigger: true,
  remotePort: 3001
});

// 启动执行器
await executor.start();

// 手动触发测试
const execution = await executor.triggerExecution('advanced-click-node');
console.log('测试已启动:', execution.id);

// 停止执行器
await executor.stop();
```

## 📝 测试用例配置

### 基础功能测试

```json
{
  "id": "basic-click-test",
  "name": "基础点击测试",
  "description": "测试基本的点击功能",
  "category": "basic-functionality",
  "priority": "high",
  "enabled": true,
  "timeout": 60000,
  "retries": 2,
  "preconditions": [
    {
      "type": "network_check",
      "description": "检查网络连接"
    }
  ],
  "steps": [
    {
      "type": "click_test",
      "description": "执行点击测试",
      "workflowConfig": {
        // 工作流配置
      }
    }
  ],
  "expectedResults": [
    {
      "type": "click_success",
      "description": "点击成功",
      "value": true
    }
  ],
  "performanceThresholds": {
    "maxAverageTime": 30000,
    "maxP95Time": 45000
  },
  "reliabilityThresholds": {
    "minSuccessRate": 95,
    "maxFailureRate": 5
  },
  "tags": ["basic", "click", "smoke"]
}
```

### 性能测试

```json
{
  "id": "performance-test",
  "name": "性能测试",
  "description": "测试性能指标",
  "category": "performance-tests",
  "steps": [
    {
      "type": "performance_test",
      "description": "执行性能测试",
      "iterations": 10,
      "workflowConfig": {
        // 工作流配置
      }
    }
  ],
  "performanceThresholds": {
    "maxAverageTime": 5000,
    "maxP95Time": 8000,
    "maxMemoryUsage": 512
  }
}
```

### 可靠性测试

```json
{
  "id": "reliability-test",
  "name": "可靠性测试",
  "description": "测试系统稳定性",
  "category": "reliability-tests",
  "steps": [
    {
      "type": "reliability_test",
      "description": "执行可靠性测试",
      "iterations": 100,
      "workflowConfig": {
        // 工作流配置
      }
    }
  ],
  "reliabilityThresholds": {
    "minSuccessRate": 99,
    "maxFailureRate": 1
  }
}
```

## ⚙️ 配置选项

### PerformanceTestFramework 配置

```javascript
const testFramework = new PerformanceTestFramework({
  outputDir: './results',              // 结果输出目录
  logLevel: 'info',                   // 日志级别 (debug, info, warn, error)
  maxConcurrentTests: 3,              // 最大并发测试数
  timeoutMs: 300000,                  // 默认超时时间 (5分钟)
  retries: 2,                         // 默认重试次数
  enableScreenshots: true,            // 启用截图
  enableMemoryMonitoring: true,       // 启用内存监控
  enableNetworkMonitoring: true       // 启用网络监控
});
```

### AutomatedTestExecutor 配置

```javascript
const executor = new AutomatedTestExecutor({
  configPath: './config.json',        // 配置文件路径
  resultsDir: './results',            // 结果目录
  schedules: [],                      // 定时任务配置
  enableWebhook: false,               // 启用Webhook通知
  webhookUrl: '',                     // Webhook URL
  enableSlack: false,                 // 启用Slack通知
  slackWebhookUrl: '',                // Slack Webhook URL
  enableEmail: false,                 // 启用邮件通知
  maxConcurrentExecutions: 2,         // 最大并发执行数
  retentionDays: 30,                  // 结果保留天数
  enableRemoteTrigger: false,         // 启用远程触发
  remotePort: 3001                    // 远程触发端口
});
```

## 📊 报告和分析

### HTML 报告

测试完成后会自动生成包含以下内容的HTML报告：
- **测试概览** - 总体统计和关键指标
- **性能图表** - 响应时间分布、成功率图表等
- **详细结果** - 每个测试的执行详情
- **错误分析** - 错误类型和频率统计

### JSON 数据

完整的测试数据以JSON格式保存，包含：
- 执行环境信息
- 详细测试结果
- 性能指标数据
- 可靠性统计数据
- 完整的日志记录

### 关键指标

#### 性能指标
- **平均响应时间** - 所有操作的平均执行时间
- **P95/P99响应时间** - 95%和99%的操作在多少时间内完成
- **内存使用** - 峰值内存使用量和平均值
- **吞吐量** - 每秒完成的操作数量

#### 可靠性指标
- **成功率** - 成功操作的百分比
- **错误频率** - 各种错误类型的发生次数
- **一致性评分** - 多次执行结果的稳定性
- **崩溃统计** - 系统崩溃和超时次数

## 🔧 高级用法

### 1. 自定义测试步骤类型

```javascript
// 在 PerformanceTestFramework 中添加自定义步骤类型
async executeCustomStep(step, stepResult, testResult) {
  // 实现自定义测试逻辑
  if (step.type === 'my_custom_test') {
    // 执行自定义测试
    stepResult.result = await myCustomTestLogic(step.config);
    stepResult.status = 'passed';
  }
}
```

### 2. 自定义通知渠道

```javascript
// 在 AutomatedTestExecutor 中添加自定义通知
async sendCustomNotification(data) {
  // 实现自定义通知逻辑
  if (this.options.customNotification.enabled) {
    await this.sendToCustomChannel(data);
  }
}
```

### 3. 集成到 CI/CD

```yaml
# GitHub Actions 示例
- name: Run Performance Tests
  run: |
    npm install
    node tests/performance/demo.js basic
- name: Upload Test Results
  uses: actions/upload-artifact@v2
  with:
    name: performance-test-results
    path: tests/performance/results/
```

### 4. 远程 API 触发

```bash
# 启动远程触发服务
node tests/performance/demo.js automated &

# 触发测试执行
curl -X POST http://localhost:3002/execute \
  -H "Content-Type: application/json" \
  -d '{"suite": "advanced-click-node", "options": {"trigger": "api"}}'

# 获取执行状态
curl http://localhost:3002/status

# 获取测试结果
curl http://localhost:3002/results/{executionId}
```

## 🐛 故障排除

### 常见问题

1. **测试超时**
   ```
   解决方案：增加 timeout 配置或检查网络连接
   ```

2. **内存不足**
   ```
   解决方案：减少并发测试数或增加系统内存
   ```

3. **浏览器启动失败**
   ```
   解决方案：检查 Camoufox 安装和配置
   ```

4. **截图保存失败**
   ```
   解决方案：检查输出目录权限
   ```

### 调试模式

```bash
# 启用调试日志
DEBUG=1 node demo.js basic

# 查看详细错误信息
node demo.js basic 2>&1 | tee debug.log
```

## 📈 性能优化建议

### 1. 测试配置优化
- 根据系统性能调整并发测试数
- 合理设置超时时间和重试次数
- 禁用不必要的截图和日志

### 2. 资源管理
- 定期清理旧的测试结果
- 监控系统资源使用情况
- 优化测试数据大小

### 3. 执行策略
- 将测试分类并按优先级执行
- 使用增量测试减少重复执行
- 并行执行独立的测试用例

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有疑问：

1. 查看 [故障排除](#-故障排除) 部分
2. 检查 [GitHub Issues](../../issues)
3. 创建新的 Issue 并提供详细的错误信息

---

**AdvancedClickNode 性能测试框架** - 让性能和可靠性测试变得简单而强大 🚀