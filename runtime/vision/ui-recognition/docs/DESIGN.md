# UI Recognition Service 设计方案

## 概述

UI Recognition Service 是一个基于通义UI-Ins模型的独立UI识别模块，提供智能的网页和应用程序界面元素识别功能。该模块设计为独立、可复用的共享服务，支持多种集成方式。

## 设计目标

1. **模块化设计**: 独立的npm包，可在多个项目中复用
2. **AI驱动**: 基于通义UI-Ins-7B/32B模型的智能识别
3. **事件驱动**: 支持异步处理和事件监听
4. **多模态输入**: 支持全页面和区域识别
5. **标准化输出**: 统一的元素定位和操作建议格式
6. **高可用性**: 支持服务重启、错误恢复和负载均衡

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                      │
│                  (WebAuto/其他项目)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/WebSocket/Event
┌─────────────────────▼───────────────────────────────────────┐
│                UI Recognition Service                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   API Layer     │  │  Event System   │  │   Cache      │ │
│  │                 │  │                 │  │   Manager    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP API
┌─────────────────────▼───────────────────────────────────────┐
│                Python Service Layer                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  FastAPI Server │  │  UI-Ins Model   │  │   Image      │ │
│  │                 │  │                 │  │  Processor   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 目录结构

```
runtime/vision/ui-recognition/
├── src/                           # JavaScript主服务
│   ├── core/                      # 核心功能
│   │   ├── UIRecognitionService.js # 主服务类
│   │   ├── ServiceManager.js      # 服务管理器
│   │   └── EventEmitter.js        # 事件系统
│   ├── api/                       # API接口
│   │   ├── RestClient.js          # HTTP客户端
│   │   └── WebSocketClient.js     # WebSocket客户端
│   ├── utils/                     # 工具函数
│   │   ├── ImageProcessor.js      # 图像处理
│   │   ├── CacheManager.js        # 缓存管理
│   │   └── Logger.js              # 日志系统
│   ├── types/                     # TypeScript类型定义
│   │   └── index.d.ts
│   └── index.js                   # 主入口
├── python-service/                # Python推理服务
│   ├── src/                       # 源代码
│   │   ├── server.py              # FastAPI服务器
│   │   ├── models/                # 模型管理
│   │   │   ├── ui_ins_adapter.py  # UI-Ins模型适配器
│   │   │   └── base_model.py      # 基础模型类
│   │   ├── processors/            # 处理器
│   │   │   ├── image_processor.py # 图像预处理
│   │   │   └── result_processor.py # 结果后处理
│   │   └── utils/                 # 工具函数
│   │       ├── logger.py          # 日志工具
│   │       └── config.py          # 配置管理
│   ├── config/                    # 配置文件
│   │   ├── model_config.yaml      # 模型配置
│   │   └── service_config.yaml    # 服务配置
│   └── tests/                     # 测试文件
├── tests/                         # 测试目录
│   ├── unit/                      # 单元测试
│   └── integration/               # 集成测试
├── examples/                      # 示例代码
│   ├── basic/                     # 基础示例
│   └── advanced/                  # 高级示例
├── docs/                          # 文档
├── scripts/                       # 构建脚本
├── package.json                   # npm包配置
└── README.md                      # 说明文档
```

## 核心组件设计

### 1. UIRecognitionService (JavaScript)

主要服务类，负责：
- Python服务进程管理
- 请求队列和并发控制
- 事件发射和监听
- 错误处理和重试机制
- 缓存管理

**核心接口**:
```javascript
class UIRecognitionService {
  async start()                    // 启动服务
  async stop()                     // 停止服务
  async recognize(options)         // UI识别
  async recognizeRegion(image, region, query)  // 区域识别
  async locateTarget(image, target) // 目标定位
  getStatus()                      // 获取状态
}
```

### 2. Python Service (FastAPI)

Python推理服务，负责：
- HTTP API服务
- UI-Ins模型加载和推理
- 图像预处理
- 结果格式化

**API端点**:
```python
GET  /health                      # 健康检查
POST /recognize                   # UI识别
POST /recognize/region            # 区域识别
POST /locate/target               # 目标定位
GET  /models                      # 模型信息
```

### 3. 通信协议

**请求格式**:
```json
{
  "request_id": 123,
  "image": "base64_encoded_image",
  "query": "识别登录按钮",
  "scope": "full|partial",
  "region": {"x": 0, "y": 0, "width": 800, "height": 600},
  "context": [{"type": "target_location", "description": "登录按钮"}],
  "parameters": {
    "temperature": 0.1,
    "max_tokens": 512,
    "top_p": 0.9
  }
}
```

**响应格式**:
```json
{
  "request_id": 123,
  "success": true,
  "elements": [
    {
      "bbox": [100, 50, 200, 80],
      "text": "登录",
      "type": "button",
      "confidence": 0.95,
      "description": "用户登录按钮"
    }
  ],
  "actions": [
    {
      "type": "click",
      "target": {"bbox": [100, 50, 200, 80]},
      "reason": "点击登录按钮"
    }
  ],
  "analysis": "识别到登录表单，包含用户名输入框、密码输入框和登录按钮",
  "confidence": 0.93,
  "processing_time": 1.23
}
```

## 技术栈

### JavaScript端
- **Node.js 16+**: 运行时环境
- **EventEmitter3**: 事件系统
- **Axios**: HTTP客户端
- **Sharp**: 图像处理
- **TypeScript**: 类型定义

### Python端
- **Python 3.8+**: 运行时环境
- **FastAPI**: Web框架
- **Uvicorn**: ASGI服务器
- **PIL/Pillow**: 图像处理
- **Torch**: 深度学习框架
- **Transformers**: 模型库
- **ModelScope**: 模型仓库

### 模型
- **通义UI-Ins-7B**: 轻量级模型，适合快速识别
- **通义UI-Ins-32B**: 高精度模型，适合复杂场景

## 使用场景

### 1. 网页自动化
- 元素定位和识别
- 表单自动填写
- 页面交互分析

### 2. 移动应用测试
- UI元素识别
- 截图分析
- 操作建议生成

### 3. 可访问性分析
- 元素类型识别
- 交互性检测
- 结构分析

## 集成方式

### 1. npm包集成
```javascript
import { UIRecognitionService } from 'ui-recognition-service';

const service = new UIRecognitionService({
  modelPath: 'Tongyi-MiA/UI-Ins-7B',
  device: 'auto'
});

await service.start();
const result = await service.recognize({
  image: screenshot,
  query: '识别登录按钮'
});
```

### 2. MCP服务器集成
```javascript
// 在MCP工具中使用
const uiService = new UIRecognitionService();
await uiService.start();

// 提供MCP工具
const tools = {
  'ui-recognize': {
    description: '识别UI元素',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        query: { type: 'string' }
      }
    },
    handler: async (args) => {
      return await uiService.recognize(args);
    }
  }
};
```

### 3. 工作流节点集成
```javascript
// 在WebAuto工作流中使用
export default class UIRecognitionNode extends BaseNode {
  async execute(context) {
    const { page } = context;
    const screenshot = await page.screenshot();

    const service = new UIRecognitionService();
    await service.start();

    const result = await service.recognize({
      image: screenshot,
      query: '识别可交互元素'
    });

    return { success: true, results: { uiElements: result.elements } };
  }
}
```

## 配置管理

### 服务配置
```yaml
# service_config.yaml
service:
  host: "localhost"
  port: 8899
  max_requests: 100
  timeout: 30

model:
  name: "Tongyi-MiA/UI-Ins-7B"
  device: "auto"
  precision: "fp16"
  max_memory: "8GB"

cache:
  enabled: true
  ttl: 3600
  max_size: 1000

logging:
  level: "INFO"
  file: "logs/ui_recognition.log"
```

### 模型配置
```yaml
# model_config.yaml
ui_ins:
  model_path: "Tongyi-MiA/UI-Ins-7B"
  trust_remote_code: true
  device_map: "auto"
  torch_dtype: "float16"

inference:
  max_new_tokens: 512
  temperature: 0.1
  top_p: 0.9
  do_sample: true

preprocessing:
  image_size: [1024, 1024]
  normalize: true
  center_crop: false
```

## 性能优化

### 1. 模型优化
- **量化**: 8bit/4bit量化减少内存使用
- **批处理**: 支持批量识别提高吞吐量
- **缓存**: 常见识别结果缓存
- **模型并行**: 多GPU并行推理

### 2. 图像优化
- **压缩**: 智能图像压缩减少传输时间
- **裁剪**: 区域识别时先裁剪再处理
- **缩放**: 根据需要调整图像分辨率
- **格式**: 优化图像格式和编码

### 3. 服务优化
- **连接池**: HTTP连接复用
- **异步处理**: 非阻塞请求处理
- **负载均衡**: 多实例负载分发
- **监控**: 性能监控和告警

## 错误处理

### 1. 服务错误
- 模型加载失败
- 服务启动超时
- 内存不足
- 网络连接问题

### 2. 推理错误
- 图像格式不支持
- 输入参数错误
- 模型推理失败
- 结果解析错误

### 3. 恢复策略
- 自动重试机制
- 服务重启
- 降级处理
- 错误日志记录

## 测试策略

### 1. 单元测试
- 核心功能测试
- API接口测试
- 工具函数测试

### 2. 集成测试
- 端到端识别流程
- 多模块协作测试
- 性能基准测试

### 3. 兼容性测试
- 不同操作系统
- 不同Node.js版本
- 不同Python版本

## 部署方案

### 1. 开发环境
- 本地Python环境
- 单进程服务
- 调试模式开启

### 2. 生产环境
- Docker容器化
- 多实例部署
- 负载均衡
- 监控告警

### 3. 云端部署
- AWS/GCP/Azure
- 自动扩缩容
- 模型缓存优化
- CDN加速

## 安全考虑

### 1. 数据安全
- 图像数据加密传输
- 敏感信息过滤
- 访问权限控制

### 2. 模型安全
- 模型文件完整性检查
- 恶意输入防护
- 资源使用限制

### 3. 网络安全
- HTTPS通信
- API认证
- 请求频率限制

## 未来扩展

### 1. 多模型支持
- 支持更多UI识别模型
- 模型集成和融合
- 自定义模型接入

### 2. 功能扩展
- 实时视频流识别
- 3D界面识别
- 多语言支持

### 3. 生态集成
- 与现有自动化工具集成
- 云服务API集成
- 插件系统

---

此设计方案提供了完整的UI识别模块架构，支持独立部署和多种集成方式，确保高可用性和可扩展性。
