# WebAuto 项目最终架构改造计划

## 概述

基于Node封装、WebSocket控制、双模式运行和DOM式容器架构的WebAuto项目全新架构设计。

## 核心架构概念

### 1. Node封装层设计

**设计原则**:
- 浏览器应用封装为Node（底层保留Python实现）
- 应用层不可直接调用浏览器底层API
- 纯函数式接口+不可变描述
- 通过async job queue执行操作

**核心接口**:
```python
@dataclass(frozen=True)
class NodeDescription:
    name: str
    capabilities: List[str]  # ['dom', 'network', 'screenshot', 'form']
    parameters: Dict[str, FieldDescription]
    async_mode: bool = True

class NodeInterface(ABC):
    @abstractmethod
    async def execute(self, context: ExecutionContext) -> NodeResult:
        pass

    @abstractmethod
    def get_description(self) -> NodeDescription:
        pass
```

**Python Executor接口**:
```python
class PythonExecutor:
    def __init__(self, browser_manager: BrowserManager):
        self.browser_manager = browser_manager
        self.job_queue = AsyncJobQueue(max_workers=4)

    async def execute_navigate(self, url: str, wait_for: Optional[str]) -> NodeResult:
        job = NavigateJob(url, wait_for)
        return await self.job_queue.execute(job)

    async def execute_query(self, selector: str, extract: ExtractType) -> NodeResult:
        job = QueryJob(selector, extract)
        return await self.job_queue.execute(job)
```

### 2. WebSocket会话管理

**Session状态机**:
```
Init -> Active -> Suspended -> Closed
```

**核心模型**:
```python
@dataclass
class Session:
    session_id: str
    state: SessionState
    browser_instance: BrowserInstance
    lease_holder: Optional[str] = None
    capabilities: Set[str] = field(default_factory=set)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)

class SessionManager:
    async def create_session(self, capabilities: Set[str]) -> Session:
        # 创建新会话，分配浏览器实例
        pass

    async def acquire_lease(self, session_id: str, client_id: str) -> bool:
        # 获取会话租约，支持并发控制
        pass
```

**WebSocket接口**:
```python
class BrowserWebSocketHandler:
    async def handle_command(self, websocket: WebSocket, command: BrowserCommand):
        # 验证session和lease
        # 执行Node命令
        # 返回结果给客户端
        pass
```

### 3. Browser CLI工具设计

**命令结构**:
```bash
# Session管理
browser session create --capabilities "dom,screenshot"
browser session list
browser session info --session <session_id>
browser session delete --session <session_id>
browser session mode set --session <session_id> --mode dev|run

# Node执行
browser node exec --session <session_id> --node navigate --params '{"url": "https://example.com"}'
browser node exec --session <session_id> --node query --params '{"selector": ".title", "extract": "text"}'
browser node batch --session <session_id> --file workflow.json

# 容器操作
browser container match --session <session_id> --url <current_url>
browser container discover --session <session_id> --root-selector <selector>
browser container save --session <session_id> --name <container_name> --selector <selector>
browser container test --container <container_file>

# Dev工具
browser dev overlay enable --session <session_id>
browser dev inspect --session <session_id> --selector <selector>
browser dev highlight --session <session_id> --selector <selector>
browser dev logs --session <session_id> --tail
```

### 4. DOM式容器架构

**核心概念**:
- 类似DOM的层层递进容器库
- 唯一根selector匹配
- 子容器发现和operation编辑
- 评分机制选择最优匹配

**数据结构**:
```python
@dataclass
class ContainerMatcher:
    selector: str
    attributes: Dict[str, Any]
    text_patterns: List[str]
    position_weights: Dict[str, float]
    similarity_threshold: float = 0.8

@dataclass
class ContainerAction:
    action_type: str  # 'click', 'input', 'extract', 'wait'
    selector: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    timeout: int = 30000

@dataclass
class Container:
    name: str
    matcher: ContainerMatcher
    actions: List[ContainerAction] = field(default_factory=list)
    children: List['Container'] = field(default_factory=list)
    xpath: Optional[str] = None
    confidence: float = 0.0
```

**匹配算法**:
```python
class ContainerDiscoveryEngine:
    async def match_root_container(self, session_id: str, page_url: str) -> Optional[Container]:
        # 唯一根selector匹配
        # 基于URL pattern、页面特征、selector唯一性计算置信度
        pass

    async def discover_children(self, session_id: str, parent_container: Container) -> List[Container]:
        # 在父容器DOM scope内进行BFS搜索
        # 评分机制选择最优子容器
        pass
```

### 5. 双模式架构

**模式定义**:
- **Dev模式**: 注入UI，交互式页面分析和容器创建、调试
- **运行模式**: 自动化执行预设工作流

**Mode Controller**:
```python
class ModeController:
    async def switch_mode(self, session_id: str, target_mode: OperatingMode) -> bool:
        # 确保操作队列为空
        # 切换模式配置
        # 注入/卸载UI overlay
        # 启用/关闭调试channel
        pass

    async def _enable_dev_mode(self, session: Session):
        # 注入UI overlay
        # 启用调试channel
        pass

    async def _enable_run_mode(self, session: Session):
        # 卸载overlay
        # 关闭调试channel
        pass
```

**UI Overlay注入**:
```javascript
class DevOverlay {
    constructor(browserSession) {
        this.session = browserSession;
        this.inspectMode = false;
        this.containerEditor = new ContainerEditor();
        this.workflowRecorder = new WorkflowRecorder();
    }

    async inject() {
        // 在沙箱iframe中注入UI
        // 建立与宿主的安全通信
        // 启用元素高亮和检查
        pass
    }
}
```

## 目录结构设计

```
webauto/
├── protocols/              # 语言无关的协议定义
│   ├── schemas/           # JSON Schema定义
│   ├── types/             # 共享TypeScript类型
│   └── contracts/         # 接口契约
├── core/                  # 共享抽象层
│   ├── nodes/            # Node接口定义
│   ├── browser/          # 浏览器抽象
│   ├── container/        # 容器管理抽象
│   ├── session/          # 会话管理抽象
│   └── mode/             # 模式控制抽象
├── services/             # 集成适配器层
│   ├── browser_service/  # 浏览器服务实现
│   ├── session_service/  # 会话服务
│   ├── websocket/        # WebSocket服务
│   └── gateway/          # 跨语言网关
├── adapters/             # 客户端适配器
│   ├── js/              # JavaScript自动化包
│   │   ├── packages/browser/
│   │   ├── packages/overlay/
│   │   └── packages/cli/
│   └── python/          # Python适配器
├── cli/                  # Browser CLI工具
│   ├── commands/        # CLI命令实现
│   ├── utils/           # CLI工具函数
│   └── docs/            # CLI文档
├── container_library/    # 容器库
│   ├── matchers/        # 匹配器定义
│   ├── actions/         # 操作定义
│   └── schemas/         # 容器schema
├── tests/               # 分层测试
│   ├── unit/           # 单元测试
│   ├── integration/    # 集成测试
│   └── e2e/           # 端到端测试
└── docs/               # 项目文档
    ├── architecture/   # 架构文档
    ├── api/           # API文档
    └── guides/        # 使用指南
```

## 实施计划

### Phase 1: 基础架构 (Week 1-2)

**目标**: 建立Node接口、Python Executor、Session FSM和WebSocket服务

**实施内容**:
1. 实现Node接口和基础Node类型（Navigate, Query, Click等）
2. 建立Python Executor和AsyncJobQueue
3. 实现Session状态机和SessionManager
4. 开发基础WebSocket服务
5. 实现核心Browser CLI命令（session管理、基础node执行）

**成功标准**:
- Node接口可执行基础浏览器操作
- Session支持创建、删除、状态查询
- WebSocket可处理基础命令
- CLI可创建session并执行简单操作

### Phase 2: 容器系统 (Week 2-3)

**目标**: 实现DOM式容器匹配算法和容器库管理

**实施内容**:
1. 实现Container数据结构和ContainerMatcher
2. 开发ContainerDiscoveryEngine匹配算法
3. 建立container_library存储系统
4. 实现容器CLI命令（match, discover, save, test）
5. 开发容器编辑和验证工具

**成功标准**:
- 根容器匹配准确率 > 90%
- 子容器发现功能正常
- 容器可保存到库中并复用
- CLI支持完整容器操作

### Phase 3: 双模式支持 (Week 3-4)

**目标**: 实现Mode Controller和Dev/Run模式切换

**实施内容**:
1. 实现Mode Controller和模式切换逻辑
2. 开发UI Overlay注入机制
3. 建立Dev模式和调试channel
4. 实现Run模式执行引擎
5. 开发模式切换CLI命令

**成功标准**:
- Dev/Run模式无缝切换 < 2秒
- UI overlay安全注入和控制
- Dev模式支持交互式调试
- Run模式支持自动化执行

### Phase 4: CLI完善 (Week 4-5)

**目标**: 完善Browser CLI所有功能和文档

**实施内容**:
1. 完善所有CLI命令实现
2. 添加token认证和安全控制
3. 实现并发控制和租约机制
4. 编写完整的CLI MD文档
5. 添加错误处理和日志功能

**成功标准**:
- CLI命令覆盖率 = 100%
- 支持并发会话控制
- 完整的文档和示例
- 安全认证机制正常

### Phase 5: 集成测试 (Week 5-6)

**目标**: 端到端功能测试和性能优化

**实施内容**:
1. 端到端功能测试
2. 性能优化和压力测试
3. 文档完善和培训材料
4. 部署和运维工具
5. 监控和告警系统

**成功标准**:
- 所有核心功能正常工作
- 支持10个并发WebSocket连接
- 容器匹配准确率 > 95%
- 完整的文档和运维指南

## 技术要求

### 性能指标
- WebSocket响应时间 < 100ms
- 容器匹配时间 < 500ms
- 模式切换时间 < 2秒
- 支持10个并发会话

### 安全要求
- Token认证机制
- Session租约和锁定
- 安全的UI注入
- 审计日志记录

### 质量标准
- 代码覆盖率 > 85%
- 所有API有文档
- 错误处理完善
- 兼容性测试通过

## 风险控制

### 技术风险
- WebSocket通信性能：采用压缩和二进制协议
- UI注入安全性：沙箱iframe + CSP
- 容器匹配准确性：评分算法 + 人工验证

### 实施风险
- 并发开发冲突：模块化接口设计
- 质量控制：分阶段验收测试
- 进度延期：缓冲时间和优先级管理

## 最终交付物

### 代码交付
- 完整的架构重构代码
- 测试套件和CI/CD流水线
- 部署脚本和配置文件

### 文档交付
- 架构设计文档
- API参考文档
- CLI使用手册
- 运维指南

### 培训交付
- 开发者培训材料
- 用户使用指南
- 最佳实践文档