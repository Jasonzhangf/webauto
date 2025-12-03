"""
Node系统核心接口定义
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union, Literal
from enum import Enum
import uuid
import asyncio
from datetime import datetime


class ExtractType(Enum):
    """数据提取类型"""
    TEXT = "text"
    HTML = "html"
    ATTRIBUTE = "attribute"
    MULTIPLE_TEXT = "multiple_text"
    MULTIPLE_HTML = "multiple_html"


@dataclass(frozen=True)
class FieldDescription:
    """参数描述"""
    name: str
    type: str
    required: bool = True
    description: str = ""
    default_value: Any = None


@dataclass(frozen=True)
class NodeDescription:
    """Node描述"""
    name: str
    capabilities: List[str]  # ['dom', 'network', 'screenshot', 'form']
    parameters: Dict[str, FieldDescription]
    async_mode: bool = True
    timeout: int = 30000
    retry_count: int = 3


@dataclass
class NodeResult:
    """Node执行结果"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    node_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'success': self.success,
            'data': self.data,
            'error': self.error,
            'execution_time': self.execution_time,
            'node_id': self.node_id,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class ExecutionContext:
    """执行上下文"""
    session_id: str
    python_executor: 'PythonExecutor'
    websocket: Optional[Any] = None  # WebSocket连接
    variables: Dict[str, Any] = field(default_factory=dict)

    def set_variable(self, name: str, value: Any) -> None:
        """设置上下文变量"""
        self.variables[name] = value

    def get_variable(self, name: str, default: Any = None) -> Any:
        """获取上下文变量"""
        return self.variables.get(name, default)


class NodeInterface(ABC):
    """Node接口抽象基类"""

    def __init__(self, **parameters):
        self.parameters = parameters

    @abstractmethod
    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行Node操作"""
        pass

    @abstractmethod
    def get_description(self) -> NodeDescription:
        """获取Node描述"""
        pass

    @property
    def node_id(self) -> str:
        """Node唯一标识"""
        return self.__class__.__name__

    def validate_parameters(self, parameters: Dict[str, Any]) -> List[str]:
        """验证参数，返回错误列表"""
        description = self.get_description()
        errors = []

        for param_name, param_desc in description.parameters.items():
            if param_desc.required and param_name not in parameters:
                errors.append(f"Required parameter '{param_name}' is missing")

        return errors

    async def _safe_execute(self, context: ExecutionContext) -> NodeResult:
        """安全执行包装器"""
        description = self.get_description()
        start_time = datetime.utcnow()

        try:
            # 验证参数
            validation_errors = self.validate_parameters(self.parameters)
            if validation_errors:
                return NodeResult(
                    success=False,
                    error=f"Parameter validation failed: {', '.join(validation_errors)}",
                    execution_time=(datetime.utcnow() - start_time).total_seconds()
                )

            # 执行操作（带超时控制）
            try:
                result = await asyncio.wait_for(
                    self.execute(context),
                    timeout=description.timeout / 1000.0
                )
                execution_time = (datetime.utcnow() - start_time).total_seconds()
                result.execution_time = execution_time
                return result
            except asyncio.TimeoutError:
                return NodeResult(
                    success=False,
                    error=f"Execution timeout after {description.timeout}ms",
                    execution_time=(datetime.utcnow() - start_time).total_seconds()
                )

        except Exception as error:
            return NodeResult(
                success=False,
                error=str(error),
                execution_time=(datetime.utcnow() - start_time).total_seconds()
            )

    async def execute_with_retry(self, context: ExecutionContext) -> NodeResult:
        """带重试机制的执行"""
        description = self.get_description()
        last_error = None

        for attempt in range(description.retry_count + 1):
            if attempt > 0:
                # 简单的退避策略
                await asyncio.sleep(min(2 ** attempt, 10))  # 最多等待10秒

            result = await self._safe_execute(context)
            if result.success:
                return result

            last_error = result.error
            context.python_executor.logger.warning(
                f"Node {self.node_id} execution attempt {attempt + 1} failed: {last_error}"
            )

        return NodeResult(
            success=False,
            error=f"All {description.retry_count + 1} attempts failed. Last error: {last_error}"
        )