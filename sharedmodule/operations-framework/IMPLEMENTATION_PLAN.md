# WebAuto Universal Operator Framework - 实施计划

## 🎯 总体策略

**从最小可行系统开始，逐步扩展到完整架构**

### 阶段性方法
1. **MVP阶段**: 基础浏览器操作子 + 简单工作流
2. **扩展阶段**: 条件操作子 + 状态管理
3. **完善阶段**: 可视化 + 动态加载 + 高级功能

---

## 📋 第一阶段：最小可行系统 (MVP)

### 1.1 基础框架搭建
**目标**: 建立最简单的操作子框架

#### 1.1.1 核心文件结构
```
sharedmodule/operations-framework/
├── src/
│   ├── core/
│   │   ├── UniversalOperator.ts        # 通用操作子基类
│   │   ├── PageBasedOperator.ts         # 页面操作子基类
│   │   ├── NonPageOperator.ts          # 非页面操作子基类
│   │   └── types/
│   │       ├── OperatorTypes.ts          # 基础类型定义
│   │       └── CommonTypes.ts            # 通用类型
│   ├── operators/
│   │   ├── browser/
│   │   │   ├── CookieOperator.ts         # Cookie操作子
│   │   │   ├── NavigationOperator.ts     # 导航操作子
│   │   │   └── ScrollOperator.ts         # 滚动操作子
│   │   └── control/
│   │       ├── ConditionOperator.ts     # 条件操作子
│   │       └── StateOperator.ts         # 状态操作子
│   ├── workflow/
│   │   ├── SimpleWorkflowEngine.ts      # 简单工作流引擎
│   │   └── types/
│   │       └── WorkflowTypes.ts          # 工作流类型
│   └── index.ts                         # 入口文件
├── examples/
│   ├── demo-workflow.ts                 # 演示工作流
│   └── basic-usage.ts                   # 基础使用示例
├── tests/
│   ├── unit/
│   │   ├── operators/
│   │   └── workflow/
│   └── e2e/
│       └── demo-workflow.test.ts         # 端到端测试
└── package.json
```

#### 1.1.2 文件命名规则
**严格规则**:
- 类名: `PascalCase` (如: `CookieOperator`)
- 文件名: `PascalCase.ts` (如: `CookieOperator.ts`)
- 接口名: `I` + `PascalCase` (如: `IOperator`)
- 类型名: `PascalCase` + `Type` (如: `OperatorType`)
- 常量: `UPPER_SNAKE_CASE` (如: `MAX_TIMEOUT`)
- 变量/函数: `camelCase` (如: `executeOperator`)

#### 1.1.3 目录命名规则
- `src/`: 源代码目录
- `src/core/`: 核心框架组件
- `src/operators/`: 操作子实现
- `src/workflow/`: 工作流相关
- `src/types/`: 类型定义
- `examples/`: 使用示例
- `tests/`: 测试文件

### 1.2 基础操作子实现

#### 1.2.1 UniversalOperator 基类
**文件**: `src/core/UniversalOperator.ts`
**优先级**: 🔴 最高
**工时**: 2小时

```typescript
// 最简化的通用操作子基类
import { RCCBaseModule } from 'rcc-basemodule';

export abstract class UniversalOperator extends RCCBaseModule {
  protected _id: string;
  protected _name: string;
  protected _type: string;
  protected _state: 'idle' | 'running' | 'completed' | 'error';

  constructor(config: { id: string; name: string; type: string }) {
    super();
    this._id = config.id;
    this._name = config.name;
    this._type = config.type;
    this._state = 'idle';
  }

  // 核心方法
  abstract execute(params: any): Promise<OperationResult>;

  // 通用方法
  async getState(): Promise<string> {
    return this._state;
  }

  protected log(message: string): void {
    console.log(`[${this._name}] ${message}`);
  }
}

export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

#### 1.2.2 PageBasedOperator 页面操作子基类
**文件**: `src/core/PageBasedOperator.ts`
**优先级**: 🔴 最高
**工时**: 1小时

#### 1.2.3 NonPageOperator 非页面操作子基类
**文件**: `src/core/NonPageOperator.ts`
**优先级**: 🔴 最高
**工时**: 1小时

### 1.3 浏览器操作子实现

#### 1.3.1 CookieOperator Cookie操作子
**文件**: `src/operators/browser/CookieOperator.ts`
**优先级**: 🔴 最高
**工时**: 3小时

**功能**:
- 保存Cookie到文件
- 从文件加载Cookie
- 清除Cookie

```typescript
export class CookieOperator extends NonPageOperator {
  constructor() {
    super({
      id: 'cookie-operator',
      name: 'Cookie操作子',
      type: 'cookie'
    });
  }

  async execute(params: CookieParams): Promise<OperationResult> {
    switch (params.action) {
      case 'save':
        return this.saveCookies(params.path);
      case 'load':
        return this.loadCookies(params.path);
      case 'clear':
        return this.clearCookies();
      default:
        throw new Error(`未知操作: ${params.action}`);
    }
  }

  private async saveCookies(path: string): Promise<OperationResult> {
    // 实现保存逻辑
  }

  private async loadCookies(path: string): Promise<OperationResult> {
    // 实现加载逻辑
  }

  private async clearCookies(): Promise<OperationResult> {
    // 实现清除逻辑
  }
}
```

#### 1.3.2 NavigationOperator 导航操作子
**文件**: `src/operators/browser/NavigationOperator.ts`
**优先级**: 🔴 最高
**工时**: 2小时

**功能**:
- 导航到指定URL
- 获取当前页面URL
- 页面刷新

#### 1.3.3 ScrollOperator 滚动操作子
**文件**: `src/operators/browser/ScrollOperator.ts`
**优先级**: 🟡 中等
**工时**: 2小时

**功能**:
- 滚动到页面顶部/底部
- 滚动指定像素
- 平滑滚动

### 1.4 控制操作子实现

#### 1.4.1 ConditionOperator 条件操作子
**文件**: `src/operators/control/ConditionOperator.ts`
**优先级**: 🟡 中等
**工时**: 2小时

**功能**:
- 判断条件是否成立
- 支持成功/失败判断
- 支持自定义条件

#### 1.4.2 StateOperator 状态操作子
**文件**: `src/operators/control/StateOperator.ts`
**优先级**: 🟡 中等
**工时**: 2小时

**功能**:
- 设置工作流状态
- 获取工作流状态
- 状态持久化

### 1.5 简单工作流引擎

#### 1.5.1 SimpleWorkflowEngine
**文件**: `src/workflow/SimpleWorkflowEngine.ts`
**优先级**: 🔴 最高
**工时**: 4小时

**功能**:
- 顺序执行操作子
- 基本的错误处理
- 简单的状态传递

### 1.6 演示工作流

#### 1.6.1 微博自动化演示
**文件**: `examples/demo-workflow.ts`
**优先级**: 🟡 中等
**工时**: 2小时

**工作流**:
```
浏览器初始化 -> Cookie加载 -> [成功] -> 导航到微博主页
                              -> [失败] -> 等待手动登录 -> Cookie保存
```

---

## 📊 任务追踪表

### Phase 1: MVP核心功能

| 任务ID | 任务名称 | 文件路径 | 优先级 | 工时 | 状态 | 负责人 |
|--------|----------|----------|--------|------|------|--------|
| T001 | UniversalOperator基类 | src/core/UniversalOperator.ts | 🔴 最高 | 2h | ⏳ 待开始 | Claude |
| T002 | PageBasedOperator基类 | src/core/PageBasedOperator.ts | 🔴 最高 | 1h | ⏳ 待开始 | Claude |
| T003 | NonPageOperator基类 | src/core/NonPageOperator.ts | 🔴 最高 | 1h | ⏳ 待开始 | Claude |
| T004 | CookieOperator实现 | src/operators/browser/CookieOperator.ts | 🔴 最高 | 3h | ⏳ 待开始 | Claude |
| T005 | NavigationOperator实现 | src/operators/browser/NavigationOperator.ts | 🔴 最高 | 2h | ⏳ 待开始 | Claude |
| T006 | ScrollOperator实现 | src/operators/browser/ScrollOperator.ts | 🟡 中等 | 2h | ⏳ 待开始 | Claude |
| T007 | ConditionOperator实现 | src/operators/control/ConditionOperator.ts | 🟡 中等 | 2h | ⏳ 待开始 | Claude |
| T008 | StateOperator实现 | src/operators/control/StateOperator.ts | 🟡 中等 | 2h | ⏳ 待开始 | Claude |
| T009 | SimpleWorkflowEngine | src/workflow/SimpleWorkflowEngine.ts | 🔴 最高 | 4h | ⏳ 待开始 | Claude |
| T010 | 微博演示工作流 | examples/demo-workflow.ts | 🟡 中等 | 2h | ⏳ 待开始 | Claude |
| T011 | 基础类型定义 | src/core/types/OperatorTypes.ts | 🔴 最高 | 1h | ⏳ 待开始 | Claude |
| T012 | 入口文件 | src/index.ts | 🔴 最高 | 0.5h | ⏳ 待开始 | Claude |
| T013 | 单元测试 | tests/unit/operators/ | 🟡 中等 | 3h | ⏳ 待开始 | Claude |
| T014 | 端到端测试 | tests/e2e/demo-workflow.test.ts | 🟡 中等 | 2h | ⏳ 待开始 | Claude |

### 总工时估算: 25.5小时

---

## 🎯 第一阶段成功标准

### 功能标准
- [ ] UniversalOperator基类可正常实例化
- [ ] Cookie操作子能正常保存和加载Cookie
- [ ] Navigation操作子能正常导航到指定URL
- [ ] SimpleWorkflowEngine能按顺序执行操作子
- [ ] 演示工作流能完整运行

### 质量标准
- [ ] 所有操作子都有完整的错误处理
- [ ] 代码符合TypeScript规范
- [ ] 有基础的单元测试覆盖
- [ ] 有清晰的文档和注释

### 性能标准
- [ ] 工作流执行时间不超过预期
- [ ] 内存使用合理
- [ ] 错误恢复机制正常

---

## 📈 第二阶段：扩展功能 (第一阶段完成后开始)

### 计划功能
1. **动态操作子加载系统**
2. **可视化工作流设计器基础版**
3. **更多浏览器操作子**
4. **文件操作子**
5. **高级工作流控制流**

---

## 📝 开发规范

### 代码规范
- 使用TypeScript严格模式
- 所有公共API必须有JSDoc注释
- 错误处理必须完整
- 避免硬编码，使用配置文件

### 测试规范
- 每个操作子必须有单元测试
- 核心功能必须有集成测试
- 测试覆盖率不低于80%

### 文档规范
- 每个文件必须有文件头注释
- 复杂逻辑必须有行内注释
- API变更必须更新文档

---

## 🚀 开始实施

### 第一步：创建基础目录结构
```bash
mkdir -p src/core/types
mkdir -p src/operators/browser
mkdir -p src/operators/control
mkdir -p src/workflow/types
mkdir -p examples
mkdir -p tests/{unit,e2e}
```

### 第二步：实现UniversalOperator基类
这是整个框架的核心，必须首先完成。

### 第三步：实现基础浏览器操作子
从CookieOperator开始，这是演示工作流的关键。

### 第四步：实现简单工作流引擎
将操作子连接起来执行。

### 第五步：创建演示工作流
验证整个系统是否正常工作。

**准备开始实施吗？**