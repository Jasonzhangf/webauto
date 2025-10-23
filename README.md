# Page Analyzer v0.1.0

🔍 **智能页面分析器** - 基于Playwright的现代化网页容器发现和层次结构分析系统

## 📋 项目概述

Page Analyzer是一个强大的网页分析工具，专门设计用于智能识别页面结构、发现内容容器并构建层次关系。它采用策略模式支持多种发现策略，具备智能缓存和性能优化功能。

## ✨ 核心特性

### 🎯 智能页面类型识别
- 支持微博等多种社交平台页面类型识别
- 基于URL模式和内容特征的智能匹配
- 可扩展的页面类型配置系统

### 🏗️ 容器发现系统
- **多策略支持** - DOM遍历、CSS选择器、AI辅助等多种策略
- **智能去重** - 自动合并重复发现的容器
- **优先级排序** - 基于重要性的容器排序
- **缓存优化** - 5分钟智能缓存避免重复计算

### 📊 层次结构构建
- **DOM关系分析** - 基于实际DOM位置建立父子关系
- **深度计算** - 自动计算容器在层次结构中的深度
- **关键容器识别** - 智能识别页面中的重要容器
- **类型兼容性** - 验证容器类型组合的合理性

### 🛠️ 开发者友好
- **TypeScript支持** - 完整的类型定义和类型安全
- **模块化设计** - 清晰的组件分离和职责划分
- **可扩展架构** - 易于添加新的发现策略和分析功能
- **测试覆盖** - 完整的单元测试和集成测试

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 构建项目

```bash
npm run build
```

### 基础使用

```typescript
import { PageAnalyzer } from './src/page-analyzer/index.js';
import { chromium } from 'playwright';

async function analyzePage() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://weibo.com');
  
  const analyzer = new PageAnalyzer();
  const result = await analyzer.analyze(page, page.url());
  
  console.log('发现容器数量:', result.containers.length);
  console.log('页面类型:', result.pageType.name);
  console.log('层次结构深度:', result.hierarchy.maxDepth);
  
  await browser.close();
}

analyzePage().catch(console.error);
```

## 📖 API 文档

### 核心组件

#### PageTypeIdentifier
页面类型识别器，用于识别不同类型的页面。

```typescript
const identifier = new PageTypeIdentifier();
const pageType = identifier.identifyPageType('https://weibo.com');
```

#### ContainerDiscoveryManager
容器发现管理器，协调多种发现策略。

```typescript
const manager = new ContainerDiscoveryManager();
const result = await manager.discoverContainers(page, url);
```

#### HierarchyBuilder
层次结构构建器，建立容器间的关系。

```typescript
const builder = new HierarchyBuilder();
const hierarchy = await builder.buildHierarchy(containers, page);
```

#### DOMWalkStrategy
DOM遍历策略，智能发现页面容器。

```typescript
const strategy = new DOMWalkStrategy();
const containers = await strategy.discover(page);
```

### 类型定义

#### ContainerType
支持的容器类型：
- `page` - 页面级容器
- `main` - 主要内容区域
- `sidebar` - 侧边栏
- `feed` - 信息流
- `post` - 帖子/文章
- `widget` - 小部件
- `nav` - 导航
- `header` - 页头
- `footer` - 页脚
- `content` - 内容
- `item` - 项目
- `comment` - 评论
- `media` - 媒体
- `action` - 操作按钮
- `text` - 文本
- `scroll` - 滚动区域
- `navigation` - 导航区域
- `interaction` - 交互区域
- `pagination` - 分页
- `filter` - 筛选
- `user` - 用户信息

#### DiscoveredContainer
发现的容器信息：
```typescript
interface DiscoveredContainer {
  id: string;
  selector: string;
  name: string;
  type: ContainerType;
  priority: number;
  specificity: number;
  rect: DOMRect;
  elementCount: number;
  capabilities: ContainerCapability[];
  metadata: ContainerMetadata;
}
```

## 🧪 测试

### 运行所有测试

```bash
npm test
```
### 运行特定测试

```bash
# 基础功能测试
node test-basic.js

# 容器发现管理器测试
node test-discovery-manager.js

# 层次结构构建器测试
node test-hierarchy-builder.js
```

## 🧭 Workflow Engine 与锚点协议（Anchor Protocol）

> 本项目包含一个事件驱动的浏览器工作流引擎（workflows/engine/*）。为保障接力流程在“确定页面状态”下执行，我们在框架层引入了锚点协议。

### 锚点协议是什么
- 工作流执行前，必须命中“页面入站锚点”（可视元素/容器），否则不进入主流程；
- 关键阶段也可设置“阶段锚点”，例如“搜索结果已呈现”“聊天容器已加载”。

### 如何声明顶层锚点
在工作流 JSON 顶层加入 `anchor` 字段，Runner 会自动执行 Start→AttachSession→AnchorPointNode→End 的锚点检查小流：

```jsonc
{
  "name": "Example Flow",
  "anchor": {
    "hostFilter": "1688.com",
    "selectors": [".userAvatarLogo img"],
    "requireVisible": true,
    "maxWaitMs": 600000,
    "pollIntervalMs": 1500,
    "highlight": true,
    "persistHighlight": true,
    "highlightLabel": "ANCHOR"
  },
  "nodes": [ { "id": "start", "type": "StartNode", "next": ["..."] } ]
}
```

### 在阶段中使用锚点
在合适的阶段插入 `AnchorPointNode`，例如搜索完成后：

```jsonc
{ "id": "search_anchor", "type": "AnchorPointNode",
  "config": { "selectors": ["a[href*='air.1688.com/app/']", ".ww-link.ww-online"],
              "requireVisible": true, "highlight": true, "persistHighlight": true } }
```

### 相关框架改动（已合入）
- 新增节点：`AnchorPointNode`（workflows/engine/nodes/AnchorPointNode.js）
- NodeRegistry 注册锚点节点
- WorkflowRunner 自动检测顶层 `anchor` 并在主流前执行锚点检查小流
- 辅助节点：`EventDrivenOptionalClickNode`（出现即点，未出现跳过）
- 点击增强：`AdvancedClickNode` 支持鼠标可视化/子元素优先打点/Frame 感知

### 运行示例（含预登录）

```bash
node scripts/run-with-preflows.js workflows/1688/relay/1688-search-wangwang-chat-compose.json --keyword=冲锋衣 --debug
```

### 发送按钮定位策略（聊天页）
- data‑spm + 文本“发送”的 span → 提升到最近可点击祖先（button/[role=button]/.im-chat-send-btn/.send-btn/.next-btn）并标记 `data-webauto-send='1'`
- 若未匹配，底部右侧区域评分候选作为兜底；点击阶段使用鼠标移动+悬停+点击（可视化光标）。

## 🏗️ 架构设计

### 策略模式

系统采用策略模式，支持多种容器发现策略：

```
ContainerDiscoveryManager
├── DOMWalkStrategy (已实现)
├── CSSSelectorStrategy (计划中)
├── AIAssistedStrategy (计划中)
└── PatternMatchingStrategy (计划中)
```

### 组件关系

```
PageAnalyzer (主分析器)
├── PageTypeIdentifier (页面类型识别)
├── ContainerDiscoveryManager (容器发现管理)
│   ├── HierarchyBuilder (层次结构构建)
│   └── DiscoveryStrategy[] (发现策略集合)
└── CapabilityEvaluator (能力评估器 - 计划中)
```

## 📊 性能特性

- **智能缓存** - 5分钟缓存避免重复计算
- **并行处理** - 支持多策略并行执行
- **内存优化** - 高效的数据结构和算法
- **增量更新** - 支持页面变化时的增量分析

## 🔧 配置选项

```typescript
interface PageAnalysisConfig {
  enableAIDiscovery: boolean;
  maxDiscoveryDepth: number;
  timeout: number;
  strategies: string[];
  containerTypes: ContainerType[];
  enablePerformanceMonitoring: boolean;
  cacheResults: boolean;
  cacheTimeout: number;
}
```

## 🌟 支持的页面类型

### 微博 (Weibo)
- ✅ 主页 (Homepage)
- ✅ 搜索页 (Search)
- ✅ 个人主页 (Profile)
- ✅ 帖子详情页 (Post Detail)

### 计划支持
- 🔄 Twitter/X
- 🔄 Facebook
- 🔄 Instagram
- 🔄 LinkedIn
- 🔄 Reddit

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📝 开发计划

### v0.2.0 (计划中)
- [ ] CapabilityEvaluator - 容器能力评估
- [ ] PageAnalyzer - 主分析器类
- [ ] 事件系统 - 实时监控
- [ ] 性能优化 - 并行处理

### v0.3.0 (计划中)
- [ ] AI辅助发现策略
- [ ] 更多社交平台支持
- [ ] 可视化分析结果
- [ ] 配置文件支持

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

---

## Workflow Execution (Preflows + Relay)

本项目集成了一个轻量的工作流系统（见 `workflows/`），支持运行前置流程（preflows）、写执行记录、并在同一 Node 进程内进行会话接力。

- 前置流程：`workflows/preflows/enabled.json`（数组，按顺序执行；失败重试 3 次，最终失败则主工作流不启动）。
- 记录：所有运行写入 `workflows/records/`（含 preflow 与主流程结果、变量、输出、参数）。
- 会话接力：默认在 `EndNode` 持久化会话；下一个工作流可用 `AttachSessionNode` 继续使用同一浏览器上下文（同进程）。

快速运行
- 单流程（自动跑 preflows）：`node scripts/run-workflow.js workflows/1688/domestic/1688-homepage-workflow.json`
- 序列接力：`node workflows/SequenceRunner.js workflows/sequences/example-sequence.json`

登录前置（示例）
- `workflows/preflows/1688-login-preflow.json`：先加载本地 Cookie 并验证 `.userAvatarLogo img`；失败进入 10 分钟人工登录等待（每 10s 检测）。成功/失败均写握手记录。

- [Playwright](https://playwright.dev/) - 强大的浏览器自动化框架
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的JavaScript

---

**Page Analyzer v0.1.0** - 让网页分析变得简单而强大 🚀
