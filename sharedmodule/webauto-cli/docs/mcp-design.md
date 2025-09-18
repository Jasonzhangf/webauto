# MCP服务器设计规范

## 概述
根据Model Context Protocol (MCP)的规范，我们需要实现一个符合标准的MCP服务器，用于与AI助手进行上下文交互。

## MCP核心概念
MCP定义了三种消息类型：
1. **Requests**: 由客户端发送给服务器的请求
2. **Responses**: 服务器对请求的响应
3. **Notifications**: 服务器主动发送的通知

## 消息结构
所有MCP消息都遵循JSON-RPC 2.0格式：
```json
{
  "jsonrpc": "2.0",
  "id": "unique-id",
  "method": "method-name",
  "params": {}
}
```

## 核心方法

### 初始化方法
1. **initialize**
   - 客户端发送初始化请求
   - 服务器返回capabilities（支持的功能）

2. **initialized**
   - 客户端通知服务器已初始化完成

### 核心功能方法
1. **resources/list**
   - 列出可用资源
   
2. **resources/read**
   - 读取指定资源内容
   
3. **prompts/list**
   - 列出可用提示
   
4. **prompts/get**
   - 获取提示详情
   
5. **tools/list**
   - 列出可用工具
   
6. **tools/call**
   - 调用指定工具

## 传输协议
MCP支持多种传输协议：
1. **stdio**: 标准输入输出
2. **sse**: Server-Sent Events
3. **websockets**: WebSocket
4. **http**: HTTP请求

## WebAuto CLI的MCP实现设计

### 架构图
```
┌─────────────────┐    ┌──────────────────┐
│    AI助手        │    │   WebAuto MCP     │
├─────────────────┤    ├──────────────────┤
│                 │    │   MCP Server      │
│  MCP Client     │◄──►│                  │
│                 │    │  ┌─────────────┐ │
└─────────────────┘    │  │ Resource    │ │
                       │  │ Manager     │ │
                       │  ├─────────────┤ │
                       │  │ Prompt      │ │
                       │  │ Manager     │ │
                       │  ├─────────────┤ │
                       │  │ Tool        │ │
                       │  │ Manager     │ │
                       │  └─────────────┘ │
                       └──────────────────┘
```

### 核心组件

#### 1. MCP Server
负责处理MCP协议消息，支持多种传输协议。

#### 2. Resource Manager
管理WebAuto的资源：
- 流水线配置
- 规则定义
- Cookie数据
- 执行日志

#### 3. Prompt Manager
管理预定义提示：
- 流水线创建提示
- 规则定义提示
- 网页操作提示

#### 4. Tool Manager
管理可执行工具：
- executePipeline: 执行流水线
- applyRules: 应用规则
- extractTargets: 提取目标元素
- manageCookies: 管理Cookie

### 消息处理流程

1. **初始化阶段**
   ```
   Client → Server: initialize request
   Server → Client: initialize response (capabilities)
   Client → Server: initialized notification
   ```

2. **资源查询阶段**
   ```
   Client → Server: resources/list request
   Server → Client: resources/list response
   ```

3. **工具调用阶段**
   ```
   Client → Server: tools/list request
   Server → Client: tools/list response
   Client → Server: tools/call request
   Server → Client: tools/call response
   ```

### 数据模型

#### Resource (资源)
```json
{
  "uri": "file:///pipelines/example.json",
  "name": "Example Pipeline",
  "description": "An example pipeline",
  "mimeType": "application/json"
}
```

#### Prompt (提示)
```json
{
  "name": "create-pipeline",
  "description": "Create a new pipeline",
  "arguments": [
    {
      "name": "name",
      "description": "Pipeline name",
      "required": true
    }
  ]
}
```

#### Tool (工具)
```json
{
  "name": "executePipeline",
  "description": "Execute a pipeline",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pipelineName": {
        "type": "string",
        "description": "Name of the pipeline to execute"
      }
    },
    "required": ["pipelineName"]
  }
}
```

## 实现计划

### 第一阶段：基础MCP服务器
1. 实现MCP消息处理框架
2. 支持stdio传输协议
3. 实现initialize和initialized方法
4. 创建基本的资源、提示和工具管理器

### 第二阶段：核心功能集成
1. 实现resources/list和resources/read方法
2. 实现prompts/list和prompts/get方法
3. 实现tools/list和tools/call方法
4. 集成WebAuto的核心功能作为MCP工具

### 第三阶段：多传输协议支持
1. 添加WebSocket支持
2. 添加HTTP SSE支持
3. 添加HTTP REST API支持

## 错误处理
MCP定义了标准的错误码：
- -32700: Parse error (解析错误)
- -32600: Invalid Request (无效请求)
- -32601: Method not found (方法未找到)
- -32602: Invalid params (无效参数)
- -32603: Internal error (内部错误)
- -32000 to -32099: Server error (服务器错误)