# WebAuto 浏览器服务文档

## 🚀 概述

WebAuto浏览器服务提供了一个**完全抽象的浏览器自动化服务层**，将底层的Camoufox、Playwright等浏览器实现完全封装，为应用层提供统一的RESTful API接口。

## 🏗️ 架构设计

### 分层架构

```
应用层 (Application Layer)
    ↓
API接口层 (RESTful API)
    ↓
服务抽象层 (Browser Service Interface)
    ↓
服务实现层 (Browser Service Implementation)
    ↓
控制器层 (Browser Controller)
    ↓
浏览器包装层 (CamoufoxBrowserWrapper)
    ↓
底层实现 (Camoufox + Playwright)
```

### 核心组件

1. **抽象接口层** (`browser_service_interface.py`)
   - 定义纯抽象接口
   - 完全隐藏底层实现
   - 提供统一的操作契约

2. **服务实现层** (`browser_service.py`)
   - 实现抽象接口
   - 管理会话生命周期
   - 协调各个组件

3. **指纹管理器** (`fingerprint_manager.py`)
   - 自动生成和更新浏览器指纹
   - 多级别反检测配置
   - 风控智能处理

4. **RESTful API** (`browser_api.py`)
   - 提供HTTP接口
   - 支持跨语言调用
   - 完整的错误处理

5. **一键启动器** (`browser_launcher.py`)
   - 后台服务模式
   - 优雅关闭处理
   - 健康监控

## 🎯 核心功能

### 1. Cookie自动管理
- ✅ **自动加载**: 启动时自动加载保存的Cookie
- ✅ **自动保存**: 会话结束时自动保存Cookie
- ✅ **标准路径**: `~/.webauto/cookies/{platform}-{type}.json`
- ✅ **关键验证**: 验证重要Cookie是否存在
- ✅ **格式兼容**: 与Python版本Cookie格式完全兼容

### 2. 指纹更新和风控处理
- ✅ **多级反检测**: none/basic/enhanced/maximum
- ✅ **自动更新**: 基于时间间隔和操作次数
- ✅ **风控评估**: 智能识别风险级别
- ✅ **缓解措施**: 自动应用相应的缓解策略
- ✅ **人类模拟**: 模拟真实用户行为模式

### 3. RESTful API接口
- ✅ **服务管理**: 启动/停止/状态查询
- ✅ **会话管理**: 创建/获取/关闭会话
- ✅ **浏览器控制**: 导航/点击/输入/截图/高亮
- ✅ **Cookie管理**: 加载/保存Cookie
- ✅ **指纹管理**: 更新浏览器指纹
- ✅ **模板操作**: 执行页面模板

### 4. 浏览器控制接口
- ✅ **页面导航**: 支持各种导航模式
- ✅ **元素操作**: 点击、输入、滚动
- ✅ **截图功能**: 全页面/区域截图
- ✅ **元素高亮**: 可视化元素标注
- ✅ **数据提取**: 结构化数据提取

### 5. 页面模板和标注操作
- ✅ **模板定义**: URL模式、选择器、操作序列
- ✅ **平台模板**: 1688、微博等平台专用模板
- ✅ **标注操作**: 高亮显示、视觉反馈
- ✅ **数据提取**: 自动提取页面数据

## 🔧 快速开始

### 一键启动服务

```bash
# 启动浏览器服务
python services/browser_launcher.py

# 指定端口启动
python services/browser_launcher.py --port 9999

# 调试模式启动
python services/browser_launcher.py --debug

# 后台模式启动
python services/browser_launcher.py --daemon
```

### API使用示例

#### 1. 启动服务
```bash
curl -X POST http://localhost:8888/api/v1/service/start \
  -H "Content-Type: application/json" \
  -d '{
    "cookie_dir": "./cookies",
    "fingerprint_dir": "./fingerprints"
  }'
```

#### 2. 创建会话
```bash
curl -X POST http://localhost:8888/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "profile_id": "my_session",
      "anti_detection_level": "enhanced",
      "locale": "zh-CN"
    }
  }'
```

#### 3. 页面导航
```bash
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.baidu.com"
  }'
```

#### 4. 点击元素
```bash
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/click \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "#search_button"
  }'
```

#### 5. 高亮元素
```bash
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/highlight \
  -H "Content-Type: application/json" \
  -d '{
    "selector": ".important-element",
    "options": {
      "color": "#FF0000",
      "duration": 3000
    }
  }'
```

#### 6. 截图
```bash
curl -X POST http://localhost:8888/api/v1/sessions/{session_id}/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "full_page": true,
      "quality": 80
    }
  }' \
  --output screenshot.png
```

## 📋 API参考

### 服务管理
- `POST /api/v1/service/start` - 启动服务
- `POST /api/v1/service/stop` - 停止服务
- `GET /api/v1/service/status` - 获取服务状态

### 会话管理
- `POST /api/v1/sessions` - 创建会话
- `GET /api/v1/sessions/{id}` - 获取会话信息
- `DELETE /api/v1/sessions/{id}` - 关闭会话
- `GET /api/v1/sessions/{id}/status` - 获取会话状态

### 浏览器控制
- `POST /api/v1/sessions/{id}/navigate` - 页面导航
- `POST /api/v1/sessions/{id}/click` - 点击元素
- `POST /api/v1/sessions/{id}/input` - 输入文本
- `POST /api/v1/sessions/{id}/scroll` - 滚动页面
- `POST /api/v1/sessions/{id}/screenshot` - 截图
- `POST /api/v1/sessions/{id}/highlight` - 高亮元素
- `POST /api/v1/sessions/{id}/extract` - 提取数据

### Cookie管理
- `POST /api/v1/sessions/{id}/cookies/load` - 加载Cookie
- `POST /api/v1/sessions/{id}/cookies/save` - 保存Cookie

### 指纹管理
- `PUT /api/v1/sessions/{id}/fingerprint` - 更新指纹

### 模板操作
- `POST /api/v1/sessions/{id}/template` - 执行页面模板

### 健康检查
- `GET /api/v1/health` - 健康检查

## 🛡️ 安全特性

### 完全抽象
- ❌ **禁止直接访问**: playwright, camoufox, selenium
- ✅ **强制通过API**: 所有操作必须通过RESTful API
- 🔒 **会话隔离**: 每个会话完全独立
- 🎯 **权限控制**: 细粒度的操作权限

### 反检测机制
- 🎭 **指纹伪装**: 自动生成真实浏览器指纹
- 🔄 **自动更新**: 定期更新指纹特征
- 🛡️ **风控处理**: 智能识别和规避风控
- 🤖 **人类模拟**: 模拟真实用户行为模式

### 数据保护
- 🔐 **Cookie加密**: 敏感Cookie数据加密存储
- 🗑️ **自动清理**: 会话结束后自动清理数据
- 📊 **审计日志**: 完整的操作审计记录

## 🎯 使用场景

### 电商平台自动化
- 1688商家信息采集
- 商品价格监控
- 库存状态跟踪
- 订单状态查询

### 社交媒体管理
- 微博内容发布
- 用户互动管理
- 数据分析采集
- 内容监控审计

### 企业级应用
- 数据抓取服务
- 自动化测试
- 业务流程自动化
- 报表自动生成

## 🔍 监控和调试

### 服务状态监控
```bash
# 检查服务状态
curl http://localhost:8888/api/v1/service/status

# 健康检查
curl http://localhost:8888/api/v1/health
```

### 会话监控
```bash
# 获取会话状态
curl http://localhost:8888/api/v1/sessions/{session_id}/status
```

### 日志查看
服务启动后会显示详细的API文档和使用示例，包括：
- 完整的API端点列表
- 使用示例和测试命令
- 错误处理和调试信息

## 🚀 性能优化

### 会话池管理
- 自动会话回收
- 最大会话数限制
- 空闲会话清理

### 资源优化
- 内存使用监控
- CPU使用率优化
- 网络请求优化

### 并发处理
- 多线程会话管理
- 异步API响应
- 连接池优化

## 📞 支持

如需技术支持或有任何问题，请通过以下方式联系：

- 📧 邮箱: support@webauto.com
- 💬 社区: GitHub Issues
- 📚 文档: 项目Wiki页面

---

**WebAuto浏览器服务** - 让浏览器自动化变得简单、安全、高效！