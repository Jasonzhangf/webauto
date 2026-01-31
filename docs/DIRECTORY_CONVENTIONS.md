# 仓库目录约定与迁移指南

> 最后更新：2026-01-30

## 目录职责划分

### 1. `libs/` - 核心库（唯一真源）

**职责**：提供可复用的基础能力与框架代码，**禁止业务逻辑**。

**当前活跃模块**：
- `libs/operations-framework/` - **唯一真源**：事件驱动、消息总线、工作流基础设施
- `libs/browser/` - 浏览器抽象层（会话管理、Cookie、指纹、远程服务）
- `libs/containers/` - 容器检测库
- `libs/ui-recognition/` - UI 识别库
- `libs/actions-system/` - 动作系统
- `libs/workflows/` - 工作流模板
- `libs/openai-compatible-providers/` - AI 提供商适配

**规则**：
- ✅ 允许：框架级抽象、可复用工具、类型定义
- ❌ 禁止：平台特定业务逻辑、硬编码配置

---

### 2. `modules/` - 业务逻辑模块

**职责**：基于 `libs/` 的框架，实现具体业务功能。

**当前活跃模块**：
- `modules/workflow/` - 工作流引擎（基于 `libs/operations-framework`）
- `modules/browser/` - 浏览器业务逻辑（基于 `libs/browser`）
- `modules/container-matcher/` - 容器匹配业务逻辑
- `modules/session-manager/` - 会话管理业务逻辑
- `modules/controller/` - 控制器
- `modules/search-gate/` - 搜索节流
- `modules/config/` - **唯一配置模块**
- `modules/xiaohongshu/` - 小红书平台特定业务
- `modules/logging/` - 日志模块
- `modules/api-usage/` - API 使用统计

**规则**：
- ✅ 允许：业务编排、平台特定逻辑、模块间协调
- ❌ 禁止：重复实现 `libs/` 中已有的框架能力

---

### 3. `sharedmodule/` - **LEGACY（已废弃）**

**状态**：此目录已废弃，**禁止新增任何引用**。

**迁移路径**：
- `sharedmodule/operations-framework/` → **已废弃**，使用 `libs/operations-framework/`
- `sharedmodule/engines/` → 逐步迁移到 `modules/` 或 `services/`
- `sharedmodule/libraries/` → 逐步迁移到 `libs/`

**详见**: `sharedmodule/operations-framework/LEGACY.md`

---

### 4. `services/` - 服务层

**职责**：纯技术实现，**无业务逻辑**，通过 HTTP/WebSocket 对外提供能力。

**当前结构**（混合语言）：
```
services/
├── unified-api/        # TypeScript - 统一 API
├── browser-service/    # TypeScript - 浏览器服务
├── engines/            # TypeScript - 各类引擎
├── controller/         # TypeScript - 控制器服务
├── shared/             # TypeScript - 共享服务代码
├── legacy/             # Python - 遗留服务
├── *.py                # Python - 顶层遗留服务文件（待迁移）
└── __init__.py
```

**规划目标结构**（语言分层）：
```
services/
├── ts/                 # TypeScript 服务
│   ├── unified-api/
│   ├── browser-service/
│   └── engines/
└── py/                 # Python 服务（兼容层）
    ├── browser_service.py
    └── ...
```

**迁移策略**：
- 阶段1：保持现有入口不变，新增转发层
- 阶段2：逐步移动实现到 `ts/` 或 `py/`
- 阶段3：更新入口脚本

---

### 5. `apps/` - 应用层

**职责**：用户界面与交互，基于 `services/` 和 `modules/` 提供能力。

**当前应用**：
- `apps/desktop-console/` - 桌面控制台（Electron）
- `apps/floating-panel/` - 浮窗面板（Electron）
- `apps/webauto/` - WebAuto 主应用

**规则**：
- ✅ 允许：UI 逻辑、用户交互、配置界面
- ❌ 禁止：直接操作浏览器底层、业务逻辑

---

### 6. `runtime/` - 运行时注入代码

**职责**：注入浏览器环境的 JavaScript 代码（可以是 `.js`）。

**目录**：
- `runtime/browser/` - 浏览器运行时
- `runtime/containers/` - 容器运行时
- `runtime/infra/` - 基础设施脚本

**规则**：
- ✅ 允许：浏览器注入脚本、页面 evaluate 脚本
- ❌ 禁止：业务逻辑、配置管理

---

### 7. `scripts/` - 脚本工具

**职责**：CLI 参数解析与任务编排，**不含业务逻辑**。

**规则**：
- ✅ 允许：命令行入口、参数解析、任务调度
- ❌ 禁止：直接实现业务逻辑（应调用 `modules/` 或 `services/`）

---

## 构建产物约定

### 规则：**运行态只允许从根 `dist/` 加载**

**产物路径**：
```
dist/
├── services/      # services/ 编译产物
├── modules/       # modules/ 编译产物
├── sharedmodule/  # sharedmodule/ 编译产物（legacy）
├── libs/          # libs/ 编译产物
└── ...
```

**禁止**：
- ❌ 子目录独立 `dist/`（如 `libs/browser/dist`、`libs/operations-framework/dist`）
- ❌ 运行时直接加载 `.ts` 源文件

**迁移策略**：
- 阶段1：保留子目录 `dist/`，但**禁止运行时引用**
- 阶段2：逐步移除子目录 `dist/`
- 阶段3：强制只从根 `dist/` 加载

---

## 自检规则

### 1. 禁止新增 legacy 引用

**自检脚本**: `scripts/check-legacy-refs.mjs`

**接入点**: `npm test` / `prebuild` / CI

**规则**：
- ❌ 禁止引用 `sharedmodule/operations-framework`
- ✅ 使用 `libs/operations-framework`

### 2. 禁止未 track 文件参与构建

**自检脚本**: `scripts/check-untracked-sources.mjs`（待实现）

**接入点**: `npm test` / `prebuild` / CI

**规则**：
- ❌ 禁止 `services/`、`modules/`、`libs/`、`apps/`、`runtime/`、`scripts/` 中存在未被 git track 且未被 ignore 的源码文件

---

## 迁移优先级

### 高优先级（立即执行）
1. ✅ 标记 `sharedmodule/operations-framework` 为 legacy
2. ✅ 添加 `scripts/check-legacy-refs.mjs` 自检
3. ⏳ 实现 `scripts/check-untracked-sources.mjs`

### 中优先级（逐步推进）
4. ⏳ 统一 `modules/browser` 与 `libs/browser`
5. ⏳ 迁移 Python 服务到 `services/py/`
6. ⏳ 统一配置中心到 `modules/config`

### 低优先级（长期规划）
7. ⏳ 清理子目录 `dist/`
8. ⏳ 迁移 `sharedmodule/engines` 到 `modules/`

---

## 违规处理

**发现违规时**：
1. 运行 `scripts/check-legacy-refs.mjs` 确认
2. 修复引用（替换为唯一真源）
3. 运行 `npm test` 验证
4. 提交修复

**新增功能时**：
1. 检查功能是否已在其他目录实现
2. 优先复用 `libs/` 中的框架能力
3. 仅当确实需要新功能时才添加

---

**最后更新**: 2026-01-30  
**维护者**: WebAuto Team
