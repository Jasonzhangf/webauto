# 节点系统 (Node System)

一个基于节点的可视化工作流执行引擎，专为微博批量下载等 Web 自动化任务设计。

## 特性

- 🎯 **节点基础架构** - 强大的节点系统和连接管理
- 🔗 **可视化工作流** - 支持 JSON 配置的节点连接
- 🚀 **并行执行** - 自动依赖解析和并行执行
- 🛡️ **类型验证** - 节点间数据类型检查
- 📊 **事件驱动** - 完整的事件监听和进度跟踪
- 🔧 **可扩展** - 易于添加新的节点类型
- 📝 **全面测试** - 包含完整的测试套件

## 📁 文件用途说明

### 核心基础文件
- **base-node.js** - 节点系统基础类，包含 BaseNode、NodeConnection、ExecutionContext 和 NodeTypes 的定义
- **workflow-engine.js** - 工作流引擎核心，负责工作流的加载、验证、依赖解析和执行调度
- **workflow-runner.js** - 工作流运行器，提供 CLI 接口、进度跟踪、结果保存和变量处理功能

### 测试和验证文件
- **comprehensive-test-suite.js** - 全面测试套件，测试整个节点系统的完整性
- **node-type-tests.js** - 节点类型独立测试，验证每个节点类型的功能
- **final-comprehensive-test.js** - 最终综合测试，确保系统稳定性
- **execution-test.js** - 执行测试，测试工作流执行流程
- **WORKFLOW_INTERFACE_STANDARD.md** - 工作流接口标准文档

### 节点实现文件 (nodes/ 目录)
- **nodes/BrowserOperatorNode.js** - 浏览器操作节点，管理浏览器实例和页面操作
- **nodes/CookieManagerNode.js** - Cookie 管理节点，处理 Cookie 加载和验证
- **nodes/NavigationOperatorNode.js** - 页面导航节点，处理页面跳转和等待
- **nodes/ContainerExtractorNode.js** - 容器提取节点，从页面提取微博容器和链接
- **nodes/LinkFilterNode.js** - 链接过滤节点，过滤和处理提取的链接
- **nodes/FileSaverNode.js** - 文件保存节点，保存下载结果到文件
- **nodes/ConditionalRouterNode.js** - 条件路由节点，基于条件控制执行流程

## 核心组件

### 基础类 (base-node.js)
- `BaseNode` - 所有节点的基类
- `NodeConnection` - 节点连接管理
- `ExecutionContext` - 执行上下文管理
- `NodeTypes` - 节点类型定义

### 工作流引擎 (workflow-engine.js)
- 工作流加载和验证
- 依赖解析和执行调度
- 事件系统
- 错误处理

### 工作流运行器 (workflow-runner.js)
- CLI 接口
- 进度跟踪
- 结果保存
- 变量处理

### 节点实现 (nodes/)
- `BrowserOperatorNode` - 浏览器操作
- `CookieManagerNode` - Cookie 管理
- `NavigationOperatorNode` - 页面导航
- `ContainerExtractorNode` - 容器提取
- `LinkFilterNode` - 链接过滤
- `FileSaverNode` - 文件保存
- `ConditionalRouterNode` - 条件路由

## 快速开始

### 基本使用

```bash
# 验证工作流配置
node workflow-runner.js --workflow weibo-post-extraction-workflow.json --validate

# 可视化工作流结构
node workflow-runner.js --workflow weibo-post-extraction-workflow.json --visualize

# 执行工作流
node workflow-runner.js --workflow weibo-post-extraction-workflow.json
```

### 运行测试

```bash
# 运行节点类型独立测试
node node-type-tests.js

# 运行全面测试套件
node comprehensive-test-suite.js

# 运行基本测试
node test-workflow.js
```

## 工作流配置示例

```json
{
  "version": "1.0",
  "name": "Weibo Post Extraction",
  "nodes": [
    {
      "id": "cookie_manager",
      "type": "COOKIE_MANAGER",
      "title": "Cookie Manager",
      "parameters": {
        "cookiePath": "${HOME}/.webauto/cookies.json",
        "domain": "weibo.com"
      }
    },
    {
      "id": "browser_operator",
      "type": "BROWSER_OPERATOR",
      "title": "Browser Operator",
      "parameters": {
        "headless": false,
        "viewport": { "width": 1920, "height": 1080 }
      }
    }
  ],
  "connections": [
    {
      "from": "cookie_manager",
      "fromOutput": "cookies",
      "to": "browser_operator",
      "toInput": "cookies"
    }
  ],
  "variables": {
    "HOME": "/Users/test",
    "timestamp": "${TIMESTAMP}"
  }
}
```

## 节点类型

### BrowserOperatorNode
提供浏览器实例管理功能。

**输入:**
- `config` (object) - 浏览器配置
- `cookies` (array) - Cookie 数组

**输出:**
- `page` (object) - 页面对象
- `browser` (object) - 浏览器对象

### CookieManagerNode
管理 Cookie 的加载和验证。

**输入:**
- `cookiePath` (string) - Cookie 文件路径
- `domain` (string) - 目标域名

**输出:**
- `cookies` (array) - Cookie 数组
- `success` (boolean) - 成功状态

### NavigationOperatorNode
处理页面导航和等待操作。

**输入:**
- `page` (object) - 页面对象
- `url` (string) - 目标 URL
- `trigger` (any) - 触发器

**输出:**
- `page` (object) - 页面对象
- `navigationResult` (object) - 导航结果

### ContainerExtractorNode
从页面提取容器和链接。

**输入:**
- `page` (object) - 页面对象
- `containerSelector` (string) - 容器选择器
- `linkSelector` (string) - 链接选择器
- `maxPosts` (number) - 最大帖子数

**输出:**
- `containers` (array) - 容器数组
- `links` (array) - 链接数组
- `extractionResult` (object) - 提取结果

### LinkFilterNode
过滤和处理提取的链接。

**输入:**
- `links` (array) - 原始链接数组
- `filterPatterns` (array) - 过滤模式

**输出:**
- `filteredLinks` (array) - 过滤后的链接
- `filterStats` (object) - 过滤统计

### FileSaverNode
保存数据到文件。

**输入:**
- `data` (any) - 要保存的数据
- `filePath` (string) - 文件路径
- `format` (string) - 文件格式

**输出:**
- `savedPath` (string) - 保存路径
- `success` (boolean) - 成功状态

### ConditionalRouterNode
条件路由控制。

**输入:**
- `condition` (boolean) - 条件
- `input` (any) - 输入数据

**输出:**
- `true` (any) - 条件为真时的输出
- `false` (any) - 条件为假时的输出

## 开发

### 添加新节点类型

1. 在 `nodes/` 目录创建新的节点文件
2. 继承 `BaseNode` 类
3. 实现 `execute` 方法
4. 在 `base-node.js` 中添加节点类型定义
5. 更新测试文件

### 测试

项目包含完整的测试套件：

- `node-type-tests.js` - 节点类型独立测试
- `comprehensive-test-suite.js` - 全面系统测试
- `test-workflow.js` - 基本工作流测试

### 贡献

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License