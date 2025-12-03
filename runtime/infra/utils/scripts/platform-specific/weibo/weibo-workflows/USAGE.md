# 微博工作流系统使用说明

## 安装和运行

### 1. 安装依赖
```bash
cd scripts/weibo-workflows
npm install playwright commander
```

### 2. 基本使用

#### 执行主页工作流
```bash
node weibo-workflow-runner.js -w homepage --max-posts 30
```

#### 执行搜索工作流
```bash
node weibo-workflow-runner.js -w search --keyword "技术" --max-posts 20
```

#### 执行个人主页工作流
```bash
node weibo-workflow-runner.js -w profile --profile-url "https://weibo.com/u/1234567890"
```

#### 列出所有可用工作流
```bash
node weibo-workflow-runner.js list
```

## 命令行参数

### 基本参数
- `-w, --workflow <type>` - 工作流类型 (homepage|profile|search|composite)
- `-c, --config <file>` - 配置文件路径
- `-o, --output <dir>` - 输出目录
- `--headless` - 无头模式运行
- `--verbose` - 详细输出

### 工作流参数
- `--max-posts <number>` - 最大帖子数量 (默认: 50)
- `--keyword <text>` - 搜索关键词
- `--profile-url <url>` - 个人主页URL
- `--timeout <number>` - 超时时间（毫秒）(默认: 120000)
- `--delay <number>` - 工作流间隔（毫秒）(默认: 2000)

## 子命令

### 批量执行
```bash
node weibo-workflow-runner.js batch config/batch-execution-example.json
```

### 关键词监控
```bash
node weibo-workflow-runner.js monitor 人工智能 区块链 机器学习
```

### 用户追踪
```bash
node weibo-workflow-runner.js track 用户A 用户B 用户C
```

## 配置文件

### 工作流配置 (workflow-configs.json)
```json
{
  "browser": {
    "headless": false,
    "args": ["--no-sandbox", "--disable-setuid-sandbox"]
  },
  "orchestrator": {
    "maxConcurrentWorkflows": 2,
    "defaultTimeout": 120000
  },
  "workflows": {
    "weibo-homepage": {
      "maxPosts": 50,
      "timeout": 120000
    }
  }
}
```

### 批量执行配置 (batch-execution-example.json)
```json
{
  "workflows": [
    {
      "type": "weibo-homepage",
      "enabled": true,
      "options": {
        "maxPosts": 30
      }
    },
    {
      "type": "weibo-search",
      "enabled": true,
      "options": {
        "keyword": "技术",
        "maxResults": 20
      }
    }
  ]
}
```

## 工作流类型

### 1. 微博主页工作流 (weibo-homepage)
- **功能**: 提取微博主页的热门帖子和推荐内容
- **参数**:
  - `maxPosts`: 最大帖子数量
  - `timeout`: 超时时间

### 2. 个人主页工作流 (weibo-profile)
- **功能**: 提取用户个人主页的帖子和用户信息
- **参数**:
  - `profileUrl`: 个人主页URL (必需)
  - `maxPosts`: 最大帖子数量
  - `includeUserInfo`: 是否包含用户信息

### 3. 搜索结果工作流 (weibo-search)
- **功能**: 提取搜索结果的帖子和相关推荐
- **参数**:
  - `keyword`: 搜索关键词 (必需)
  - `maxResults`: 最大结果数量
  - `sortBy`: 排序方式 (recent|hot)
  - `includeRelated`: 是否包含相关搜索

### 4. 复合工作流 (composite)
- **功能**: 组合多个工作流实现复杂功能
- **支持类型**:
  - 完整扫描 (complete-scan)
  - 关键词监控 (keyword-monitoring)
  - 用户追踪 (user-tracking)

## 输出格式

### 单个工作流输出
```json
{
  "success": true,
  "posts": [...],
  "metadata": {
    "workflowName": "weibo-homepage",
    "totalPosts": 30,
    "executionTime": 4500
  }
}
```

### 批量执行输出
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "summary": {
    "totalWorkflows": 5,
    "successfulWorkflows": 4
  },
  "results": [...]
}
```

## 示例代码

### 编程方式使用
```javascript
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('./core/workflow-orchestrator');

async function example() {
  // 启动浏览器
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 创建编排器
  const orchestrator = new WorkflowOrchestrator();

  // 执行工作流
  const result = await orchestrator.executeWorkflow('weibo-homepage', {
    context: { page, browser, context },
    maxPosts: 20
  });

  console.log('结果:', result);

  // 清理
  await browser.close();
  await orchestrator.destroy();
}
```

### 批量执行
```javascript
const workflowConfigs = [
  {
    name: 'weibo-homepage',
    options: { maxPosts: 15 }
  },
  {
    name: 'weibo-search',
    options: { keyword: '技术', maxResults: 10 }
  }
];

const results = await orchestrator.executeBatch(workflowConfigs);
```

## 错误处理

### 常见错误
1. **浏览器启动失败**: 检查 Playwright 安装
2. **页面加载超时**: 调整 timeout 参数
3. **元素找不到**: 检查微博页面结构是否变化
4. **Cookie 失效**: 重新登录微博

### 重试机制
- 默认重试次数: 3次
- 重试间隔: 2秒
- 可通过配置文件调整

## 性能优化

### 并发控制
- 默认最大并发工作流: 2个
- 可通过 `maxConcurrentWorkflows` 调整

### 内存管理
- 自动清理浏览器实例
- 定期清理临时文件
- 内存限制: 512MB

### 执行效率
- 智能等待策略
- 并行操作支持
- 结果缓存机制

## 监控和日志

### 日志级别
- `info`: 一般信息
- `warn`: 警告信息
- `error`: 错误信息
- `debug`: 调试信息

### 日志文件
- 位置: `./logs/`
- 文件名格式: `workflow-YYYY-MM-DD.log`
- 自动轮转和清理

### 执行报告
- 位置: `./reports/`
- 包含执行统计和错误信息
- JSON 格式便于分析

## 最佳实践

### 1. 工作流设计
- 保持原子操作的单一性
- 合理设置超时和重试参数
- 添加适当的错误处理

### 2. 配置管理
- 使用配置文件管理参数
- 根据环境调整配置
- 避免硬编码敏感信息

### 3. 执行策略
- 合理设置并发数量
- 使用适当的执行间隔
- 监控系统资源使用

### 4. 数据处理
- 实施数据验证和清理
- 使用去重机制
- 优化数据存储格式

## 故障排除

### 问题排查步骤
1. 检查日志文件获取详细错误信息
2. 验证网络连接和浏览器状态
3. 检查微博页面是否有结构变化
4. 验证配置文件是否正确

### 调试工具
- 启用详细日志: `--verbose`
- 保存截图用于分析
- 使用浏览器开发者工具

### 性能问题
- 减少并发工作流数量
- 增加执行间隔
- 优化原子操作逻辑

## 扩展开发

### 添加新工作流
1. 在 `workflows/` 目录创建新的工作流文件
2. 继承 `BaseWorkflow` 类
3. 实现必需的方法
4. 在工作流注册表中注册

### 添加新原子操作
1. 在 `core/atomic-operations/` 目录创建新的原子操作
2. 继承 `BaseAtomicOperation` 类
3. 实现执行逻辑
4. 在工作流中注册使用

### 自定义数据处理
1. 实现 `dataProcessing` 配置
2. 添加数据验证规则
3. 实现自定义转换函数
4. 配置输出格式

## 技术支持

如果遇到问题，请：
1. 查看日志文件获取错误详情
2. 检查本文档的常见问题
3. 运行测试用例验证功能
4. 提交 Issue 并附上重现步骤

---

**注意**: 使用本系统需要遵守微博的使用条款，避免过度频繁的请求。