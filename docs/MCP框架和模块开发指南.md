# MCP框架和模块开发指南

## 目录

1. [框架概述](#框架概述)
2. [快速开始](#快速开始)
3. [工具开发](#工具开发)
4. [模块架构](#模块架构)
5. [最佳实践](#最佳实践)
6. [调试和测试](#调试和测试)
7. [部署和发布](#部署和发布)
8. [常见问题](#常见问题)

## 框架概述

### 什么是MCP协议框架？

@webauto/mcp-protocol-framework 是一个高级的MCP (Model Context Protocol) 协议框架，它提供了：

- **纯协议层实现**：完整的JSON-RPC 2.0协议处理
- **自动工具发现**：扫描目录自动注册MCP工具
- **BaseModule集成**：继承RCC BaseModule，支持模块生命周期管理
- **标准化错误处理**：集成RCC ErrorHandlingCenter
- **灵活的扩展机制**：支持多种工具格式和注册方式

### 架构设计

```
┌─────────────────────────────────────────┐
│            MCP Client                 │
└─────────────────┬───────────────────────┘
                  │ JSON-RPC 2.0 over stdio
┌─────────────────▼───────────────────────┐
│       MCP Protocol Framework            │
│  ┌─────────────────────────────────┐    │
│  │      Protocol Layer            │    │
│  │  • JSON-RPC 2.0 Handler       │    │
│  │  • Message Processing         │    │
│  │  • Error Handling            │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │    Tool Management            │    │
│  │  • Auto Discovery            │    │
│  │  • Registration               │    │
│  │  • Lifecycle                 │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │   Business Logic Callbacks     │    │
│  │  • Tool Execution             │    │
│  │  • Custom Logic              │    │
│  └─────────────────────────────────┘    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          Tool Modules                 │
│  ┌─────────────┐ ┌─────────────┐      │
│  │   Tool 1   │ │   Tool 2   │ ...  │
│  └─────────────┘ └─────────────┘      │
└─────────────────────────────────────────┘
```

## 快速开始

### 1. 环境准备

```bash
# 创建新项目
mkdir my-mcp-server
cd my-mcp-server

# 初始化npm项目
npm init -y

# 安装依赖
npm install @webauto/mcp-protocol-framework rcc-errorhandling rcc-basemodule
```

### 2. 创建基础服务器

```javascript
// server.js
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');
const { ErrorHandlingCenter } = require('rcc-errorhandling');

const framework = new MCPProtocolFramework({
  name: 'My MCP Server',
  version: '1.0.0',
  toolScanPaths: ['./tools'],
  autoScanTools: true
});

// 设置业务逻辑回调
framework.setCallbacks({
  onInitialize: async (params) => {
    console.log('🚀 Server initialized with protocol version:', params.protocolVersion);
    return { success: true };
  },

  onToolCall: async (toolName, args) => {
    console.log(`🔧 Executing tool: ${toolName}`, args);
    
    try {
      // 这里实现具体的工具逻辑
      const result = await executeTool(toolName, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  },

  onShutdown: async () => {
    console.log('🛑 Server shutting down...');
    // 清理资源
  }
});

// 启动服务器
framework.start();

console.log('✅ MCP Server started and ready for connections!');
```

### 3. 创建工具目录和工具

```bash
mkdir tools
```

#### 示例工具：Hello World

```javascript
// tools/hello.js
module.exports.mcpTool = {
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the person to greet'
      },
      enthusiastic: {
        type: 'boolean',
        description: 'Whether to be enthusiastic',
        default: false
      }
    },
    required: ['name']
  }
};
```

#### 在服务器中实现工具逻辑：

```javascript
// 在server.js中添加工具执行逻辑
async function executeTool(toolName, args) {
  switch (toolName) {
    case 'hello':
      const greeting = args.enthusiastic 
        ? `🎉 Hello, ${args.name}! Welcome to MCP!`
        : `Hello, ${args.name}.`;
      return { message: greeting };
      
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

### 4. 运行和测试

```bash
# 运行服务器
node server.js
```

在另一个终端测试工具调用：

```bash
# 发送MCP请求
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "hello",
    "arguments": {
      "name": "World",
      "enthusiastic": true
    }
  }
}' | node server.js
```

## 工具开发

### 工具格式

#### 1. 单个工具导出

```javascript
module.exports.mcpTool = {
  name: 'toolName',
  description: 'Tool description for users',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description'
      },
      param2: {
        type: 'number',
        description: 'Numeric parameter',
        default: 42,
        minimum: 0,
        maximum: 100
      },
      optionalParam: {
        type: 'boolean',
        description: 'Optional parameter',
        default: false
      }
    },
    required: ['param1']
  }
};
```

#### 2. 多个工具导出

```javascript
// utils/string-tools.js
module.exports.mcpTools = [
  {
    name: 'uppercase',
    description: 'Convert text to uppercase',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to convert'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'lowercase',
    description: 'Convert text to lowercase',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to convert'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'reverse',
    description: 'Reverse text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to reverse'
        }
      },
      required: ['text']
    }
  }
];
```

#### 3. 类工具

```javascript
// tools/database-tool.js
class DatabaseTool {
  constructor() {
    this.connection = null;
  }

  async initialize() {
    // 初始化数据库连接
    this.connection = await createDatabaseConnection();
  }

  getMCPTool() {
    return {
      name: 'databaseQuery',
      description: 'Execute database query',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL query to execute'
          },
          params: {
            type: 'object',
            description: 'Query parameters',
            additionalProperties: true
          }
        },
        required: ['query']
      }
    };
  }

  async execute(args) {
    if (!this.connection) {
      await this.initialize();
    }

    try {
      const result = await this.connection.execute(args.query, args.params || {});
      return {
        content: [
          {
            type: 'text',
            text: `Query executed successfully. ${result.rows.length} rows returned.`
          },
          {
            type: 'text',
            text: JSON.stringify(result.rows, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Database error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async cleanup() {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}

module.exports = DatabaseTool;
```

### 工具开发最佳实践

#### 1. 输入验证

```javascript
// tools/validated-tool.js
module.exports.mcpTool = {
  name: 'sendEmail',
  description: 'Send an email',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        format: 'email',
        description: 'Recipient email address'
      },
      subject: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Email subject'
      },
      body: {
        type: 'string',
        minLength: 1,
        description: 'Email body'
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        default: 'normal',
        description: 'Email priority'
      }
    },
    required: ['to', 'subject', 'body']
  }
};
```

#### 2. 错误处理

```javascript
// tools/robust-tool.js
class RobustTool {
  getMCPTool() {
    return {
      name: 'fileOperations',
      description: 'Perform file operations',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'delete', 'copy'],
            description: 'File operation to perform'
          },
          path: {
            type: 'string',
            description: 'File path'
          },
          content: {
            type: 'string',
            description: 'Content to write (for write action)'
          }
        },
        required: ['action', 'path']
      }
    };
  }

  async execute(args) {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      // 验证路径安全性
      const safePath = path.resolve(args.path);
      if (!safePath.startsWith(process.cwd())) {
        throw new Error('Access denied: path outside working directory');
      }

      switch (args.action) {
        case 'read':
          const content = await fs.readFile(safePath, 'utf8');
          return {
            content: [
              {
                type: 'text',
                text: `File content:\n${content}`
              }
            ]
          };

        case 'write':
          await fs.writeFile(safePath, args.content || '', 'utf8');
          return {
            content: [
              {
                type: 'text',
                text: 'File written successfully'
              }
            ]
          };

        case 'delete':
          await fs.unlink(safePath);
          return {
            content: [
              {
                type: 'text',
                text: 'File deleted successfully'
              }
            ]
          };

        case 'copy':
          // 实现复制逻辑
          throw new Error('Copy operation not implemented yet');

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
}

module.exports = RobustTool;
```

#### 3. 异步操作

```javascript
// tools/async-tool.js
module.exports.mcpTool = {
  name: 'webRequest',
  description: 'Make HTTP requests',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'URL to request'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET',
        description: 'HTTP method'
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
        additionalProperties: { type: 'string' }
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT)'
      },
      timeout: {
        type: 'integer',
        default: 30000,
        minimum: 1000,
        maximum: 300000,
        description: 'Request timeout in milliseconds'
      }
    },
    required: ['url']
  }
};

// 在服务器回调中实现
framework.setCallbacks({
  onToolCall: async (toolName, args) => {
    if (toolName === 'webRequest') {
      const fetch = require('node-fetch');
      
      try {
        const response = await fetch(args.url, {
          method: args.method,
          headers: args.headers,
          body: args.body,
          timeout: args.timeout
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          body: await response.text()
        };

        return {
          content: [
            {
              type: 'text',
              text: `HTTP ${args.method} ${args.url}`
            },
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Request failed: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  }
});
```

## 模块架构

### 目录结构推荐

```
my-mcp-server/
├── package.json
├── server.js                 # 主服务器文件
├── config/
│   └── default.js           # 配置文件
├── tools/                   # 工具目录
│   ├── index.js            # 工具索引（可选）
│   ├── system/             # 系统工具
│   │   ├── file-ops.js
│   │   └── system-info.js
│   ├── web/                # Web相关工具
│   │   ├── http-client.js
│   │   └── browser.js
│   └── data/               # 数据处理工具
│       ├── json-tool.js
│       └── csv-tool.js
├── lib/                    # 工具库
│   ├── database.js
│   ├── logger.js
│   └── utils.js
├── tests/                  # 测试文件
│   ├── tools/
│   └── integration/
└── docs/                   # 文档
    └── API.md
```

### 模块化开发

#### 1. 工具模块

```javascript
// tools/index.js
// 导入所有工具模块
const fileTools = require('./system/file-ops');
const webTools = require('./web/http-client');
const dataTools = require('./data/json-tool');

// 统一导出
module.exports.mcpTools = [
  ...fileTools.mcpTools,
  ...webTools.mcpTools,
  ...dataTools.mcpTools
];
```

#### 2. 配置模块

```javascript
// config/default.js
module.exports = {
  server: {
    name: 'My MCP Server',
    version: '1.0.0',
    protocolVersion: '2025-06-18'
  },
  tools: {
    scanPaths: ['./tools'],
    autoScan: true,
    rescanInterval: 60000 // 1分钟重新扫描
  },
  logging: {
    level: 'info',
    file: './logs/server.log'
  },
  database: {
    host: 'localhost',
    port: 5432,
    database: 'myapp'
  }
};
```

#### 3. 工具库模块

```javascript
// lib/database.js
const { Pool } = require('pg');

class Database {
  constructor(config) {
    this.pool = new Pool(config);
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('error executing query', { text, error });
      throw error;
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = Database;
```

## 最佳实践

### 1. 错误处理

```javascript
// 统一错误处理中间件
class ToolError extends Error {
  constructor(message, code = 'TOOL_ERROR', details = null) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

// 错误处理包装器
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ToolError) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${error.message}`
            }
          ],
          isError: true,
          errorCode: error.code
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Internal error: ${error.message}`
            }
          ],
          isError: true,
          errorCode: 'INTERNAL_ERROR'
        };
      }
    }
  };
}

// 使用示例
const safeExecute = withErrorHandling(async (toolName, args) => {
  // 工具逻辑
});
```

### 2. 日志记录

```javascript
// lib/logger.js
const winston = require('winston');

class Logger {
  constructor(options = {}) {
    this.logger = winston.createLogger({
      level: options.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'mcp-server' },
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
      ]
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }
}

module.exports = Logger;
```

### 3. 性能优化

```javascript
// 性能监控
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  startTimer(key) {
    this.metrics.set(key, process.hrtime());
  }

  endTimer(key) {
    const start = this.metrics.get(key);
    if (!start) return null;

    const end = process.hrtime(start);
    const duration = end[0] * 1000 + end[1] / 1000000; // 转换为毫秒

    this.metrics.delete(key);
    return duration;
  }

  wrapFunction(fn, key) {
    return async (...args) => {
      this.startTimer(key);
      try {
        const result = await fn(...args);
        const duration = this.endTimer(key);
        console.log(`${key} completed in ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = this.endTimer(key);
        console.error(`${key} failed after ${duration.toFixed(2)}ms:`, error);
        throw error;
      }
    };
  }
}

// 使用示例
const monitor = new PerformanceMonitor();

framework.setCallbacks({
  onToolCall: monitor.wrapFunction(async (toolName, args) => {
    // 工具逻辑
  }, `tool.${toolName}`)
});
```

## 调试和测试

### 1. 单元测试

```javascript
// tests/tools/test-hello.js
const { expect } = require('chai');
const helloTool = require('../../tools/hello');

describe('Hello Tool', () => {
  it('should have correct structure', () => {
    expect(helloTool.mcpTool).to.be.an('object');
    expect(helloTool.mcpTool.name).to.equal('hello');
    expect(helloTool.mcpTool.description).to.be.a('string');
    expect(helloTool.mcpTool.inputSchema).to.be.an('object');
  });

  it('should validate input schema', () => {
    const schema = helloTool.mcpTool.inputSchema;
    expect(schema.type).to.equal('object');
    expect(schema.properties).to.have.property('name');
    expect(schema.required).to.include('name');
  });
});
```

### 2. 集成测试

```javascript
// tests/integration/test-mcp-server.js
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');

describe('MCP Server Integration', () => {
  let framework;

  beforeEach(() => {
    framework = new MCPProtocolFramework({
      name: 'Test Server',
      autoScanTools: false
    });

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
  });

  afterEach(async () => {
    await framework.stop();
  });

  it('should register tools', () => {
    expect(framework.tools.size).to.equal(1);
    expect(framework.tools.has('testTool')).to.be.true;
  });

  it('should handle tool calls', async () => {
    framework.setCallbacks({
      onToolCall: async (toolName, args) => {
        if (toolName === 'testTool') {
          return {
            content: [
              {
                type: 'text',
                text: `Processed: ${args.input}`
              }
            ]
          };
        }
      }
    });

    const result = await framework.handleToolCall('testTool', { input: 'test' });
    expect(result.content[0].text).to.equal('Processed: test');
  });
});
```

### 3. 调试技巧

```javascript
// 调试中间件
function debugMiddleware(framework) {
  const originalHandleMessage = framework.handleMessage.bind(framework);
  
  framework.handleMessage = async function(message) {
    console.log('📥 Received:', JSON.stringify(message, null, 2));
    
    const startTime = Date.now();
    try {
      const result = await originalHandleMessage(message);
      const duration = Date.now() - startTime;
      console.log(`📤 Response (${duration}ms):`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Error (${duration}ms):`, error);
      throw error;
    }
  };
}

// 使用调试中间件
debugMiddleware(framework);
```

## 部署和发布

### 1. Docker部署

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 更改所有权
USER nextjs

# 暴露端口（如果需要HTTP接口）
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  mcp-server:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - ./logs:/app/logs
      - ./config:/app/config
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

### 2. PM2部署

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mcp-server',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
```

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs mcp-server

# 重启应用
pm2 restart mcp-server
```

### 3. npm发布

如果你要发布自己的MCP工具包：

```json
{
  "name": "@myorg/my-mcp-tools",
  "version": "1.0.0",
  "description": "Collection of MCP tools for MyOrg",
  "main": "index.js",
  "keywords": ["mcp", "tools", "automation"],
  "dependencies": {
    "@webauto/mcp-protocol-framework": "^0.0.2"
  },
  "peerDependencies": {
    "@webauto/mcp-protocol-framework": ">=0.0.2"
  }
}
```

```javascript
// index.js
// 导出所有工具
const tools = require('./tools');
module.exports.mcpTools = tools.mcpTools;
```

## 常见问题

### Q: 如何处理长时间运行的工具？

A: 使用异步模式和进度报告：

```javascript
class LongRunningTool {
  getMCPTool() {
    return {
      name: 'longTask',
      description: 'Execute long running task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          duration: { type: 'integer', default: 5000 }
        },
        required: ['taskId']
      }
    };
  }

  async execute(args) {
    // 开始任务
    const startTime = Date.now();
    
    // 定期报告进度
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / args.duration) * 100, 100);
      
      // 在实际应用中，这里可以通过某种方式报告进度
      console.log(`Task ${args.taskId}: ${progress.toFixed(1)}% complete`);
    }, 1000);

    try {
      // 模拟长时间运行的任务
      await new Promise(resolve => setTimeout(resolve, args.duration));
      
      return {
        content: [
          {
            type: 'text',
            text: `Task ${args.taskId} completed successfully`
          }
        ]
      };
    } finally {
      clearInterval(progressInterval);
    }
  }
}
```

### Q: 如何处理工具之间的依赖关系？

A: 使用工具注册顺序和依赖注入：

```javascript
class DependencyManager {
  constructor() {
    this.dependencies = new Map();
    this.resolved = new Set();
  }

  register(toolName, dependencies = []) {
    this.dependencies.set(toolName, dependencies);
  }

  async resolve(toolName) {
    if (this.resolved.has(toolName)) {
      return;
    }

    const deps = this.dependencies.get(toolName) || [];
    
    // 首先解析依赖
    for (const dep of deps) {
      await this.resolve(dep);
    }

    // 然后初始化工具
    console.log(`Initializing tool: ${toolName}`);
    this.resolved.add(toolName);
  }
}

// 使用示例
const depManager = new DependencyManager();
depManager.register('databaseTool', ['logger']);
depManager.register('apiTool', ['databaseTool']);
depManager.register('logger', []);

// 按依赖顺序初始化
await depManager.resolve('apiTool');
```

### Q: 如何实现工具的热重载？

A: 使用文件监听和动态重载：

```javascript
const chokidar = require('chokidar');

class HotReloadManager {
  constructor(framework, watchPaths) {
    this.framework = framework;
    this.watchPaths = watchPaths;
    this.watchers = [];
  }

  start() {
    for (const path of this.watchPaths) {
      const watcher = chokidar.watch(path, {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true
      });

      watcher.on('change', (filePath) => {
        console.log(`File changed: ${filePath}`);
        this.reloadTool(filePath);
      });

      this.watchers.push(watcher);
    }
  }

  reloadTool(filePath) {
    try {
      // 清除模块缓存
      delete require.cache[require.resolve(filePath)];
      
      // 重新加载模块
      const newModule = require(filePath);
      
      // 重新注册工具
      this.framework.rescanTools();
      
      console.log(`Tool reloaded: ${filePath}`);
    } catch (error) {
      console.error(`Failed to reload tool ${filePath}:`, error);
    }
  }

  stop() {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];
  }
}

// 使用示例
const hotReload = new HotReloadManager(framework, ['./tools']);
hotReload.start();
```

### Q: 如何处理并发请求？

A: 使用请求队列和并发控制：

```javascript
class RequestQueue {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async execute(fn) {
    if (this.running >= this.maxConcurrent) {
      return new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject });
      });
    }

    this.running++;
    try {
      const result = await fn();
      this.running--;
      this.processQueue();
      return result;
    } catch (error) {
      this.running--;
      this.processQueue();
      throw error;
    }
  }

  processQueue() {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { fn, resolve, reject } = this.queue.shift();
      this.execute(fn).then(resolve, reject);
    }
  }
}

// 使用示例
const requestQueue = new RequestQueue(3); // 最大并发3个请求

framework.setCallbacks({
  onToolCall: (toolName, args) => {
    return requestQueue.execute(async () => {
      // 工具逻辑
    });
  }
});
```

---

希望这个指南能帮助你更好地使用和扩展MCP协议框架！如有任何问题，请参考官方文档或联系开发团队。