# Pipeline Framework

流水线框架是一个可配置、可组装的处理框架，支持多种LLM协议的转换和处理。

## 架构设计

### 核心组件

1. **BasePipelineNode** - 所有流水线节点的基类
2. **LLMSwitchNode** - LLM协议转换节点
3. **WorkflowNode** - 工作流处理节点
4. **CompatibilityNode** - 兼容性转换节点
5. **ProviderNode** - Provider通信节点
6. **Pipeline** - 流水线管理器
7. **PipelineManager** - 流水线工厂和管理器

### 流水线组装

根据输入协议类型，流水线可以动态组装：

```
# OpenAI输入（现有流程）
OpenAI输入 → Compatibility模块 → Provider模块

# Anthropic输入（新增流程）
Anthropic输入 → LLM Switch节点 → Workflow节点 → Compatibility模块 → Provider模块

# 其他协议输入
其他输入 → LLM Switch节点 → Workflow节点 → Compatibility模块 → Provider模块
```

## 使用方法

### 创建流水线

```javascript
const PipelineManager = require('./pipeline/PipelineManager');

const pipelineManager = new PipelineManager();

// 创建OpenAI到OpenAI的流水线
const openaiPipelineConfig = {
  name: 'openai-to-openai-pipeline',
  inputProtocol: 'openai',
  compatibility: {
    configPath: './config/openai-passthrough.config.json'
  },
  provider: {
    name: 'openai',
    apiKey: 'your-api-key',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions'
  }
};

const pipeline = pipelineManager.createPipeline(openaiPipelineConfig);
```

### 执行流水线

```javascript
const inputData = {
  data: {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: 'Hello, how are you?'
      }
    ],
    temperature: 0.7,
    max_tokens: 1024,
    stream: false
  }
};

const result = await pipeline.execute(inputData);
```

## 配置文件

### 协议映射配置

```json
{
  "anthropic_to_openai": {
    "requestTemplate": {
      "model": "{{model}}",
      "messages": "{{messages}}",
      "temperature": "{{temperature}}",
      "max_tokens": "{{max_tokens}}",
      "stream": "{{stream}}",
      "tools": "{{tools}}",
      "tool_choice": "{{tool_choice}}"
    },
    "responseTemplate": {
      "id": "{{id}}",
      "object": "{{object}}",
      "created": "{{created}}",
      "model": "{{model}}",
      "choices": "{{choices}}",
      "usage": "{{usage}}"
    }
  }
}
```

### 流水线配置

```json
{
  "pipeline": {
    "name": "anthropic-to-openai",
    "inputProtocol": "anthropic",
    "outputProtocol": "openai"
  },
  "llmSwitch": {
    "name": "anthropic-openai-switch",
    "protocolMap": {
      "anthropic_to_openai": {
        "requestTemplate": {
          "model": "{{model}}",
          "messages": "{{messages}}",
          "temperature": "{{temperature}}",
          "max_tokens": "{{max_tokens}}",
          "stream": "{{stream}}",
          "tools": "{{tools}}",
          "tool_choice": "{{tool_choice}}"
        },
        "responseTemplate": {
          "id": "{{id}}",
          "object": "{{object}}",
          "created": "{{created}}",
          "model": "{{model}}",
          "choices": "{{choices}}",
          "usage": "{{usage}}"
        }
      }
    }
  },
  "workflow": {
    "name": "stream-to-nonstream-workflow",
    "streamConverter": {
      "format": "server-sent-events"
    }
  },
  "compatibility": {
    "configPath": "./config/openai-passthrough.config.json"
  },
  "provider": {
    "name": "openai",
    "apiKey": "your-api-key",
    "apiEndpoint": "https://api.openai.com/v1/chat/completions"
  }
}
```

## 扩展性

框架设计支持轻松扩展新的协议和处理节点：

1. 继承`BasePipelineNode`创建新的节点类型
2. 在`PipelineManager`中添加新的组装逻辑
3. 创建对应的配置文件

## 测试

运行测试：

```bash
node pipeline/test.js
```

## 许可证

MIT