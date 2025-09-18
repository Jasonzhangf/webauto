# 管理态UI组件结构设计

## 组件层次结构
```
App
├── Header
├── Sidebar
├── MainContent
│   ├── PipelineManager
│   │   ├── PipelineList
│   │   └── PipelineEditor
│   ├── RuleManager
│   │   ├── RuleList
│   │   └── RuleEditor
│   └── Settings
│       ├── CookieManager
│       └── AIConfig
└── Footer
```

## 组件详细说明

### 1. App (根组件)
- 负责整体布局和路由管理
- 包含Header、Sidebar、MainContent和Footer

### 2. Header
- 显示应用标题和用户信息
- 提供全局操作按钮（如保存、导出等）

### 3. Sidebar
- 导航菜单
- 链接到各个功能模块：
  - 流水线管理
  - 规则管理
  - 设置

### 4. MainContent
- 根据路由显示不同的内容组件

### 5. PipelineManager (流水线管理)
- 管理所有流水线的创建、编辑和执行

#### PipelineList (流水线列表)
- 显示所有流水线的列表
- 支持添加、删除、编辑流水线

#### PipelineEditor (流水线编辑器)
- 编辑流水线的名称、描述
- 管理流水线步骤

### 6. RuleManager (规则管理)
- 管理所有规则的创建、编辑和应用

#### RuleList (规则列表)
- 显示所有规则的列表
- 支持添加、删除、编辑规则

#### RuleEditor (规则编辑器)
- 编辑规则的详细信息
- 定义规则的触发条件和执行动作

### 7. Settings (设置)
- 管理应用的全局设置

#### CookieManager (Cookie管理)
- 管理和配置Cookie

#### AIConfig (AI配置)
- 配置AI相关的参数（如API Key）

### 8. Footer
- 显示版权信息和版本号