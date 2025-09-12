# @webauto/mcp-protocol-framework

[![npm version](https://badge.fury.io/js/@webauto%2Fmcp-protocol-framework.svg)](https://badge.fury.io/js/@webauto%2Fmcp-protocol-framework)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个高级的MCP (Model Context Protocol) 协议框架，具有自动工具发现和BaseModule集成功能。

## ✨ 特性

- 🔧 **纯协议层设计** - 完全分离MCP协议处理和业务逻辑
- 🧩 **BaseModule继承** - 继承自RCC BaseModule，支持模块生命周期管理
- 🔄 **自动工具发现** - 扫描指定目录自动注册MCP工具
- 🛡️ **标准化错误处理** - 集成RCC ErrorHandlingCenter
- 📡 **JSON-RPC 2.0** - 完整支持标准JSON-RPC 2.0协议
- 🎯 **灵活扩展** - 支持多种工具格式和注册方式
- 📊 **调试支持** - 内置日志记录和调试功能

## 📦 安装

```bash
npm install @webauto/mcp-protocol-framework
```

## 🚀 快速开始

### 基础用法

```javascript
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');

// 创建MCP框架实例
const framework = new MCPProtocolFramework({
  name: 'My MCP Server',
  version: '1.0.0',
  toolScanPaths: ['./tools'],
  autoScanTools: true
});

// 设置业务逻辑回调
framework.setCallbacks({
  onInitialize: async (params) => {
    console.log('Client initialized with params:', params);
    return { success: true };
  },
  
  onToolCall: async (toolName, args) => {
    console.log(`Tool called: ${toolName}`, args);
    // 实现你的业务逻辑
    return { content: [{ type: 'text', text: 'Tool executed successfully' }] };
  }
});

// 启动MCP服务器
framework.start();
```

### 自动工具发现

框架会自动扫描指定目录并注册工具：

```javascript
// tools/my-tool.js - 单个工具导出
module.exports.mcpTool = {
  name: 'myTool',
  description: 'My custom tool',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to process'
      }
    },
    required: ['message']
  }
};

// tools/multiple-tools.js - 多个工具导出
module.exports.mcpTools = [
  {
    name: 'tool1',
    description: 'First tool',
    inputSchema: { /* ... */ }
  },
  {
    name: 'tool2',
    description: 'Second tool',
    inputSchema: { /* ... */ }
  }
];

// tools/class-tool.js - 类工具
class MyTool {
  getMCPTool() {
    return {
      name: 'classTool',
      description: 'Class-based tool',
      inputSchema: { /* ... */ }
    };
  }
  
  async execute(args) {
    // 工具执行逻辑
    return { content: [{ type: 'text', text: 'Class tool executed' }] };
  }
}

module.exports = MyTool;
```

## 📚 API 文档

### MCPProtocolFramework

#### 构造函数

```javascript
new MCPProtocolFramework(config)
```

**参数：**
- `config.name` (string) - 服务器名称
- `config.version` (string) - 服务器版本
- `config.protocolVersion` (string) - MCP协议版本 (默认: '2025-06-18')
- `config.logger` (object) - 日志记录器 (默认: console)
- `config.toolScanPaths` (string[]) - 工具扫描路径数组 (默认: ['./tools', './src/tools'])
- `config.autoScanTools` (boolean) - 是否自动扫描工具 (默认: true)

#### 方法

##### `registerTool(tool)`

手动注册工具。

```javascript
framework.registerTool({
  name: 'manualTool',
  description: 'Manually registered tool',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string' }
    },
    required: ['param']
  }
});
```

##### `unregisterTool(name)`

注销指定名称的工具。

```javascript
framework.unregisterTool('toolName');
```

##### `setCallbacks(callbacks)`

设置业务逻辑回调。

```javascript
framework.setCallbacks({
  onInitialize: async (params) => { /* ... */ },
  onToolList: async () => { /* ... */ },
  onToolCall: async (toolName, args) => { /* ... */ },
  onInitialized: async () => { /* ... */ },
  onShutdown: async () => { /* ... */ }
});
```

##### `start()`

启动MCP服务器。

```javascript
framework.start();
```

##### `stop()`

停止MCP服务器。

```javascript
await framework.stop();
```

##### `addToolScanPath(path)`

添加工具扫描路径。

```javascript
framework.addToolScanPath('./my-tools');
```

##### `removeToolScanPath(path)`

移除工具扫描路径。

```javascript
framework.removeToolScanPath('./old-tools');
```

##### `rescanTools()`

重新扫描所有工具。

```javascript
framework.rescanTools();
```

### 工具格式

#### 单个工具导出

```javascript
module.exports.mcpTool = {
  name: 'toolName',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description'
      },
      param2: {
        type: 'number',
        default: 42
      }
    },
    required: ['param1']
  }
};
```

#### 多个工具导出

```javascript
module.exports.mcpTools = [
  {
    name: 'tool1',
    description: 'First tool',
    inputSchema: { /* ... */ }
  },
  {
    name: 'tool2',
    description: 'Second tool',
    inputSchema: { /* ... */ }
  }
];
```

#### 类工具

```javascript
class MyTool {
  constructor() {
    // 初始化逻辑
  }
  
  getMCPTool() {
    return {
      name: 'myTool',
      description: 'Class-based tool',
      inputSchema: { /* ... */ }
    };
  }
  
  async execute(args) {
    // 工具执行逻辑
    return {
      content: [
        {
          type: 'text',
          text: 'Tool execution result'
        }
      ]
    };
  }
}

module.exports = MyTool;
```

## 🛠️ 开发指南

### 创建MCP服务器

1. **初始化项目**

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm install @webauto/mcp-protocol-framework
```

2. **创建主服务器文件**

```javascript
// server.js
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');

const framework = new MCPProtocolFramework({
  name: 'My MCP Server',
  version: '1.0.0',
  toolScanPaths: ['./tools']
});

framework.setCallbacks({
  onToolCall: async (toolName, args) => {
    console.log(`Executing tool: ${toolName}`);
    // 你的业务逻辑
    return {
      content: [
        {
          type: 'text',
          text: `Tool ${toolName} executed successfully`
        }
      ]
    };
  }
});

framework.start();
```

3. **创建工具目录和文件**

```bash
mkdir tools
```

```javascript
// tools/hello.js
module.exports.mcpTool = {
  name: 'hello',
  description: 'Say hello',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name to greet'
      }
    },
    required: ['name']
  }
};
```

4. **运行服务器**

```bash
node server.js
```

### 工具开发最佳实践

1. **输入验证**

```javascript
module.exports.mcpTool = {
  name: 'validatedTool',
  description: 'Tool with input validation',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address'
      },
      age: {
        type: 'integer',
        minimum: 0,
        maximum: 150,
        description: 'Age in years'
      }
    },
    required: ['email']
  }
};
```

2. **错误处理**

```javascript
class RobustTool {
  getMCPTool() {
    return {
      name: 'robustTool',
      description: 'Tool with error handling',
      inputSchema: { /* ... */ }
    };
  }
  
  async execute(args) {
    try {
      // 工具逻辑
      const result = await this.doWork(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
}
```

3. **异步操作**

```javascript
module.exports.mcpTool = {
  name: 'asyncTool',
  description: 'Tool with async operations',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch'
      }
    },
    required: ['url']
  }
};

// 在回调中处理
framework.setCallbacks({
  onToolCall: async (toolName, args) => {
    if (toolName === 'asyncTool') {
      const response = await fetch(args.url);
      const data = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: `Fetched data: ${JSON.stringify(data)}`
          }
        ]
      };
    }
  }
});
```

## 🧪 测试

```javascript
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');

const framework = new MCPProtocolFramework({
  name: 'Test Server',
  autoScanTools: false
});

// 测试工具注册
framework.registerTool({
  name: 'testTool',
  description: 'Test tool',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  }
});

console.log('Registered tools:', Array.from(framework.tools.keys()));
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📞 支持

如有问题，请通过以下方式联系：

- 创建GitHub Issue
- 发送邮件至开发团队

---

**WebAuto Team** - 专注于Web自动化和MCP协议开发