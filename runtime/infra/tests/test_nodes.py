"""
Node系统测试
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock

from core.nodes import NavigateNode, QueryNode, ClickNode, InputNode, WaitNode
from core.nodes.node_interface import ExecutionContext, NodeResult, ExtractType
from core.nodes.registry import NodeRegistry
from core.executor import PythonExecutor, BrowserManager


class TestNodeInterface:
    """Node接口测试"""

    @pytest.fixture
    def mock_executor(self):
        """模拟Python执行器"""
        executor = Mock(spec=PythonExecutor)
        executor.execute_navigate = AsyncMock(return_value=NodeResult(success=True, data="navigated"))
        executor.execute_query = AsyncMock(return_value=NodeResult(success=True, data="query result"))
        executor.execute_click = AsyncMock(return_value=NodeResult(success=True, data="clicked"))
        executor.execute_input = AsyncMock(return_value=NodeResult(success=True, data="inputted"))
        executor.execute_wait = AsyncMock(return_value=NodeResult(success=True, data="waited"))
        executor.logger = Mock()
        return executor

    @pytest.fixture
    def execution_context(self, mock_executor):
        """执行上下文"""
        return ExecutionContext(
            session_id="test-session",
            python_executor=mock_executor
        )

    @pytest.mark.asyncio
    async def test_navigate_node(self, execution_context, mock_executor):
        """测试导航Node"""
        node = NavigateNode(url="https://example.com")

        result = await node.execute(execution_context)

        assert result.success
        mock_executor.execute_navigate.assert_called_once_with(
            "test-session",
            "https://example.com",
            None
        )
        assert execution_context.get_variable('current_url') == "https://example.com"

    @pytest.mark.asyncio
    async def test_query_node(self, execution_context, mock_executor):
        """测试查询Node"""
        node = QueryNode(selector=".title", extract_type=ExtractType.TEXT)

        result = await node.execute(execution_context)

        assert result.success
        mock_executor.execute_query.assert_called_once_with(
            "test-session",
            ".title",
            ExtractType.TEXT,
            None,
            False
        )
        assert execution_context.get_variable('query_result__title') == "query result"

    @pytest.mark.asyncio
    async def test_click_node(self, execution_context, mock_executor):
        """测试点击Node"""
        node = ClickNode(selector=".button", wait_before=100, wait_after=200)

        result = await node.execute(execution_context)

        assert result.success
        mock_executor.execute_click.assert_called_once_with(
            "test-session",
            ".button",
            100,
            200
        )

    @pytest.mark.asyncio
    async def test_input_node(self, execution_context, mock_executor):
        """测试输入Node"""
        node = InputNode(selector=".input", value="test value", clear_first=False)

        result = await node.execute(execution_context)

        assert result.success
        mock_executor.execute_input.assert_called_once_with(
            "test-session",
            ".input",
            "test value",
            False
        )

    @pytest.mark.asyncio
    async def test_wait_node(self, execution_context, mock_executor):
        """测试等待Node"""
        node = WaitNode(selector=".loading", timeout=5000, wait_type="element")

        result = await node.execute(execution_context)

        assert result.success
        mock_executor.execute_wait.assert_called_once_with(
            "test-session",
            ".loading",
            5000,
            "element"
        )

    def test_parameter_validation(self):
        """测试参数验证"""
        node = NavigateNode()
        errors = node.validate_parameters({})
        assert len(errors) > 0
        assert any("url" in error for error in errors)

        # 带参数的Node应该验证通过
        node_with_params = NavigateNode(url="https://example.com")
        errors = node_with_params.validate_parameters({"url": "https://example.com"})
        assert len(errors) == 0


class TestNodeRegistry:
    """Node注册表测试"""

    def test_registry_initialization(self):
        """测试注册表初始化"""
        registry = NodeRegistry()

        # 检查默认节点是否注册
        node_types = registry.list_node_types()
        assert "navigate" in node_types
        assert "query" in node_types
        assert "click" in node_types
        assert "input" in node_types
        assert "wait" in node_types

    def test_node_creation(self):
        """测试Node创建"""
        registry = NodeRegistry()

        navigate_node = registry.create_node("navigate", {"url": "https://example.com"})
        assert isinstance(navigate_node, NavigateNode)
        assert navigate_node.url == "https://example.com"

    def test_invalid_node_type(self):
        """测试无效Node类型"""
        registry = NodeRegistry()

        with pytest.raises(ValueError, match="Unknown node type"):
            registry.create_node("invalid_type", {})

    def test_parameter_validation(self):
        """测试参数验证"""
        registry = NodeRegistry()

        # 缺少必需参数
        errors = registry.validate_node_parameters("navigate", {})
        assert len(errors) > 0
        assert any("url" in error for error in errors)

        # 参数正确
        errors = registry.validate_node_parameters("navigate", {"url": "https://example.com"})
        assert len(errors) == 0

    def test_node_description(self):
        """测试Node描述获取"""
        registry = NodeRegistry()

        description = registry.get_node_description("navigate")
        assert "name" in description
        assert "capabilities" in description
        assert "parameters" in description
        assert description["name"] == "navigate"


@pytest.mark.asyncio
class TestSafeExecution:
    """安全执行测试"""

    async def test_timeout_handling(self):
        """测试超时处理"""
        # 模拟超时的执行器
        mock_executor = Mock(spec=PythonExecutor)
        mock_executor.execute_navigate = AsyncMock(
            side_effect=asyncio.TimeoutError("Timeout")
        )
        mock_executor.logger = Mock()

        context = ExecutionContext("test-session", mock_executor)
        node = NavigateNode(url="https://example.com", timeout=100)  # 很短的超时

        result = await node._safe_execute(context)

        assert not result.success
        assert "timeout" in result.error.lower()

    async def test_retry_mechanism(self):
        """测试重试机制"""
        mock_executor = Mock(spec=PythonExecutor)
        # 前两次失败，第三次成功
        mock_executor.execute_navigate = AsyncMock(
            side_effect=[
                Exception("First failure"),
                Exception("Second failure"),
                NodeResult(success=True, data="success")
            ]
        )
        mock_executor.logger = Mock()

        context = ExecutionContext("test-session", mock_executor)
        node = NavigateNode(url="https://example.com")

        result = await node.execute_with_retry(context)

        assert result.success
        assert mock_executor.execute_navigate.call_count == 3


if __name__ == "__main__":
    pytest.main([__file__])