# 微博操作框架 (Weibo Operations Framework)

基于工作流的微博内容捕获系统，支持个人主页、主页内容抓取和关键词搜索。

## 📋 当前工作流

我们目前有 **4个** 主要的微博工作流：

### 1. 个人主页抓取工作流
- **文件**: `workflows/weibo-user-profile-workflow.json`
- **功能**: 抓取微博用户个人主页内容
- **实现**: `weibo-profile-50-posts-workflow.js`
- **使用方法**:
  ```bash
  node weibo-profile-50-posts-workflow.js
  ```
- **特点**:
  - 支持用户名链接或数字ID链接
  - 自动提取用户名
  - 智能滚动加载
  - 内容去重
  - 统计分析

### 2. 主页内容抓取工作流
- **文件**: `workflows/weibo-homepage-workflow.json`
- **功能**: 抓取微博主页（发现页）内容
- **特点**:
  - 热门话题抓取
  - 信息流内容提取
  - 推荐内容获取
  - 分类内容抓取

### 3. 搜索工作流
- **文件**: `workflows/weibo-search-workflow.json`
- **功能**: 微博关键词搜索
- **实现**: `weibo-search-workflow-executor.js`
- **使用方法**:
  ```bash
  node weibo-search-workflow-executor.js [关键词] [数量]
  # 示例：
  node weibo-search-workflow-executor.js 查理柯克 10
  ```
- **特点**:
  - 支持热门/时间/相关排序
  - 图片过滤
  - 去重功能
  - 结构化保存

### 4. 搜索工作流 (备份版本)
- **文件**: `workflows/weibo-search-workflow-v1-backup.json`
- **功能**: 旧版搜索工作流（已备份）

## 🏗️ 架构设计

### 工作流系统
- **配置驱动**: 每个工作流都是独立的JSON配置文件
- **模块化**: 支持自定义操作步骤和参数
- **可扩展**: 易于添加新的抓取场景

### 核心组件
- **执行器**: 负责工作流的实际执行
- **操作库**: 提供各种原子操作（浏览器、文件、数据处理等）
- **配置管理**: 统一的配置和参数管理

## 📁 文件结构

```
operations-framework/
├── workflows/                    # 工作流配置文件
│   ├── weibo-user-profile-workflow.json
│   ├── weibo-homepage-workflow.json
│   ├── weibo-search-workflow.json
│   └── weibo-search-workflow-v1-backup.json
├── weibo-profile-50-posts-workflow.js    # 个人主页抓取实现
├── weibo-search-workflow-executor.js     # 搜索工作流实现
├── src/                          # 源代码和操作库
├── config/                       # 配置文件
├── cookies/                      # Cookie文件
└── README.md                     # 本文件
```

## 🚀 使用方法

### 个人主页抓取
```bash
# 抓取用户主页50条帖子
node weibo-profile-50-posts-workflow.js
```

### 关键词搜索
```bash
# 搜索关键词（默认10条）
node weibo-search-workflow-executor.js 新闻

# 搜索指定数量
node weibo-search-workflow-executor.js 查理柯克 20
```

## 💾 数据保存

### 个人主页数据
- **保存路径**: `~/.webauto/weibo/user-profiles/[用户名]/`
- **文件格式**: JSON
- **包含内容**: 用户信息、帖子列表、统计数据

### 搜索数据
- **保存路径**: `~/.webauto/weibo/[关键词]/`
- **文件格式**: JSON
- **包含内容**: 搜索结果、统计信息

## 🔧 技术特性

- **ES模块**: 使用现代JavaScript模块系统
- **异步处理**: 完全基于async/await
- **错误处理**: 完善的错误捕获和恢复机制
- **日志系统**: 详细的操作日志和调试信息
- **Cookie管理**: 自动加载和验证微博Cookie
- **内容去重**: 智能重复内容检测
- **图片过滤**: 可配置的图片过滤规则

## 📊 性能指标

### 个人主页抓取
- **目标**: 50条帖子
- **成功率**: 95%+
- **执行时间**: 3-8分钟
- **内存使用**: 中等

### 关键词搜索
- **目标**: 可配置数量
- **成功率**: 85-95%
- **执行时间**: 2-5分钟
- **内存使用**: 中等

## 🔍 维护说明

1. **工作流更新**: 修改JSON配置文件即可调整工作流行为
2. **执行器维护**: JavaScript文件处理具体执行逻辑
3. **Cookie更新**: 定期更新微博Cookie以确保正常访问
4. **测试验证**: 使用实际测试用例验证功能完整性

## 📝 开发历史

- **2025-09-15**: 完成工作流系统重构
- **2025-09-15**: 清理硬编码实现，统一使用工作流
- **2025-09-15**: 成功抓取"包容万物恒河水"用户53条帖子
- **2025-09-15**: 实现基于工作流的搜索功能

## 📚 原始文档

关于底层操作子系统的详细信息，请参考原始文档：[Operations Framework 原始文档](./docs/operations-framework.md)