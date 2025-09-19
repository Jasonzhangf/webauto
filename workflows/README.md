# 微博链接捕获工作流架构

## 🎯 设计理念

按照你的建议，我们重构为**三个独立的工作流**，每个工作流包含：
- **通用节点**：可复用的组件（Cookie加载、登录验证、结果保存）
- **特定节点**：针对不同页面的特殊逻辑

## 📁 架构设计

```
workflows/
├── weibo-homepage-workflow.js    # 主页工作流
├── weibo-search-workflow.js      # 搜索页工作流
├── weibo-profile-workflow.js     # 个人主页工作流
├── workflow-manager.js           # 工作流管理器
└── README.md                     # 本文档
```

## 🔧 节点类型对比

### 通用节点（所有工作流共享）
- `loadCookies()` - Cookie加载
- `verifyLogin()` - 登录验证
- `saveResults()` - 结果保存

### 特定节点（各工作流独有）
- **主页**: `performScrollCapture()` + `checkIfAtBottom()`
- **搜索页**: `performPaginationCapture()` + `navigateToSearchNextPage()`
- **个人主页**: `performScrollCapture()` + `checkIfAtBottom()`

## 🚀 使用方法

### 1. 独立运行工作流
```bash
# 主页工作流
node workflows/weibo-homepage-workflow.js

# 搜索页工作流
node workflows/weibo-search-workflow.js 查理柯克

# 个人主页工作流
node workflows/weibo-profile-workflow.js 2192828333
```

### 2. 通过管理器运行
```bash
# 主页
node workflows/workflow-manager.js homepage

# 搜索页
node workflows/workflow-manager.js search 查理柯克

# 个人主页
node workflows/workflow-manager.js profile 2192828333
```

## 🎨 架构优势

### ✅ 相比统一模板的优势
1. **清晰分离** - 每个工作流职责单一
2. **易于维护** - 修改一个工作流不影响其他
3. **可扩展性强** - 新增页面类型只需新增工作流
4. **独立测试** - 每个工作流可单独测试和调试

### ✅ 代码复用
1. **通用节点复用** - Cookie、登录、保存逻辑共享
2. **相似逻辑复用** - 主页和个人主页都使用滚动捕获
3. **配置复用** - 相同的基础配置参数

### ✅ 特定优化
1. **主页优化** - 针对无限滚动的PageDown策略
2. **搜索页优化** - 针对分页的直接URL导航
3. **个人主页优化** - 针对个人主页的选择器调整

## 📊 执行结果示例

```json
{
  "target": 50,
  "actual": 51,
  "success": true,
  "workflowType": "homepage",
  "method": "Homepage Workflow",
  "links": [...],
  "savedFile": "/Users/fanzhang/.webauto/weibo/weibo-links-homepage-2025-09-19T07-29-08-120Z.json"
}
```

## 🔄 工作流流程

```
启动 → 通用节点(Cookie) → 通用节点(导航) → 通用节点(登录验证) → 特定节点(捕获) → 通用节点(保存) → 完成
```

这个设计真正实现了"替换不通用的节点，对通用的节点做兼容"的理念！