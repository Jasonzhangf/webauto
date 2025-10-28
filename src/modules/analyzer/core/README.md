# Page Analyzer Core Components

## 概述

Page Analyzer Core 是网页容器分析框架的核心组件，提供了完整的页面结构发现、容器识别和能力评估功能。

## 架构设计

### 核心组件

- **ContainerDiscoveryManager** - 容器发现管理器
- **CapabilityEvaluator** - 能力评估器  
- **HierarchyBuilder** - 层次结构构建器
- **PageTypeIdentifier** - 页面类型识别器

## 组件详细说明

### ContainerDiscoveryManager

负责管理和协调页面容器的发现过程。

**主要功能:**
- 容器发现策略的注册和管理
- 发现过程的协调和控制
- 发现结果的处理和验证

**使用示例:**
```typescript
const discoveryManager = new ContainerDiscoveryManager();
const containers = await discoveryManager.discoverContainers(page);
```

### CapabilityEvaluator

评估容器的能力和特征。

**主要功能:**
- 容器能力分析
- 特征提取和评估
- 容器分类和标记

**使用示例:**
```typescript
const evaluator = new CapabilityEvaluator();
const capabilities = await evaluator.evaluateContainer(container);
```

### HierarchyBuilder

构建页面容器的层次结构。

**主要功能:**
- 容器层次关系分析
- 结构树构建
- 关系映射和优化

**使用示例:**
```typescript
const hierarchyBuilder = new HierarchyBuilder();
const hierarchy = await hierarchyBuilder.buildHierarchy(containers);
```

### PageTypeIdentifier

识别页面类型和特征。

**主要功能:**
- 页面类型检测
- URL模式匹配
- 页面特征分析

**使用示例:**
```typescript
const identifier = new PageTypeIdentifier();
const pageType = await identifier.identifyPage(page);
```

## 类型定义

核心组件使用统一的类型定义，位于 `../types/` 目录：

- **ContainerType** - 容器类型枚举
- **Container** - 容器接口定义
- **Capability** - 能力接口定义
- **HierarchyNode** - 层次节点定义

## 配置选项

每个组件都支持灵活的配置选项：

```typescript
const options = {
  maxDepth: 10
