# 单个微博帖子内容捕获节点驱动设计方案

## 🎯 设计目标

设计一个基于节点的单个微博帖子内容捕获系统，能够：
1. **结构化提取**：提取帖子的文本内容、元数据、评论和图片
2. **节点驱动**：使用可组合的节点进行模块化处理
3. **可扩展性**：支持不同类型的微博帖子和自定义提取逻辑
4. **错误恢复**：每个节点都有独立的错误处理和重试机制

## 📋 系统架构

### 🔄 工作流程设计

```
开始 → 浏览器初始化 → Cookie加载 → 导航到帖子URL →
帖子内容分析 → 评论提取 → 图片捕获 → 数据整合 →
结构化保存 → 结束
```

### 🧩 核心节点设计

#### 1. WeiboPostAnalyzerNode (帖子分析节点)
**功能**：分析微博帖子页面结构，提取基础信息

**输入**：
- `page` (object) - Playwright页面对象
- `postUrl` (string) - 目标帖子URL
- `config` (object) - 分析配置

**输出**：
- `postData` (object) - 帖子基础信息
- `mediaInfo` (object) - 媒体文件信息
- `commentInfo` (object) - 评论相关信息
- `analysisStats` (object) - 分析统计信息

**主要功能**：
- 帖子标题、正文、时间戳提取
- 用户信息提取（昵称、ID、认证状态）
- 转发、点赞、评论数统计
- 媒体文件识别和链接提取
- 评论区域定位和结构分析

#### 2. WeiboCommentExtractorNode (评论提取节点)
**功能**：提取帖子的所有评论，包括嵌套回复

**输入**：
- `page` (object) - Playwright页面对象
- `commentInfo` (object) - 评论区域信息
- `config` (object) - 提取配置（深度限制、数量限制等）

**输出**：
- `comments` (array) - 评论数据数组
- `replyTree` (object) - 评论回复树结构
- `extractionStats` (object) - 提取统计信息

**主要功能**：
- 主评论提取
- 嵌套回复提取（多层）
- 评论时间、用户信息、内容提取
- 图片、视频等多媒体评论处理
- 评论互动数据（点赞、回复等）

#### 3. WeiboMediaCaptureNode (媒体捕获节点)
**功能**：捕获帖子中的图片和视频文件

**输入**：
- `page` (object) - Playwright页面对象
- `mediaInfo` (object) - 媒体文件信息
- `config` (object) - 捕获配置（文件大小限制、格式等）

**输出**：
- `capturedImages` (array) - 捕获的图片信息
- `capturedVideos` (array) - 捕获的视频信息
- `mediaStats` (object) - 媒体捕获统计

**主要功能**：
- 图片下载和本地存储
- 视频文件识别和下载
- 高清图片优先策略
- 文件去重和校验
- 存储路径管理

#### 4. DataIntegratorNode (数据整合节点)
**功能**：整合所有提取的数据，形成结构化输出

**输入**：
- `postData` (object) - 帖子基础信息
- `comments` (array) - 评论数据
- `mediaFiles` (array) - 媒体文件信息
- `config` (object) - 整合配置

**输出**：
- `structuredData` (object) - 结构化数据对象
- `metadata` (object) - 元数据信息
- `exportStats` (object) - 导出统计

**主要功能**：
- 数据关联和索引
- 结构标准化
- 元数据补充
- 数据验证和清洗

#### 5. StructuredDataSaverNode (结构化保存节点)
**功能**：将结构化数据保存到多种格式

**输入**：
- `structuredData` (object) - 结构化数据
- `metadata` (object) - 元数据
- `config` (object) - 保存配置（格式、路径等）

**输出**：
- `savedFiles` (array) - 保存的文件列表
- `exportPaths` (object) - 导出路径信息
- `saveStats` (object) - 保存统计

**主要功能**：
- JSON格式保存
- CSV格式导出
- 数据库存储（可选）
- 文件命名和路径管理
- 备份和版本控制

## 📊 数据结构设计

### 帖子基础数据结构
```json
{
  "postId": "string",
  "url": "string",
  "title": "string",
  "content": "string",
  "author": {
    "userId": "string",
    "username": "string",
    "nickname": "string",
    "verified": boolean,
    "followers": number
  },
  "timestamp": "ISO8601 string",
  "statistics": {
    "likes": number,
    "comments": number,
    "reposts": number,
    "views": number
  },
  "tags": ["string"],
  "location": {
    "name": "string",
    "coordinates": {
      "latitude": number,
      "longitude": number
    }
  }
}
```

### 评论数据结构
```json
{
  "commentId": "string",
  "postId": "string",
  "content": "string",
  "author": {
    "userId": "string",
    "username": "string",
    "nickname": "string"
  },
  "timestamp": "ISO8601 string",
  "statistics": {
    "likes": number,
    "replies": number
  },
  "replies": [
    {
      "commentId": "string",
      "content": "string",
      "author": {...},
      "timestamp": "ISO8601 string"
    }
  ],
  "media": [
    {
      "type": "image|video",
      "url": "string",
      "localPath": "string",
      "size": number
    }
  ]
}
```

### 媒体文件数据结构
```json
{
  "mediaId": "string",
  "postId": "string",
  "type": "image|video",
  "url": "string",
  "localPath": "string",
  "filename": "string",
  "size": number,
  "dimensions": {
    "width": number,
    "height": number
  },
  "format": "string",
  "description": "string"
}
```

### 完整输出结构
```json
{
  "metadata": {
    "version": "1.0",
    "extractedAt": "ISO8601 string",
    "sourceUrl": "string",
    "extractionTime": number,
    "nodeStats": {...}
  },
  "post": {...},
  "comments": [...],
  "media": [...],
  "relationships": {
    "postComments": [...],
    "postMedia": [...],
    "commentMedia": [...]
  }
}
```

## 🔧 节点配置设计

### 单个帖子捕获工作流配置
```json
{
  "version": "1.0",
  "name": "Weibo Single Post Capture",
  "description": "单个微博帖子内容捕获工作流",
  "nodes": [
    {
      "id": "post_analyzer",
      "type": "WEIBO_POST_ANALYZER",
      "title": "帖子分析器",
      "parameters": {
        "extractImages": true,
        "extractVideos": true,
        "analyzeStructure": true,
        "timeout": 30000
      }
    },
    {
      "id": "comment_extractor",
      "type": "WEIBO_COMMENT_EXTRACTOR",
      "title": "评论提取器",
      "parameters": {
        "maxComments": 1000,
        "maxReplyDepth": 5,
        "extractMedia": true,
        "timeout": 60000
      }
    },
    {
      "id": "media_capture",
      "type": "WEIBO_MEDIA_CAPTURE",
      "title": "媒体捕获器",
      "parameters": {
        "maxFileSize": "50MB",
        "allowedFormats": ["jpg", "png", "gif", "mp4"],
        "downloadPath": "./downloads/${postId}",
        "createSubdirs": true
      }
    },
    {
      "id": "data_integrator",
      "type": "DATA_INTEGRATOR",
      "title": "数据整合器",
      "parameters": {
        "generateRelations": true,
        "validateData": true,
        "enrichMetadata": true
      }
    },
    {
      "id": "structured_saver",
      "type": "STRUCTURED_DATA_SAVER",
      "title": "结构化保存器",
      "parameters": {
        "formats": ["json", "csv"],
        "savePath": "./output/${postId}",
        "includeMedia": true,
        "compress": false
      }
    }
  ],
  "connections": [
    {
      "from": "browser_operator",
      "fromOutput": "page",
      "to": "post_analyzer",
      "toInput": "page"
    },
    {
      "from": "post_analyzer",
      "fromOutput": "postData",
      "to": "data_integrator",
      "toInput": "postData"
    },
    {
      "from": "post_analyzer",
      "fromOutput": "commentInfo",
      "to": "comment_extractor",
      "toInput": "commentInfo"
    },
    {
      "from": "post_analyzer",
      "fromOutput": "mediaInfo",
      "to": "media_capture",
      "toInput": "mediaInfo"
    },
    {
      "from": "comment_extractor",
      "fromOutput": "comments",
      "to": "data_integrator",
      "toInput": "comments"
    },
    {
      "from": "media_capture",
      "fromOutput": "capturedMedia",
      "to": "data_integrator",
      "toInput": "mediaFiles"
    },
    {
      "from": "data_integrator",
      "fromOutput": "structuredData",
      "to": "structured_saver",
      "toInput": "structuredData"
    }
  ],
  "variables": {
    "postId": "${url.extract('postId')}",
    "timestamp": "${TIMESTAMP}",
    "outputDir": "./output/weibo-posts"
  }
}
```

## 🛡️ 错误处理和重试机制

### 节点级错误处理
每个节点都包含：
- **超时控制**：每个操作都有独立超时设置
- **重试机制**：失败后自动重试（可配置重试次数）
- **错误恢复**：部分失败时继续执行其他功能
- **日志记录**：详细错误信息和执行状态

### 工作流级错误处理
- **节点失败跳过**：可选择跳过失败节点继续执行
- **数据验证**：每个节点的输出都会进行验证
- **资源清理**：失败时自动清理临时文件和资源
- **状态保存**：支持断点续传

## 📈 性能优化策略

### 内存管理
- **分批处理**：大量评论分批加载处理
- **及时清理**：处理完成后及时清理内存
- **缓存策略**：重复使用浏览器实例和页面

### 网络优化
- **并发控制**：图片下载并发限制
- **断点续传**：大文件支持断点续传
- **压缩传输**：数据传输时压缩优化

### 存储优化
- **增量保存**：只保存新增和变更的数据
- **文件去重**：媒体文件自动去重
- **空间回收**：定期清理临时文件

## 🔄 可扩展性设计

### 节点扩展接口
```javascript
class BaseWeiboNode extends BaseNode {
  async validateInput(input) {
    // 输入验证
  }

  async preprocess(input) {
    // 预处理
  }

  async execute(input) {
    // 核心执行逻辑
  }

  async postprocess(output) {
    // 后处理
  }

  async handleError(error) {
    // 错误处理
  }
}
```

### 自定义节点注册
```javascript
// 注册新的节点类型
nodeRegistry.register('CUSTOM_WEIBO_NODE', CustomWeiboNode);

// 扩展现有节点
nodeRegistry.extend('WEIBO_POST_ANALYZER', EnhancedPostAnalyzer);
```

## 📋 实施计划

### 阶段1：基础节点实现
1. 实现 WeiboPostAnalyzerNode
2. 实现 WeiboCommentExtractorNode
3. 实现 WeiboMediaCaptureNode
4. 基础测试和验证

### 阶段2：数据处理
1. 实现 DataIntegratorNode
2. 实现 StructuredDataSaverNode
3. 数据结构验证
4. 格式化输出测试

### 阶段3：集成测试
1. 完整工作流测试
2. 错误处理测试
3. 性能优化测试
4. 边界情况处理

### 阶段4：批量扩展
1. 批量处理优化
2. 监控和日志增强
3. 用户界面集成
4. 部署和文档

## 🎯 预期效果

完成后的系统将具备：
- **高准确性**：完整提取帖子、评论、图片信息
- **结构化输出**：标准化的JSON/CSV格式数据
- **可扩展性**：支持自定义节点和处理逻辑
- **稳定性**：完善的错误处理和重试机制
- **高性能**：优化的并发和内存管理

这个设计为后续的批量下载奠定了坚实的基础。