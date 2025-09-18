# RCC Pipeline Module

[![npm version](https://badge.fury.io/js/rcc-pipeline.svg)](https://badge.fury.io/js/rcc-pipeline)
[![Build Status](https://github.com/rcc/rcc-pipeline/actions/workflows/build.yml/badge.svg)](https://github.com/rcc/rcc-pipeline/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/github/rcc/rcc-pipeline/badge.svg)](https://coveralls.io/github/rcc/rcc-pipeline)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 概述

RCC Pipeline Module是一个强大的流水线管理和任务调度系统，专为AI模型提供商的请求处理而设计。该模块提供了智能调度、负载均衡、错误处理和完整的请求跟踪功能，是RCC生态系统中的核心组件。

## 主要特性

### 🚀 核心功能
- **智能调度**: 多种负载均衡策略（轮询、随机、权重、最少连接）
- **并发控制**: 可配置的最大并发请求数和请求队列管理
- **熔断器机制**: 自动故障检测和恢复
- **请求跟踪**: 端到端的请求生命周期跟踪
- **性能监控**: 实时性能指标和系统健康监控

### 🔧 高级特性
- **OAuth 2.0支持**: 完整的设备流程认证
- **流式响应**: 支持实时流式AI响应
- **自动重试**: 指数退避重试策略
- **健康检查**: 定期组件健康状态检查
- **动态配置**: 运行时配置更新支持

### 🎯 支持的AI提供商
- **Qwen**: 阿里云通义千问大模型
- **iFlow**: 智能流程处理引擎
- **OpenAI兼容**: 标准OpenAI API接口
- **扩展性**: 易于添加新的AI提供商

## 安装

```bash
npm install rcc-pipeline
```

## 依赖要求

此模块需要以下RCC模块：

```bash
npm install rcc-basemodule rcc-errorhandling rcc-config-parser rcc-virtual-model-rules
```

## 快速开始

### 基础使用

```typescript
import {
  PipelineBaseModule,
  EnhancedPipelineScheduler,
  PipelineTracker,
  QwenProvider
} from 'rcc-pipeline';

// 1. 创建流水线基础模块
const pipelineModule = new PipelineBaseModule({
  id: 'qwen-pipeline',
  name: 'Qwen AI Pipeline',
  version: '1.0.0',
  type: 'provider',
  providerName: 'qwen',
  maxConcurrentRequests: 5,
  enableTwoPhaseDebug: true,
  enableIOTracking: true
});

// 2. 初始化Qwen提供者
const qwenProvider = new QwenProvider({
  name: 'Qwen',
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
  supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  oauth: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    scopes: ['openid']
  }
});

// 3. 创建调度器
const scheduler = new EnhancedPipelineScheduler({
  maxConcurrentRequests: 10,
  requestTimeout: 30000,
  loadBalancingStrategy: 'weighted',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000
  }
});

// 4. 注册提供者
await scheduler.registerProvider(qwenProvider);

// 5. 处理请求
const request = {
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ],
  model: 'qwen-turbo',
  temperature: 0.7,
  maxTokens: 1000
};

try {
  const response = await scheduler.scheduleRequest(
    'request-123',
    request,
    1, // priority
    30000 // timeout
  );

  console.log('Response:', response);
} catch (error) {
  console.error('Request failed:', error);
}
```

### 流式响应处理

```typescript
import { QwenProvider } from 'rcc-pipeline';

const qwenProvider = new QwenProvider(providerConfig);

// 处理流式响应
async function* processStreamRequest(request: OpenAIChatRequest) {
  const stream = await qwenProvider.executeStreamChat(request);

  for await (const chunk of stream) {
    yield {
      id: chunk.id,
      content: chunk.choices[0]?.delta?.content || '',
      finishReason: chunk.choices[0]?.finish_reason,
      timestamp: Date.now()
    };
  }
}

// 使用流式处理
const streamRequest = {
  messages: [{ role: 'user', content: 'Tell me a story' }],
  model: 'qwen-turbo',
  stream: true
};

for await (const chunk of processStreamRequest(streamRequest)) {
  console.log('Stream chunk:', chunk.content);
  if (chunk.finishReason) {
    console.log('Stream completed:', chunk.finishReason);
  }
}
```

## 详细架构

### 文件结构与功能详解

#### 入口文件
- **`src/index.ts`** - 模块主入口文件，导出所有公共API和类型定义
  - 导出核心框架类：`PipelineBaseModule`, `BaseProvider`, `EnhancedPipelineScheduler`
  - 导出调度系统：`Pipeline`, `PipelineFactory`, `PipelineScheduler`, `VirtualModelSchedulerManager`
  - 导出跟踪系统：`PipelineTracker`
  - 导出OpenAI接口和具体Provider实现：`QwenProvider`, `IFlowProvider`
  - 提供版本信息和模块名称

#### 核心模块层 (`src/modules/`)
- **`PipelineBaseModule.ts`** - 流水线基础模块，所有Pipeline组件的基类
  - 继承自`rcc-basemodule`的`BaseModule`，提供统一的模块管理能力
  - 集成两阶段调试系统和I/O跟踪功能
  - 提供流水线特定的配置管理：`PipelineModuleConfig`
  - 实现流水线操作跟踪：`trackPipelineOperation()`
  - 提供流水线阶段记录：`recordPipelineStage()`
  - 集成错误处理中心：`handlePipelineError()`
  - 支持动态配置更新和指标收集

#### 框架层 (`src/framework/`)

##### 调度器组件
- **`PipelineScheduler.ts`** - 流水线调度器，核心调度逻辑实现
  - 处理单个虚拟模型的调度任务
  - 实现多种负载均衡策略：round-robin, weighted, least-connections, random
  - 提供熔断器机制和故障恢复
  - 支持请求队列和优先级管理
  - 实现并发控制和资源管理
  - 提供健康检查和性能指标收集
  - 定义调度器配置接口：`SchedulerConfig`
  - 被`VirtualModelSchedulerManager`使用来管理虚拟模型调度

- **`VirtualModelSchedulerManager.ts`** - 虚拟模型调度管理器
  - 管理多个虚拟模型的调度器实例
  - 提供虚拟模型注册和注销功能
  - 实现自动扩缩容机制
  - 提供统一的请求执行接口：`execute()`, `executeStreaming()`
  - 集成健康检查和指标监控
  - 支持虚拟模型映射和生命周期管理

##### 流水线组件
- **`Pipeline.ts`** - 流水线执行器，管理多个目标的负载均衡
  - 实现流水线目标管理：`PipelineTarget`
  - 提供多种负载均衡策略的具体实现
  - 支持流式和非流式请求执行
  - 实现健康检查和故障转移
  - 提供详细的执行结果：`PipelineExecutionResult`
  - 集成请求跟踪和性能监控

- **`PipelineFactory.ts`** - 流水线工厂，从配置创建流水线实例
  - 从虚拟模型配置创建流水线：`createPipelineFromVirtualModel()`
  - 提供配置验证：`validateVirtualModelConfig()`, `validatePipelineConfig()`
  - 支持批量创建：`createPipelinesFromVirtualModels()`
  - 提供测试流水线创建：`createTestPipeline()`
  - 实现配置克隆和工厂配置管理

- **`PipelineTracker.ts`** - 流水线跟踪器，请求ID和流水线跟踪系统
  - 实现请求上下文管理：`RequestContextImpl`
  - 提供流水线阶段管理：`PipelineStageImpl`, `PipelineStageManagerImpl`
  - 实现阶段工厂：`PipelineStageFactoryImpl`
  - 提供请求生命周期跟踪
  - 支持阶段状态管理和统计信息收集
  - 集成rcc-basemodule的两阶段调试系统和I/O跟踪

##### Provider组件
- **`BaseProvider.ts`** - 基础Provider类，定义AI模型提供商的标准接口
  - 继承自`PipelineBaseModule`，具备完整的调试能力
  - 实现标准OpenAI聊天接口：`chat()`, `streamChat()`
  - 提供抽象方法：`executeChat()`, `executeStreamChat()`
  - 实现响应标准化：`standardizeResponse()`
  - 支持兼容性模块：`CompatibilityModule`
  - 提供健康检查和Provider信息管理
  - 集成I/O跟踪和错误处理

##### OpenAI接口
- **`OpenAIInterface.ts`** - OpenAI兼容接口定义
  - 定义标准的OpenAI请求和响应格式
  - 提供类型安全的接口定义
  - 支持流式和非流式响应格式

##### 调试和日志组件
- **`PipelineTracker.ts`** - 流水线跟踪器，集成了rcc-basemodule的两阶段调试系统
  - 实现请求上下文管理和I/O跟踪
  - 提供流水线阶段管理和状态跟踪
  - 集成PipelineIOEntry记录完整的请求生命周期
  - 支持调试配置和性能指标收集

#### Provider实现层 (`src/providers/`)

- **`qwen.ts`** - Qwen Provider实现
  - 继承自`BaseProvider`，实现Qwen API的完整集成
  - 支持OAuth 2.0 Device Flow认证流程
  - 实现自动token刷新和失败重试机制
  - 提供完整的聊天和流式聊天功能：`executeChat()`, `executeStreamChat()`
  - 支持工具调用和OpenAI格式转换
  - 集成PKCE验证和设备授权流程
  - 提供健康检查和模型列表获取
  - 实现token存储和管理
  - 支持多种Qwen模型：qwen-turbo, qwen-plus, qwen-max, qwen3-coder-plus等

- **`iflow.ts`** - iFlow Provider实现
  - 继承自`BaseProvider`，实现iFlow API的完整集成
  - 支持OAuth和API Key两种认证模式
  - 复用iflow现有的OAuth凭据文件
  - 实现自动认证凭据加载和刷新
  - 提供完整的聊天和流式聊天功能
  - 支持工具调用和OpenAI格式转换
  - 实现OAuth Device Flow和token管理
  - 提供认证状态检查和重建功能
  - 支持多种认证模式的无缝切换

#### 接口定义层 (`src/interfaces/`)

- **`IRequestContext.ts`** - 请求上下文接口，集成rcc-basemodule的PipelineIOEntry
  - 定义请求上下文的标准接口
  - 提供请求生命周期管理方法
  - 支持阶段管理和元数据操作

- **`IPipelineStage.ts`** - 流水线阶段接口
  - 定义流水线阶段的标准接口
  - 提供阶段工厂和管理器接口
  - 支持阶段状态和数据管理

- **`ILogEntries.ts`** - 日志条目接口，集成rcc-basemodule的PipelineIOEntry
  - 定义日志条目的标准格式和I/O跟踪接口
  - 提供日志类型和级别定义

- **`IAuthManager.ts`** - 认证管理器接口
  - 定义认证管理的标准接口
  - 支持多种认证方式的抽象

- **`ICompatibility.ts`** - 兼容性接口
  - 定义Provider兼容性的接口
  - 支持请求和响应格式转换

#### 类型定义层 (`src/types/`)

- **`virtual-model.ts`** - 虚拟模型类型定义
  - 定义虚拟模型配置和相关类型
  - 包括目标配置、能力定义等
  - 支持虚拟模型的完整类型系统

#### 核心处理层 (`src/core/`)

- **`PipelineProcessor.ts`** - 流水线处理器
  - 实现流水线的核心处理逻辑
  - 提供请求处理和响应管理
  - 集成各个组件的协调工作

### 分层架构设计

```
RCC Pipeline Module (sharedmodule/pipeline)
├── 管理层 (Management Layer)
│   ├── VirtualModelSchedulerManager (虚拟模型调度管理器)
│   └── PipelineFactory (流水线工厂)
├── 调度层 (Scheduling Layer)
│   ├── PipelineScheduler (流水线调度器)
│   └── Pipeline (流水线执行器)
├── 跟踪层 (Tracking Layer)
│   ├── PipelineTracker (请求跟踪器)
│   ├── IRequestContext (请求上下文接口)
│   ├── IPipelineStage (流水线阶段接口)
│   └── ILogEntries (日志条目接口)
├── 提供者层 (Provider Layer)
│   ├── BaseProvider (基础提供者抽象)
│   ├── QwenProvider (Qwen AI提供者)
│   ├── IFlowProvider (iFlow提供者)
│   └── OpenAIInterface (OpenAI兼容接口)
└── 基础层 (Base Layer)
    ├── PipelineBaseModule (流水线基础模块)
    ├── 类型定义 (virtual-model)
    └── 调试集成 (rcc-basemodule TwoPhaseDebug系统)
```

### 核心组件职责

#### 1. PipelineBaseModule (流水线基础模块)
- **继承**: `BaseModule` (rcc-basemodule)
- **职责**:
  - 提供所有pipeline组件的基础功能
  - 集成两阶段调试系统
  - I/O跟踪和请求生命周期管理
  - 错误处理和恢复机制
- **关键特性**:
  - 模块化设计，易于扩展
  - 完整的调试支持
  - 标准化的错误处理

#### 2. PipelineScheduler (流水线调度器)
- **职责**:
  - 请求调度和负载均衡
  - 并发控制和资源管理
  - 熔断器机制和故障恢复
  - 请求队列和优先级管理
- **核心算法**:
  - 多种负载均衡策略 (round-robin, random, weighted, least-connections)
  - 智能熔断器机制
  - 动态资源分配

#### 3. PipelineTracker (流水线跟踪器)
- **职责**:
  - 请求ID生成和管理
  - 流水线阶段跟踪
  - 执行状态监控
  - 性能指标收集
- **关键组件**:
  - `RequestContextImpl`: 请求上下文实现
  - `PipelineStageImpl`: 流水线阶段实现
  - `PipelineStageManagerImpl`: 阶段管理器

#### 4. BaseProvider (基础提供者)
- **职责**:
  - 定义AI模型提供商的标准接口
  - 提供OAuth 2.0认证支持
  - 实现请求/响应标准化
  - 处理流式响应
- **关键特性**:
  - 统一的API接口
  - 自动token管理
  - 错误处理和重试

## 外部依赖关系

### RCC框架依赖

```typescript
// 核心框架
import { BaseModule, ModuleInfo, DebugConfig } from 'rcc-basemodule';        // v0.1.8
import { ErrorHandlingCenter } from 'rcc-errorhandling';                  // v1.0.3

// 配置管理
import { createConfigParser, createConfigLoader } from 'rcc-config-parser'; // v0.1.0

// 虚拟模型规则
import { VirtualModelRulesModule } from 'rcc-virtual-model-rules';        // v1.0.5
```

### 第三方库依赖

```typescript
// HTTP请求处理
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';          // v1.12.2

// OAuth认证支持
import open from 'open';                                                   // v10.2.0

// Node.js内置模块
import crypto from 'crypto';      // PKCE验证器生成
import fs from 'fs';              // Token文件管理
import path from 'path';          // 文件路径处理
import os from 'os';              // 系统信息获取
```

## 流水线执行流程

### 请求生命周期

```
1. 请求接收 → 2. 上下文创建 → 3. 调度决策 → 4. 流水线选择 → 5. 认证检查 → 6. API执行 → 7. 响应处理
     ↓              ↓              ↓              ↓              ↓           ↓           ↓
 Request ID     Pipeline       Load Balance   Provider       OAuth        API Call     Response
 Generation     Tracking       Strategy       Selection      Validation   Execution   Processing
```

### 详细执行步骤

#### 步骤1: 请求初始化
```typescript
// 创建请求上下文
const context = await pipelineTracker.createRequestContext(
  providerName,
  operationType,
  metadata
);

// 生成唯一请求ID
const requestId = pipelineTracker.generateRequestId();

// 记录请求开始
pipelineTracker.addStage(requestId, 'request-init');
```

#### 步骤2: 调度决策
```typescript
// 调度器处理请求
const scheduledRequest: ScheduledRequest = {
  id: requestId,
  data: requestData,
  priority: requestPriority,
  timeout: requestTimeout,
  timestamp: Date.now(),
  context: context
};

// 检查并发限制和熔断器状态
if (scheduler.canExecuteRequest(requestId)) {
  // 立即执行
  return scheduler.executeImmediately(scheduledRequest);
} else {
  // 加入队列等待
  return scheduler.enqueueRequest(scheduledRequest);
}
```

#### 步骤3: 流水线选择
```typescript
// 根据负载均衡策略选择流水线
const selectedPipeline = scheduler.selectPipeline();

// 健康检查
if (!selectedPipeline.isHealthy()) {
  throw new Error('Selected pipeline is not healthy');
}

// 分配资源
await selectedPipeline.allocateResources();
```

#### 步骤4: 认证检查
```typescript
// 检查OAuth token有效性
if (provider.requiresAuthentication()) {
  const tokens = await provider.getValidTokens();
  if (!tokens) {
    // 启动设备流程获取新token
    await provider.initiateDeviceFlow();
  }
}
```

#### 步骤5: API执行
```typescript
// 执行实际的API调用
try {
  const result = await provider.executeChat(request);

  // 记录成功
  pipelineTracker.completeStage(requestId, 'api-execution', {
    success: true,
    duration: Date.now() - startTime,
    response: result
  });

  return result;
} catch (error) {
  // 记录失败
  pipelineTracker.completeStage(requestId, 'api-execution', {
    success: false,
    duration: Date.now() - startTime,
    error: error.message
  });

  throw error;
}
```

#### 步骤6: 响应处理和清理
```typescript
// 格式化响应
const formattedResponse = provider.formatResponse(result);

// 释放资源
await selectedPipeline.releaseResources();

// 完成请求跟踪
const finalContext = pipelineTracker.completeRequest(requestId);

// 记录性能指标
scheduler.recordPerformanceMetrics(finalContext);

return formattedResponse;
```

## 调度器和负载均衡机制

### PipelineScheduler核心机制

#### 数据结构
```typescript
class PipelineScheduler {
  private pipelines: Map<string, Pipeline> = new Map();
  private requestQueue: ScheduledRequest[] = [];
  private activeRequests: Map<string, Promise<any>> = new Map();
  private circuitBreakerState: CircuitBreakerState;
  private metrics: SchedulerMetrics;

  // 配置参数
  private config: SchedulerConfig = {
    maxConcurrentRequests: 10,
    requestTimeout: 30000,
    loadBalancingStrategy: 'round-robin',
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000
    }
  };
}
```

#### 调度算法实现

```typescript
public async scheduleRequest(
  requestId: string,
  data: any,
  priority: number = 0,
  timeout: number = 30000,
  context?: RequestContext
): Promise<any> {
  // 1. 检查熔断器状态
  if (this.circuitBreakerState.tripped) {
    throw new Error('Circuit breaker is tripped');
  }

  // 2. 检查并发限制
  if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
    // 加入队列
    return this.enqueueRequest({
      id: requestId,
      data,
      priority,
      timeout,
      context
    });
  }

  // 3. 选择流水线
  const pipeline = this.selectPipeline();
  if (!pipeline) {
    throw new Error('No available pipelines');
  }

  // 4. 执行请求
  return this.executeRequest(requestId, data, pipeline, context);
}
```

### 负载均衡策略

#### 1. Round Robin (轮询)
```typescript
private selectPipelineRoundRobin(): Pipeline | null {
  const healthyPipelines = Array.from(this.pipelines.values())
    .filter(p => p.isHealthy());

  if (healthyPipelines.length === 0) return null;

  const selected = healthyPipelines[this.currentRoundRobinIndex % healthyPipelines.length];
  this.currentRoundRobinIndex++;
  return selected;
}
```

#### 2. Weighted (权重)
```typescript
private selectPipelineWeighted(): Pipeline | null {
  const healthyPipelines = Array.from(this.pipelines.values())
    .filter(p => p.isHealthy());

  if (healthyPipelines.length === 0) return null;

  // 计算总权重
  const totalWeight = healthyPipelines.reduce((sum, p) => sum + (p.weight || 1), 0);

  // 随机选择权重区间
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  for (const pipeline of healthyPipelines) {
    currentWeight += pipeline.weight || 1;
    if (random <= currentWeight) {
      return pipeline;
    }
  }

  return healthyPipelines[healthyPipelines.length - 1];
}
```

#### 3. Least Connections (最少连接)
```typescript
private selectPipelineLeastConnections(): Pipeline | null {
  const healthyPipelines = Array.from(this.pipelines.values())
    .filter(p => p.isHealthy());

  if (healthyPipelines.length === 0) return null;

  // 选择活跃连接最少的流水线
  return healthyPipelines.reduce((best, current) => {
    const bestConnections = this.getActiveConnections(best.id);
    const currentConnections = this.getActiveConnections(current.id);

    return currentConnections < bestConnections ? current : best;
  });
}
```

### 熔断器机制

```typescript
interface CircuitBreakerState {
  tripped: boolean;           // 是否触发熔断
  tripTime: number;           // 熔断触发时间
  failureCount: number;       // 失败计数
  lastFailureTime: number;    // 最后失败时间
  successCount: number;       // 成功计数（用于恢复）
}

private checkCircuitBreaker(): boolean {
  const now = Date.now();
  const config = this.config.circuitBreaker;

  if (!config.enabled) return false;

  // 检查是否需要触发熔断
  if (!this.circuitBreakerState.tripped) {
    if (this.circuitBreakerState.failureCount >= config.failureThreshold) {
      this.circuitBreakerState.tripped = true;
      this.circuitBreakerState.tripTime = now;
      this.logger.warn('Circuit breaker tripped due to high failure rate');
    }
  }

  // 检查是否可以恢复
  if (this.circuitBreakerState.tripped) {
    if (now - this.circuitBreakerState.tripTime > config.recoveryTimeout) {
      this.circuitBreakerState.tripped = false;
      this.circuitBreakerState.failureCount = 0;
      this.circuitBreakerState.successCount = 0;
      this.logger.info('Circuit breaker recovered');
    }
  }

  return this.circuitBreakerState.tripped;
}
```

## 错误处理和恢复机制

### 分层错误处理

#### 1. 提供者层错误
- **API调用失败**: 网络错误、超时、服务器错误
- **认证失败**: Token过期、权限不足
- **模型错误**: 模型不可用、配额用尽

#### 2. 调度器层错误
- **超时错误**: 请求执行超时
- **资源不足**: 并发限制达到上限
- **熔断器触发**: 故障率过高

#### 3. 系统层错误
- **配置错误**: 无效的配置参数
- **资源耗尽**: 内存不足、磁盘空间不足
- **系统异常**: 未预期的系统错误

### 自动恢复策略

#### Token自动刷新
```typescript
class QwenProvider extends BaseProvider {
  async ensureValidTokens(): Promise<OAuthTokens> {
    if (this.isTokenExpired()) {
      try {
        // 刷新access token
        const newTokens = await this.refreshAccessToken();
        this.saveTokens(newTokens);
        return newTokens;
      } catch (refreshError) {
        // 如果refresh失败，启动完整的设备流程
        return this.initiateDeviceFlow();
      }
    }
    return this.tokens;
  }
}
```

#### 请求重试机制
```typescript
private async executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }

      // 指数退避
      const delay = Math.pow(backoffMultiplier, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

## 性能监控和指标

### 关键性能指标

#### 请求指标
```typescript
interface RequestMetrics {
  requestId: string;
  provider: string;
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'error';
  error?: string;
  pipelineId: string;
  retryCount: number;
}
```

#### 系统指标
```typescript
interface SystemMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  throughput: number;        // 请求/秒
  activeConnections: number;
  queueLength: number;
  memoryUsage: number;
  cpuUsage: number;
}
```

### 实时监控
```typescript
class PerformanceMonitor {
  private metrics: SystemMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    throughput: 0,
    activeConnections: 0,
    queueLength: 0,
    memoryUsage: 0,
    cpuUsage: 0
  };

  public recordRequest(request: RequestMetrics): void {
    this.metrics.totalRequests++;

    if (request.status === 'success') {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // 更新平均响应时间
    this.metrics.averageResponseTime = this.calculateAverageResponseTime(request);

    // 更新吞吐量
    this.metrics.throughput = this.calculateThroughput();
  }

  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }
}
```

## 配置管理

### 配置层次结构
```typescript
interface PipelineModuleConfig {
  // 基础信息
  id: string;
  name: string;
  version: string;
  type: 'provider' | 'scheduler' | 'tracker' | 'pipeline';

  // 流水线配置
  providerName?: string;
  endpoint?: string;
  supportedModels?: string[];
  maxConcurrentRequests?: number;

  // 调度器配置
  loadBalancingStrategy?: 'round-robin' | 'random' | 'weighted' | 'least-connections';
  requestTimeout?: number;

  // 熔断器配置
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
  };

  // 调试配置
  enableTwoPhaseDebug?: boolean;
  enableIOTracking?: boolean;

  // OAuth配置
  oauth?: {
    clientId: string;
    clientSecret: string;
    scopes: string[];
  };
}
```

### 动态配置更新
```typescript
class PipelineBaseModule {
  private config: PipelineModuleConfig;

  public updateConfig(newConfig: Partial<PipelineModuleConfig>): void {
    // 验证新配置
    this.validateConfig(newConfig);

    // 更新配置
    this.config = { ...this.config, ...newConfig };

    // 重新初始化组件
    this.reinitializeComponents();

    // 通知其他模块
    this.emit('configUpdated', this.config);
  }
}
```

## 与其他模块的集成

### 与rcc-server集成
```typescript
// 在server模块中使用pipeline
import { PipelineScheduler } from 'rcc-pipeline';

class ServerModule {
  private pipelineScheduler: PipelineScheduler;

  public async initialize(): Promise<void> {
    // 创建pipeline调度器
    this.pipelineScheduler = new PipelineScheduler({
      pipelines: this.createPipelines(),
      loadBalancer: {
        strategy: 'weighted',
        healthCheckInterval: 30000
      }
    });

    // 注册请求处理器
    this.registerRequestHandler();
  }

  private async handleRequest(request: ClientRequest): Promise<ClientResponse> {
    // 通过pipeline处理请求
    return this.pipelineScheduler.scheduleRequest(
      request.id,
      request,
      request.priority || 0,
      request.timeout || 30000
    );
  }
}
```

### 与rcc-configuration集成
```typescript
// 配置驱动的pipeline创建
import { createConfigLoader } from 'rcc-config-parser';

class PipelineManager {
  public async createPipelinesFromConfig(): Promise<Pipeline[]> {
    const configLoader = createConfigLoader();
    const pipelineConfigs = await configLoader.loadPipelineConfigs();

    return pipelineConfigs.map(config => this.createPipeline(config));
  }
}
```

## 扩展性设计

### 添加新的Provider
```typescript
// 1. 继承BaseProvider
class CustomProvider extends BaseProvider {
  async authenticate(): Promise<void> {
    // 实现自定义认证逻辑
  }

  async executeChat(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    // 实现自定义API调用逻辑
  }
}

// 2. 注册Provider
const customProvider = new CustomProvider({
  name: 'Custom',
  endpoint: 'https://api.custom.com/v1/chat',
  supportedModels: ['custom-model-1', 'custom-model-2']
});

pipelineScheduler.registerProvider(customProvider);
```

### 添加新的调度策略
```typescript
// 1. 实现调度策略接口
class CustomLoadBalancingStrategy implements LoadBalancingStrategy {
  selectPipeline(pipelines: Pipeline[]): Pipeline | null {
    // 实现自定义选择逻辑
  }
}

// 2. 注册策略
scheduler.registerLoadBalancingStrategy('custom', new CustomLoadBalancingStrategy());
```

## API 参考

### PipelineBaseModule

```typescript
class PipelineBaseModule extends BaseModule {
  constructor(config: PipelineModuleConfig);

  // 带I/O跟踪的流水线操作
  async trackPipelineOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    inputData?: any,
    operationType: string = 'pipeline-operation'
  ): Promise<T>;

  // 获取模块状态
  getStatus(): PipelineModuleStatus;

  // 更新配置
  updateConfig(newConfig: Partial<PipelineModuleConfig>): void;
}
```

### PipelineScheduler

```typescript
class PipelineScheduler {
  constructor(
    virtualModelId: string,
    config: SchedulerConfig,
    pipelineTracker: PipelineTracker
  );

  // 调度请求
  async execute(
    request: any,
    operation: OperationType,
    options?: SchedulerOptions
  ): Promise<any>;

  // 流式请求
  async *executeStreaming(
    request: any,
    operation: OperationType,
    options?: SchedulerOptions
  ): AsyncGenerator<any, void, unknown>;

  // 添加流水线
  addPipeline(pipeline: Pipeline): void;

  // 获取性能指标
  getMetrics(): SchedulerMetrics;

  // 获取健康状态
  getHealth(): SchedulerHealth;
}
```

### PipelineTracker

```typescript
class PipelineTracker extends PipelineBaseModule {
  constructor();

  // 创建请求上下文
  createRequestContext(
    provider: string,
    operation: 'chat' | 'streamChat' | 'healthCheck',
    metadata?: Record<string, any>
  ): IRequestContext;

  // 添加流水线阶段
  addStage(requestId: string, stageName: string): void;

  // 完成阶段
  completeStage(requestId: string, stageName: string, data?: any): void;

  // 完成请求
  completeRequest(requestId: string): IRequestContext | undefined;

  // 获取请求统计
  getRequestStatistics(): {
    activeRequests: number;
    totalStages: number;
    completedStages: number;
    failedStages: number;
    runningStages: number;
  };
}
```

### QwenProvider

```typescript
class QwenProvider extends BaseProvider {
  constructor(config: ProviderConfig);

  // OAuth设备流程
  async initiateDeviceFlow(autoOpen: boolean = true): Promise<DeviceFlowData>;
  async waitForDeviceAuthorization(deviceCode: string, pkceVerifier: string): Promise<OAuthTokens>;

  // 聊天完成
  async executeChat(request: OpenAIChatRequest): Promise<OpenAIChatResponse>;

  // 流式聊天
  async *executeStreamChat(request: OpenAIChatRequest): AsyncGenerator<OpenAIChatResponse>;

  // 健康检查
  async healthCheck(): Promise<ProviderHealthStatus>;
}
```

## 配置选项

### PipelineModuleConfig

```typescript
interface PipelineModuleConfig {
  // 基础信息
  id: string;
  name: string;
  version: string;
  type: 'provider' | 'scheduler' | 'tracker' | 'pipeline';

  // 流水线配置
  providerName?: string;
  endpoint?: string;
  supportedModels?: string[];
  maxConcurrentRequests?: number;

  // 调度器配置
  loadBalancingStrategy?: 'round-robin' | 'random' | 'weighted' | 'least-connections';
  requestTimeout?: number;

  // 熔断器配置
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
  };

  // 调试配置
  enableTwoPhaseDebug?: boolean;
  enableIOTracking?: boolean;

  // OAuth配置
  oauth?: {
    clientId: string;
    clientSecret: string;
    scopes: string[];
  };
}
```

### SchedulerConfig

```typescript
interface SchedulerConfig {
  maxConcurrentRequests: number;
  requestTimeout: number;
  healthCheckInterval: number;
  retryStrategy: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  loadBalancingStrategy: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}
```

## 错误处理

### 分层错误处理

Pipeline模块提供完整的错误处理机制：

```typescript
try {
  const response = await scheduler.execute(
    'request-123',
    request,
    'chat',
    { timeout: 30000 }
  );

  console.log('Success:', response);
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.error('Circuit breaker is tripped:', error.message);
  } else if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded:', error.message);
  } else {
    console.error('Request failed:', error.message);
  }
}
```

### 自动恢复机制

- **Token自动刷新**: OAuth token过期自动刷新
- **请求重试**: 指数退避重试策略
- **熔断器**: 故障自动隔离和恢复
- **健康检查**: 定期检查组件状态

## 性能监控

### 关键指标

```typescript
// 获取性能指标
const metrics = scheduler.getMetrics();

console.log('System Metrics:', {
  totalRequests: metrics.totalRequests,
  successfulRequests: metrics.successfulRequests,
  failedRequests: metrics.failedRequests,
  averageResponseTime: metrics.averageResponseTime,
  activeRequests: metrics.activeRequests,
  queueLength: metrics.queueLength
});
```

### 实时监控

```typescript
// 监控系统健康
const health = scheduler.getHealth();

console.log('System Health:', {
  status: health.status,
  checks: health.checks,
  details: health.details
});
```

## 开发指南

### 添加新的Provider

1. **继承BaseProvider**:
```typescript
class CustomProvider extends BaseProvider {
  async authenticate(): Promise<void> {
    // 实现认证逻辑
  }

  async executeChat(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    // 实现API调用逻辑
  }
}
```

2. **注册Provider**:
```typescript
const customProvider = new CustomProvider(config);
await scheduler.registerProvider(customProvider);
```

### 添加新的负载均衡策略

```typescript
class CustomStrategy implements LoadBalancingStrategy {
  selectPipeline(pipelines: Pipeline[]): Pipeline | null {
    // 实现选择逻辑
  }
}

scheduler.registerLoadBalancingStrategy('custom', new CustomStrategy());
```

## 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "scheduler"

# 运行覆盖率测试
npm run test:coverage

# 运行集成测试
npm run test:integration
```

## 最佳实践

### 1. 配置管理
- 使用环境变量管理敏感信息
- 实现配置验证和默认值
- 支持动态配置更新

### 2. 错误处理
- 实现分层错误处理
- 使用结构化错误信息
- 提供详细的错误上下文

### 3. 性能优化
- 合理设置并发限制
- 使用连接池复用资源
- 实现智能缓存策略

### 4. 监控和日志
- 记录详细的请求追踪信息
- 实现实时性能监控
- 设置合理的日志级别

## 贡献指南

1. Fork 项目
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送到分支: `git push origin feature/amazing-feature`
5. 创建Pull Request

## 许可证

本项目采用MIT许可证 - 详见 [LICENSE](LICENSE) 文件

## 支持

如有问题，请在 [GitHub Issues](https://github.com/rcc/rcc-pipeline/issues) 页面提交问题。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md) 了解版本历史和更改。

## 相关项目

- [RCC Base Module](https://github.com/rcc/rcc-basemodule) - 核心框架基础模块
- [RCC Error Handling](https://github.com/rcc/rcc-errorhandling) - 错误处理中心
- [RCC Config Parser](https://github.com/rcc/rcc-config-parser) - 配置管理模块
- [RCC Server](https://github.com/rcc/rcc-server) - HTTP服务器模块
- [RCC Virtual Model Rules](https://github.com/rcc/rcc-virtual-model-rules) - 虚拟模型路由规则

---

**使用 ❤️ 构建 by RCC开发团队**