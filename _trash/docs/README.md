# WebAuto - 浏览器自动化框架

## 概述

WebAuto是一个现代化的浏览器自动化框架，采用Node封装、WebSocket控制、双模式运行和DOM式容器架构，提供强大而灵活的网页自动化能力。

## 核心特性

### 1. Node封装架构
- **纯函数式Node**: 每个浏览器操作封装为独立Node
- **统一接口**: 标准化的Node执行和参数验证
- **自动重试**: 内置重试机制和错误恢复
- **异步执行**: 高性能的异步任务队列

### 2. WebSocket会话控制
- **完整会话管理**: 创建、监控、删除浏览器会话
- **远程控制**: 通过WebSocket完全控制浏览器
- **并发支持**: 支持多个并发会话
- **租约机制**: 会话锁定和权限控制

### 3. 双模式运行
- **Dev模式**: 交互式调试，UI覆盖层注入
- **Run模式**: 高性能自动化执行
- **无缝切换**: 模式间原子性切换
- **实时监控**: 完整的状态跟踪和事件记录

### 4. DOM式容器架构
- **层层递进**: 类似DOM的容器匹配和发现
- **智能匹配**: 基于URL、特征和选择器的匹配算法
- **自适应阈值**: 动态调整匹配置信度
- **容器库**: 持久化的容器定义和管理

## 架构设计

```
WebAuto/
├── core/                    # 核心组件
│   ├── nodes/            # Node系统
│   ├── executor/         # Python执行器
│   ├── session/          # 会话管理
│   ├── container/        # 容器系统
│   └── mode/            # 模式控制
├── services/              # 服务层
│   ├── websocket/        # WebSocket服务
│   └── browser_service/  # 浏览器服务
├── cli/                  # 命令行接口
│   ├── commands/        # CLI命令
│   └── utils/           # 工具函数
├── tests/                # 测试
└── docs/                 # 文档
```

## 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
```

### 启动WebSocket服务

```bash
python -m services.websocket_server --port 8765
```

### 使用CLI

```bash
# 创建浏览器会话
python -m cli.main session create --capabilities "dom,screenshot"

# 执行Node操作
python -m cli.main node exec <session_id> navigate --params '{"url": "https://example.com"}'

# 启用Dev模式
python -m cli.main dev overlay enable <session_id>

# 运行工作流
python -m cli.main workflow run <session_id> workflow.json
```

## 详细使用指南

### 会话管理

```bash
# 创建新会话
browser session create --capabilities "dom,screenshot,network"

# 列出所有会话
browser session list

# 获取会话信息
browser session info <session_id>

# 设置会话模式
browser session mode set <session_id> dev

# 删除会话
browser session delete <session_id>
```

### Node执行

```bash
# 执行单个Node
browser node exec <session_id> navigate --params '{"url": "https://example.com"}'

# 批量执行
browser node batch <session_id> workflow.json

# 支持的Node类型
# - navigate: 页面导航
# - click: 元素点击
# - input: 表单输入
# - query: DOM查询
# - wait: 等待操作
```

### 容器操作

```bash
# 匹配根容器
browser container match <session_id> <url>

# 发现子容器
browser container discover <session_id> --root-selector ".main"

# 保存容器
browser container save <session_id> <container_name> <selector>

# 测试容器定义
browser container test <container_file>
```

### Dev模式调试

```bash
# 启用覆盖层
browser dev overlay enable <session_id>

# 检查元素
browser dev inspect <session_id> ".button"

# 获取调试事件
browser dev events <session_id> --limit 20

# 截图
browser dev screenshot <session_id>

# 清除高亮
browser dev clear-highlights <session_id>
```

### 工作流管理

```bash
# 运行工作流
browser workflow run <session_id> workflow.json

# 录制工作流
browser workflow record <session_id> output.json

# 验证工作流
browser workflow validate workflow.json
```

## 配置文件

### CLI配置 (`~/.webauto-cli.json`)

```json
{
  "websocket_url": "ws://localhost:8765",
  "default_capabilities": ["dom", "screenshot"],
  "output_format": "table",
  "timeout": 30000,
  "retry_count": 3
}
```

### 环境变量

```bash
export WEBAUTO_SESSION_ID="your-session-id"
export WEBAUTO_LOG_LEVEL="INFO"
```

## 开发指南

### 创建自定义Node

```python
from core.nodes import NodeInterface, NodeDescription, NodeResult, ExecutionContext
from typing import Any, Dict

class CustomNode(NodeInterface):
    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.custom_param = parameters.get('custom_param')

    async def execute(self, context: ExecutionContext) -> NodeResult:
        # 实现自定义逻辑
        return NodeResult(success=True, data={"result": "custom"})

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="custom",
            capabilities=["dom", "network"],
            parameters={
                "custom_param": FieldDescription(
                    name="custom_param",
                    type="string",
                    description="Custom parameter description"
                )
            }
        )
```

### 扩展Dev模式

```python
from core.mode.models import DevSession, DebugEvent

class CustomDevMode:
    def __init__(self):
        self.debug_events = []

    def add_custom_event(self, session_id: str, event_data: Dict[str, Any]):
        event = DebugEvent(
            session_id=session_id,
            event_type="custom_event",
            data=event_data
        )
        self.debug_events.append(event)
```

## API参考

### WebSocket API

#### 连接WebSocket
```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.send(JSON.stringify({
    'type': 'command',
    'session_id': 'your-session-id',
    'data': {
        'command_type': 'node_execute',
        'node_type': 'navigate',
        'parameters': {'url': 'https://example.com'}
    }
}));
```

#### 消息格式
```javascript
// 命令消息
{
    "type": "command",
    "session_id": "session-123",
    "data": {
        "command_type": "string",
        "action": "string",
        "parameters": {}
    }
}

// 响应消息
{
    "type": "response",
    "success": true,
    "data": {}
}
```

### Node API

#### NavigateNode
```python
navigate_node = NavigateNode(
    url="https://example.com",
    wait_for=".content"
)
```

#### QueryNode
```python
query_node = QueryNode(
    selector=".title",
    extract_type=ExtractType.TEXT,
    multiple=False
)
```

#### ClickNode
```python
click_node = ClickNode(
    selector="button.submit",
    wait_before=500,
    wait_after=1000
)
```

### 容器API

#### ContainerMatcher
```python
matcher = ContainerMatcher(
    selector=".main-content",
    attributes={"class": "main-content"},
    text_patterns=["content", "main"],
    similarity_threshold=0.8
)
```

#### ContainerAction
```python
action = ContainerAction(
    action_type="click",
    selector=".submit-button",
    parameters={},
    timeout=30000
)
```

## 故障排除

### 常见问题

#### WebSocket连接失败
```bash
# 检查服务状态
curl -I ws://localhost:8765

# 检查端口占用
netstat -an | grep 8765
```

#### Node执行失败
- 检查参数验证
- 验证会话连接状态
- 检查浏览器实例

#### 容器匹配失败
- 验证选择器语法
- 检查页面加载状态
- 调整置信度阈值

#### Dev模式问题
- 检查覆盖层注入
- 验证权限配置
- 查看调试事件

### 调试模式

```bash
# 启用详细日志
python -m cli.main --verbose

# 启用调试模式
export WEBAUTO_LOG_LEVEL=DEBUG
```

### 日志查看

```bash
# 查看WebSocket日志
tail -f logs/websocket.log

# 查看执行日志
tail -f logs/execution.log
```

## 贡献指南

### 开发环境设置

```bash
git clone https://github.com/your-org/webauto.git
cd webauto

# 安装开发依赖
pip install -r requirements-dev.txt

# 运行测试
pytest tests/

# 代码格式化
black .
isort .
```

### 代码提交

```bash
# 检查代码风格
flake8 .
mypy .

# 运行测试
pytest tests/ --cov

# 提交代码
git add .
git commit -m "feat: add new feature"
```

## 许可证

MIT License

## 联系方式

- 项目主页: https://github.com/your-org/webauto
- 文档: https://webauto.readthedocs.io/
- 问题反馈: https://github.com/your-org/webauto/issues