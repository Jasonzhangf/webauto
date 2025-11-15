# UI Recognition Service

基于通义UI-Ins模型的智能UI识别服务，提供网页和应用程序界面元素的自动识别功能。

## 特性

- 🚀 **AI驱动**: 基于通义UI-Ins-7B/32B模型
- 📦 **独立模块**: 可作为npm包独立使用
- 🎯 **多模态识别**: 支持全页面和区域识别
- 🔄 **事件驱动**: 完整的事件系统和异步处理
- 🛡️ **高可用**: 错误恢复、重试机制和负载均衡
- 🔧 **易于集成**: 支持多种集成方式

## 安装

```bash
npm install ui-recognition-service
```

## 快速开始

### 基础使用

```javascript
import { UIRecognitionService } from 'ui-recognition-service';

// 创建服务实例
const service = new UIRecognitionService({
  modelPath: 'Tongyi-MiA/UI-Ins-7B',
  device: 'auto',
  precision: 'fp16'
});

// 启动服务
await service.start();

// 进行UI识别
const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'; // base64图像
const result = await service.recognize({
  image: screenshot,
  query: '识别页面中的登录按钮',
  scope: 'full'
});

console.log('识别结果:', result.elements);
console.log('操作建议:', result.actions);

// 停止服务
await service.stop();
```

### 区域识别

```javascript
// 识别特定区域
const regionResult = await service.recognizeRegion(
  screenshot,
  { x: 100, y: 50, width: 300, height: 200 },
  '识别此区域的表单元素'
);
```

### 目标定位

```javascript
// 定位特定元素
const targetResult = await service.locateTarget(
  screenshot,
  '登录按钮'
);
```

## API文档

### UIRecognitionService

主要服务类，提供完整的UI识别功能。

#### 构造函数

```javascript
new UIRecognitionService(config)
```

**配置参数**:
- `serviceHost` (string): 服务主机地址，默认 `'localhost'`
- `servicePort` (number): 服务端口，默认 `8899`
- `modelPath` (string): 模型路径，默认 `'Tongyi-MiA/UI-Ins-7B'`
- `device` (string): 计算设备，默认 `'auto'`
- `precision` (string): 计算精度，默认 `'fp16'`
- `timeout` (number): 请求超时时间(ms)，默认 `30000`
- `maxRetries` (number): 最大重试次数，默认 `3`

#### 主要方法

##### `start()`
启动UI识别服务。

```javascript
await service.start();
```

##### `recognize(options)`
执行UI识别。

```javascript
const result = await service.recognize({
  image: string,           // base64编码的图像
  query: string,           // 识别查询
  scope: 'full'|'partial', // 识别范围
  region: { x, y, width, height }, // 区域坐标(当scope='partial'时)
  context: Array,          // 上下文信息
  parameters: {            // 模型参数
    temperature: number,
    maxTokens: number,
    topP: number
  }
});
```

**返回值**:
```javascript
{
  success: boolean,
  requestId: number,
  processingTime: number,
  elements: [
    {
      bbox: [x1, y1, x2, y2],
      text: string,
      type: string,
      confidence: number,
      description: string
    }
  ],
  actions: [
    {
      type: string,
      target: { bbox: [x1, y1, x2, y2] },
      text: string,
      reason: string
    }
  ],
  analysis: string,
  metadata: {
    model: string,
    confidence: number,
    totalElements: number,
    totalActions: number
  }
}
```

##### `recognizeRegion(image, region, query, options)`
区域识别。

```javascript
const result = await service.recognizeRegion(
  image,           // 图像数据
  { x: 0, y: 0, width: 800, height: 600 }, // 区域坐标
  '识别此区域的元素', // 查询
  options          // 额外选项
);
```

##### `locateTarget(image, target, context)`
目标定位。

```javascript
const result = await service.locateTarget(
  image,    // 图像数据
  '登录按钮', // 目标描述
  context   // 上下文信息
);
```

##### `getStatus()`
获取服务状态。

```javascript
const status = service.getStatus();
```

##### `stop()`
停止服务。

```javascript
await service.stop();
```

## 事件系统

服务继承自EventEmitter，支持以下事件：

```javascript
// 服务状态变化
service.on('status', (event) => {
  console.log('服务状态:', event.status);
});

// 请求开始
service.on('request-start', (event) => {
  console.log('开始请求:', event.requestId);
});

// 请求完成
service.on('request-complete', (event) => {
  console.log('请求完成:', event.result);
});

// 请求错误
service.on('request-error', (event) => {
  console.error('请求失败:', event.error);
});

// 服务错误
service.on('error', (event) => {
  console.error('服务错误:', event.error);
});
```

## 与WebAuto集成

### 工作流节点

```javascript
// src/core/workflow/nodes/UIRecognitionNode.js
import BaseNode from './BaseNode.js';
import { UIRecognitionService } from 'ui-recognition-service';

export default class UIRecognitionNode extends BaseNode {
  async execute(context) {
    const { page, logger, config } = context;

    // 截图
    const screenshot = await page.screenshot({
      fullPage: config.fullPage !== false,
      type: 'png'
    });

    const base64Image = `data:image/png;base64,${screenshot.toString('base64')}`;

    // 创建UI识别服务
    const service = new UIRecognitionService({
      modelPath: config.modelPath || 'Tongyi-MiA/UI-Ins-7B'
    });

    try {
      await service.start();

      const result = await service.recognize({
        image: base64Image,
        query: config.query || '识别页面中的可交互元素',
        scope: config.scope || 'full',
        parameters: config.parameters
      });

      logger.info(`UI识别完成: 发现${result.elements.length}个元素`);

      return {
        success: true,
        results: {
          elements: result.elements,
          actions: result.actions,
          analysis: result.analysis
        },
        variables: {
          uiElementsCount: result.elements.length,
          suggestedActions: result.actions.length
        }
      };

    } finally {
      await service.stop();
    }
  }
}
```

### MCP工具集成

```javascript
// 创建MCP工具
const tools = {
  'ui-recognize': {
    description: '智能识别页面UI元素',
    inputSchema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'base64编码的页面截图'
        },
        query: {
          type: 'string',
          description: '识别查询或目标描述'
        },
        scope: {
          type: 'string',
          enum: ['full', 'partial'],
          description: '识别范围'
        }
      },
      required: ['image']
    }
  },
  'ui-locate-target': {
    description: '定位特定的UI元素',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        target: { type: 'string', description: '要定位的元素描述' }
      },
      required: ['image', 'target']
    }
  }
};
```

## 配置选项

### 服务配置

```javascript
const service = new UIRecognitionService({
  // 服务配置
  serviceHost: 'localhost',
  servicePort: 8899,

  // 模型配置
  modelPath: 'Tongyi-MiA/UI-Ins-7B',  // 或 'Tongyi-MiA/UI-Ins-32B'
  device: 'auto',                    // 'cuda', 'cpu', 'mps', 'auto'
  precision: 'fp16',                 // 'fp16', 'fp32', 'int8'

  // 性能配置
  timeout: 30000,                    // 请求超时(ms)
  maxRetries: 3,                     // 最大重试次数
  startupTimeout: 60000,             // 启动超时(ms)

  // 缓存配置
  enableCache: true,
  cacheDir: './.cache',

  // Python服务路径
  pythonServicePath: './python-service'
});
```

### 模型参数

```javascript
const result = await service.recognize({
  image: screenshot,
  query: '识别登录按钮',
  parameters: {
    temperature: 0.1,    // 创造性程度 (0-1)
    maxTokens: 512,      // 最大生成token数
    topP: 0.9,          // 核采样概率
    doSample: true      // 是否采样
  }
});
```

## 开发环境设置

### 环境要求

- Node.js >= 16.0.0
- Python >= 3.8
- PyTorch (用于模型推理)
- 足够的GPU内存 (推荐8GB+)

### 安装依赖

```bash
# JavaScript依赖
npm install

# Python依赖
cd python-service
pip install -r requirements.txt
```

### 启动开发服务

```bash
# 同时启动Python服务和Node.js服务
npm run dev

# 或分别启动
npm run start:service  # 启动Python服务
npm run dev:js         # 启动Node.js开发模式
```

## 测试

```bash
# 运行所有测试
npm test

# 运行JavaScript测试
npm run test:js

# 运行Python测试
npm run test:py
```

## 性能优化

### 1. 模型选择
- **UI-Ins-7B**: 轻量级，适合快速识别
- **UI-Ins-32B**: 高精度，适合复杂场景

### 2. 硬件优化
- 使用GPU加速推理
- 增加系统内存
- 使用SSD存储

### 3. 图像优化
- 压缩图像大小
- 裁剪感兴趣区域
- 调整分辨率

## 故障排除

### 常见问题

1. **服务启动失败**
   ```bash
   # 检查Python环境
   python --version
   pip list | grep torch

   # 检查模型路径
   python -c "from modelscope import AutoModel; print('OK')"
   ```

2. **内存不足**
   ```javascript
   // 使用更小的模型
   const service = new UIRecognitionService({
     modelPath: 'Tongyi-MiA/UI-Ins-7B',
     precision: 'int8'  // 使用量化
   });
   ```

3. **识别精度低**
   ```javascript
   // 调整模型参数
   const result = await service.recognize({
     image: screenshot,
     parameters: {
       temperature: 0.05,  // 降低温度
       maxTokens: 1024     // 增加token数
     }
   });
   ```

### 日志调试

```javascript
// 启用详细日志
service.on('service-output', (event) => {
  console.log('[Python Service]', event.data);
});

service.on('service-error', (event) => {
  console.error('[Python Error]', event.error);
});
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License

## 更新日志

### v1.0.0
- 初始版本发布
- 支持UI-Ins-7B/32B模型
- 完整的API接口
- 事件驱动架构
- 多种集成方式