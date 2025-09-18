# WebAuto 操作子库架构设计文档

## 📋 概述

操作子库是 WebAuto 平台的基础组件层，提供六大类别的原子操作单元。每个操作子都是可独立执行的最小功能单元，通过标准化接口支持组合和复用。

## 🏗️ 整体架构

### 操作子分类体系

```
操作子库 (Operations Framework)
├── 浏览器操作子 (Browser Operations)
├── 文件操作子 (File Operations)
├── AI模型操作子 (AI Model Operations)
├── 通信操作子 (Communication Operations)
├── 数据处理操作子 (Data Processing Operations)
└── 系统操作子 (System Operations)
```

### 核心设计原则

1. **原子性**: 每个操作子执行单一、明确的功能
2. **标准化**: 统一的接口和执行模式
3. **可组合**: 支持通过工作流引擎组合使用
4. **配置驱动**: 通过 JSON 配置控制行为
5. **错误隔离**: 操作子失败不影响其他操作子

## 📦 详细架构设计

### 1. 浏览器操作子 (Browser Operations)

#### 职责范围
处理浏览器相关的所有操作，包括页面导航、元素操作、内容提取等

#### 核心能力
- 页面加载和导航管理
- DOM 元素交互和操作
- 内容提取和分析
- 浏览器会话和 Cookie 管理
- 反检测和指纹管理

#### 操作子结构
```
browser/
├── navigation/
│   ├── PageNavigationOperation     # 页面导航
│   ├── TabManagementOperation      # 标签页管理
│   └── HistoryManagementOperation  # 历史记录管理
├── interaction/
│   ├── ElementClickOperation       # 元素点击
│   ├── FormFillOperation          # 表单填写
│   ├── ScrollOperation            # 页面滚动
│   └── ScreenshotOperation       # 截图操作
├── content/
│   ├── ContentExtractionOperation # 内容提取
│   ├── LinkExtractionOperation    # 链接提取
│   ├── ImageExtractionOperation   # 图片提取
│   └── VideoExtractionOperation   # 视频提取
├── analysis/
│   ├── PageStructureOperation     # 页面结构分析
│   ├── ElementAnalysisOperation   # 元素分析
│   └── ContentAnalysisOperation  # 内容分析
└── session/
    ├── SessionManagementOperation # 会话管理
    ├── CookieManagementOperation  # Cookie管理
    └── AntiDetectionOperation     # 反检测操作
```

#### 配置示例
```json
{
  "operation": "PageNavigationOperation",
  "config": {
    "url": "https://weibo.com/1671109627",
    "waitForSelector": ".WB_cardwrap",
    "timeout": 30000,
    "retryAttempts": 3,
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
  }
}
```

### 2. 文件操作子 (File Operations)

#### 职责范围
处理文件系统相关的所有操作，包括文件读写、格式转换、存储管理等

#### 核心能力
- 文件和目录的读写操作
- 多格式数据转换（JSON、CSV、XML、Markdown）
- 压缩和解压处理
- 本地和云存储管理
- 文件备份和版本控制

#### 操作子结构
```
file/
├── basic/
│   ├── FileReadOperation          # 文件读取
│   ├── FileWriteOperation         # 文件写入
│   ├── FileDeleteOperation        # 文件删除
│   └── FileCopyOperation         # 文件复制
├── directory/
│   ├── DirectoryCreateOperation   # 目录创建
│   ├── DirectoryListOperation     # 目录列表
│   ├── DirectoryDeleteOperation  # 目录删除
│   └── DirectoryMoveOperation    # 目录移动
├── format/
│   ├── JSONOperation             # JSON格式处理
│   ├── CSVOperation              # CSV格式处理
│   ├── XMLOperation              # XML格式处理
│   └── MarkdownOperation         # Markdown格式处理
├── compression/
│   ├── ZipOperation              # ZIP压缩
│   ├── GzipOperation             # Gzip压缩
│   └── TarOperation              # Tar压缩
└── storage/
    ├── LocalStorageOperation      # 本地存储
    ├── CloudStorageOperation      # 云存储
    └── BackupOperation           # 备份操作
```

#### 配置示例
```json
{
  "operation": "JSONOperation",
  "config": {
    "action": "read",
    "filePath": "./data/profile-posts-50.json",
    "encoding": "utf8",
    "validateSchema": true,
    "backupOnWrite": true
  }
}
```

### 3. AI模型操作子 (AI Model Operations)

#### 职责范围
处理AI模型相关的所有操作，包括模型调用、推理处理、结果分析等

#### 核心能力
- 多模型推理和管理
- 文本、图像、多模态处理
- 内容分析和情感识别
- 提示词优化和模型选择
- 缓存管理和资源优化

#### 操作子结构
```
ai/
├── inference/
│   ├── TextInferenceOperation    # 文本推理
│   ├── ImageInferenceOperation   # 图像推理
│   ├── MultiModalOperation       # 多模态推理
│   └── BatchInferenceOperation   # 批量推理
├── processing/
│   ├── TextProcessingOperation   # 文本处理
│   ├── ImageProcessingOperation  # 图像处理
│   ├── AudioProcessingOperation  # 音频处理
│   └── VideoProcessingOperation  # 视频处理
├── analysis/
│   ├── ContentAnalysisOperation  # 内容分析
│   ├── SentimentAnalysisOperation # 情感分析
│   ├── EntityRecognitionOperation # 实体识别
│   └── QualityAnalysisOperation  # 质量分析
├── optimization/
│   ├── PromptOptimizationOperation # 提示词优化
│   ├── ModelSelectionOperation    # 模型选择
│   └── ResultOptimizationOperation # 结果优化
└── management/
    ├── ModelManagementOperation  # 模型管理
    ├── CacheManagementOperation  # 缓存管理
    └── ResourceManagementOperation # 资源管理
```

#### 配置示例
```json
{
  "operation": "ContentAnalysisOperation",
  "config": {
    "model": "gpt-4",
    "content": "${extractedContent}",
    "analysisType": "sentiment",
    "maxTokens": 1000,
    "temperature": 0.7,
    "cacheKey": "sentiment-analysis-${contentHash}"
  }
}
```

### 4. 通信操作子 (Communication Operations)

#### 职责范围
处理通信相关的所有操作，包括网络请求、API调用、消息传递等

#### 核心能力
- HTTP/HTTPS 请求处理
- API 客户端和认证管理
- 消息队列和实时通信
- 协议转换和代理支持
- 健康检查和监控告警

#### 操作子结构
```
communication/
├── http/
│   ├── HttpRequestOperation      # HTTP请求
│   ├── HttpResponseOperation     # HTTP响应
│   ├── APIClientOperation        # API客户端
│   └── WebhookOperation          # Webhook处理
├── messaging/
│   ├── MessageQueueOperation    # 消息队列
│   ├── PubSubOperation          # 发布订阅
│   ├── StreamingOperation       # 流式传输
│   └── BroadcastOperation       # 广播操作
├── protocol/
│   ├── RestAPIOperation         # REST API
│   ├── GraphQLOperation         # GraphQL
│   ├── WebSocketOperation       # WebSocket
│   └── MCIPOperation            # MCP协议
├── auth/
│   ├── AuthenticationOperation  # 身份验证
│   ├── AuthorizationOperation   # 授权管理
│   ├── TokenManagementOperation # 令牌管理
│   └── SecurityOperation        # 安全操作
└── monitoring/
    ├── HealthCheckOperation     # 健康检查
    ├── MetricsOperation         # 指标收集
    ├── LoggingOperation         # 日志操作
    └── AlertOperation           # 告警操作
```

#### 配置示例
```json
{
  "operation": "WebhookOperation",
  "config": {
    "url": "https://api.example.com/webhook",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer ${token}"
    },
    "payload": "${workflowResults}",
    "retryAttempts": 3,
    "timeout": 10000
  }
}
```

### 5. 数据处理操作子 (Data Processing Operations)

#### 职责范围
处理数据验证、转换、聚合等数据处理操作

#### 核心能力
- 数据验证和清洗
- 格式转换和标准化
- 数据聚合和统计
- 数据过滤和排序
- 数据加密和脱敏

#### 操作子结构
```
data/
├── validation/
│   ├── DataValidationOperation   # 数据验证
│   ├── SchemaValidationOperation # 模式验证
│   ├── TypeCheckOperation       # 类型检查
│   └── RangeValidationOperation # 范围验证
├── transformation/
│   ├── DataTransformOperation    # 数据转换
│   ├── FormatConversionOperation # 格式转换
│   ├── NormalizationOperation    # 数据标准化
│   └── AggregationOperation      # 数据聚合
├── filtering/
│   ├── DataFilterOperation       # 数据过滤
│   ├── SortingOperation          # 数据排序
│   ├── DeduplicationOperation    # 去重操作
│   └── MaskingOperation          # 数据脱敏
└── encryption/
    ├── DataEncryptionOperation   # 数据加密
    ├── DataDecryptionOperation   # 数据解密
    ├── HashOperation             # 哈希计算
    └── CompressionOperation     # 数据压缩
```

#### 配置示例
```json
{
  "operation": "DataTransformOperation",
  "config": {
    "inputData": "${extractedPosts}",
    "transformations": [
      {
        "type": "map",
        "field": "content",
        "operation": "truncate",
        "maxLength": 500
      },
      {
        "type": "calculate",
        "field": "engagementScore",
        "formula": "likes * 1 + comments * 2 + reposts * 3"
      }
    ],
    "outputFormat": "array"
  }
}
```

### 6. 系统操作子 (System Operations)

#### 职责范围
处理系统级别的操作，包括日志记录、监控告警、资源管理等

#### 核心能力
- 系统日志和审计
- 性能监控和指标收集
- 资源管理和清理
- 定时任务和调度
- 系统配置管理

#### 操作子结构
```
system/
├── logging/
│   ├── LogOperation              # 日志记录
│   ├── AuditOperation            # 审计日志
│   ├── LogRotationOperation      # 日志轮转
│   └── LogAnalysisOperation      # 日志分析
├── monitoring/
│   ├── PerformanceMonitorOperation # 性能监控
│   ├── ResourceMonitorOperation  # 资源监控
│   ├── MetricsCollectionOperation # 指标收集
│   └── HealthCheckOperation      # 健康检查
├── resource/
│   ├── MemoryManagementOperation  # 内存管理
│   ├── DiskManagementOperation   # 磁盘管理
│   ├── ProcessManagementOperation # 进程管理
│   └── NetworkManagementOperation # 网络管理
└── config/
    ├── ConfigLoadOperation       # 配置加载
    ├── ConfigValidationOperation # 配置验证
    ├── EnvironmentOperation      # 环境变量
    └── SecretManagementOperation # 密钥管理
```

#### 配置示例
```json
{
  "operation": "PerformanceMonitorOperation",
  "config": {
    "metrics": ["cpu", "memory", "disk", "network"],
    "interval": 5000,
    "thresholds": {
      "cpu": 80,
      "memory": 85,
      "disk": 90
    },
    "alertChannels": ["log", "webhook"],
    "historySize": 100
  }
}
```

## 🔧 操作子接口设计

### 基础操作子接口

```typescript
interface OperationConfig {
  id: string;
  name: string;
  description?: string;
  category: OperationCategory;
  version: string;
  timeout?: number;
  retryAttempts?: number;
  dependencies?: string[];
}

interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  metadata?: {
    executionTime: number;
    retries: number;
    memoryUsage: number;
    [key: string]: any;
  };
}

abstract class BaseOperation {
  protected config: OperationConfig;
  protected context: OperationContext;

  constructor(config: OperationConfig) {
    this.config = config;
  }

  abstract execute(input: any): Promise<OperationResult>;

  abstract validate(input: any): ValidationResult;

  abstract rollback(): Promise<void>;

  protected log(level: LogLevel, message: string, data?: any): void {
    this.context.logger.log(level, message, {
      operation: this.config.id,
      ...data
    });
  }
}
```

### 操作子上下文

```typescript
class OperationContext {
  constructor(
    public readonly executionId: string,
    public readonly workflowId: string,
    public readonly taskId: string,
    public readonly logger: Logger,
    public readonly cache: Cache,
    public readonly eventBus: EventBus,
    public readonly resourceManager: ResourceManager
  ) {}

  async storeData(key: string, data: any): Promise<void> {
    await this.cache.set(`${this.executionId}:${key}`, data);
  }

  async retrieveData(key: string): Promise<any> {
    return await this.cache.get(`${this.executionId}:${key}`);
  }

  emitEvent(event: string, data: any): void {
    this.eventBus.emit(`${this.workflowId}:${event}`, {
      taskId: this.taskId,
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      data
    });
  }
}
```

### 操作子注册器

```typescript
class OperationRegistry {
  private operations = new Map<string, typeof BaseOperation>();
  private metadata = new Map<string, OperationMetadata>();

  register<T extends BaseOperation>(
    id: string,
    operationClass: new (config: OperationConfig) => T,
    metadata: OperationMetadata
  ): void {
    this.operations.set(id, operationClass);
    this.metadata.set(id, metadata);
  }

  getOperation(id: string): typeof BaseOperation | undefined {
    return this.operations.get(id);
  }

  getMetadata(id: string): OperationMetadata | undefined {
    return this.metadata.get(id);
  }

  listOperations(category?: OperationCategory): OperationMetadata[] {
    const allMetadata = Array.from(this.metadata.values());
    return category
      ? allMetadata.filter(meta => meta.category === category)
      : allMetadata;
  }

  validateDependencies(operationId: string): ValidationResult {
    const metadata = this.metadata.get(operationId);
    if (!metadata) {
      return { valid: false, errors: [`Operation ${operationId} not found`] };
    }

    const errors: string[] = [];
    for (const dep of metadata.dependencies || []) {
      if (!this.operations.has(dep)) {
        errors.push(`Dependency ${dep} not found`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
```

## 🚀 执行引擎

### 操作子执行引擎

```typescript
class OperationExecutionEngine {
  constructor(
    private registry: OperationRegistry,
    private resourceManager: ResourceManager
  ) {}

  async execute(
    operationId: string,
    config: OperationConfig,
    input: any,
    context: OperationContext
  ): Promise<OperationResult> {
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = config.retryAttempts || 1;

    while (attempt <= maxAttempts) {
      try {
        const OperationClass = this.registry.getOperation(operationId);
        if (!OperationClass) {
          throw new Error(`Operation ${operationId} not found`);
        }

        const operation = new OperationClass(config);
        operation.context = context;

        // 资源分配
        await this.resourceManager.allocate(operationId, config);

        // 执行操作子
        const result = await operation.execute(input);

        // 资源释放
        await this.resourceManager.release(operationId);

        return {
          ...result,
          metadata: {
            ...result.metadata,
            executionTime: Date.now() - startTime,
            retries: attempt
          }
        };

      } catch (error) {
        attempt++;

        if (attempt > maxAttempts) {
          context.logger.error('Operation failed after retries', {
            operationId,
            error: error.message,
            attempts: attempt
          });

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: {
              executionTime: Date.now() - startTime,
              retries: attempt - 1
            }
          };
        }

        // 重试延迟
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Unexpected execution path');
  }
}
```

## 📊 配置和部署

### 操作子配置文件

```json
{
  "operations": {
    "browser": {
      "enabled": true,
      "defaultTimeout": 30000,
      "retryAttempts": 3,
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "headless": true,
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    },
    "file": {
      "enabled": true,
      "basePath": "./data",
      "backupEnabled": true,
      "backupInterval": 86400000,
      "maxFileSize": "100MB"
    },
    "ai": {
      "enabled": true,
      "defaultModel": "gpt-4",
      "cacheEnabled": true,
      "cacheTTL": 3600000,
      "rateLimit": {
        "requests": 100,
        "window": 60000
      }
    },
    "communication": {
      "enabled": true,
      "defaultTimeout": 10000,
      "retryAttempts": 3,
      "connectionPool": {
        "maxSize": 10,
        "minSize": 2
      }
    }
  }
}
```

### 操作子目录结构

```
sharedmodule/operations-framework/
├── src/
│   ├── core/
│   │   ├── BaseOperation.ts           # 基础操作子类
│   │   ├── OperationContext.ts        # 操作上下文
│   │   ├── OperationRegistry.ts       # 操作子注册器
│   │   ├── OperationEngine.ts         # 执行引擎
│   │   └── types.ts                   # 类型定义
│   ├── operations/
│   │   ├── browser/                   # 浏览器操作子
│   │   ├── file/                      # 文件操作子
│   │   ├── ai/                        # AI模型操作子
│   │   ├── communication/              # 通信操作子
│   │   ├── data/                      # 数据处理操作子
│   │   └── system/                    # 系统操作子
│   └── utils/
│       ├── validators.ts              # 验证器
│       ├── retry-handler.ts           # 重试处理
│       ├── metrics.ts                 # 指标收集
│       └── error-handler.ts           # 错误处理
├── config/
│   ├── operations.json               # 操作子配置
│   └── categories.json               # 分类配置
├── tests/
│   ├── unit/                         # 单元测试
│   ├── integration/                  # 集成测试
│   └── performance/                  # 性能测试
└── examples/
    ├── basic-usage.ts                # 基础使用示例
    ├── advanced-composition.ts       # 高级组合示例
    └── error-handling.ts             # 错误处理示例
```

## 🎯 质量保证

### 测试策略

1. **单元测试**: 每个操作子独立的测试套件
2. **集成测试**: 操作子之间的交互测试
3. **性能测试**: 执行时间和资源使用测试
4. **错误处理测试**: 异常情况的恢复能力测试

### 性能指标

- **执行时间**: 单个操作子 < 5秒
- **内存使用**: 操作子实例 < 10MB
- **并发支持**: 100+ 并发操作子
- **错误率**: < 0.1%

### 监控和日志

- 完整的操作执行轨迹
- 详细的性能指标收集
- 实时错误告警
- 历史数据分析

---

这个操作子库架构设计为 WebAuto 平台提供了强大的基础能力，支持从简单到复杂的各种自动化场景。通过标准化的接口和配置驱动的执行方式，操作子可以灵活组合，满足不同层次的业务需求。