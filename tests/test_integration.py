"""
WebAuto集成测试
"""

import asyncio
import pytest
import json
import tempfile
import os
from pathlib import Path
from unittest.mock import Mock, AsyncMock
from datetime import datetime

# Import core components
from core.nodes import NavigateNode, QueryNode, ClickNode, InputNode
from core.container import ContainerLibrary, ContainerMatcher
from core.mode import ModeController, OperatingMode
from cli.main import main, create_cli_app
from cli.commands.session import SessionCommands
from cli.commands.node import NodeCommands
from cli.commands.container import ContainerCommands
from cli.commands.dev import DevCommands
from cli.commands.workflow import WorkflowCommands


@pytest.fixture
def mock_websocket_client():
    """模拟WebSocket客户端"""
    client = Mock()
    client.is_connected.return_value = True
    client.send_command = AsyncMock(return_value={
        'data': {'success': True, 'data': {}}
    })
    return client


@pytest.fixture
def temp_dir():
    """临时目录"""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield Path(temp_dir)


@pytest.fixture
def sample_workflow():
    """示例工作流"""
    return {
        "name": "Test Workflow",
        "timeout": 30000,
        "nodes": [
            {
                "type": "navigate",
                "parameters": {"url": "https://example.com"},
                "required": True
            },
            {
                "type": "click",
                "parameters": {"selector": "button.submit"},
                "required": True
            },
            {
                "type": "query",
                "parameters": {"selector": ".result", "extract_type": "text"},
                "required": False
            }
        ]
    }


@pytest.fixture
def sample_container():
    """示例容器定义"""
    return {
        "name": "test_container",
        "selector": ".main-content",
        "attributes": {"class": "main-content"},
        "xpath": "//div[@class='main-content']"
    }


class TestNodeSystem:
    """Node系统测试"""

    def test_navigate_node_creation(self):
        """测试导航Node创建"""
        node = NavigateNode(url="https://example.com")
        assert node.url == "https://example.com"
        assert node.wait_for is None

    def test_node_parameter_validation(self):
        """测试Node参数验证"""
        node = NavigateNode()
        errors = node.validate_parameters({})
        assert len(errors) > 0
        assert any("url" in error for error in errors)

        node_with_params = NavigateNode(url="https://example.com")
        errors = node_with_params.validate_parameters({"url": "https://example.com"})
        assert len(errors) == 0

    def test_node_description(self):
        """测试Node描述"""
        node = NavigateNode(url="https://example.com")
        description = node.get_description()
        assert description.name == "navigate"
        assert "url" in description.parameters


class TestContainerSystem:
    """容器系统测试"""

    def test_container_library_initialization(self, temp_dir):
        """测试容器库初始化"""
        library = ContainerLibrary(str(temp_dir / "test-lib"))
        assert library.containers == {}
        assert library.containers_by_domain == {}

    def test_container_save_and_load(self, temp_dir):
        """测试容器保存和加载"""
        library_path = str(temp_dir / "test-lib")
        library = ContainerLibrary(library_path)

        from core.container.models import Container, ContainerAction

        # 创建测试容器
        container = Container(
            name="test_container",
            matcher=ContainerMatcher(selector=".test"),
            actions=[
                ContainerAction(
                    action_type="click",
                    selector=".test-button"
                )
            ]
        )

        # 保存容器
        library.save_container(container)

        # 验证保存
        assert "test_container" in library.containers

        # 重新加载
        new_library = ContainerLibrary(library_path)
        assert "test_container" in new_library.containers

    def test_container_validation(self, temp_dir):
        """测试容器验证"""
        library = ContainerLibrary(str(temp_dir / "test-lib"))

        # 测试有效容器
        valid_container = {
            "name": "valid",
            "matcher": {"selector": ".valid"}
        }
        errors = library.validate_container(valid_container)
        assert len(errors) == 0

        # 测试无效容器
        invalid_container = {
            "matcher": {"selector": ""}  # 缺少必需字段
        }
        errors = library.validate_container(invalid_container)
        assert len(errors) > 0


class TestModeSystem:
    """模式系统测试"""

    def test_mode_controller_creation(self):
        """测试模式控制器创建"""
        controller = ModeController()
        assert controller is not None
        assert controller.overlay_manager is not None
        assert controller.run_executor is not None

    def test_mode_config(self):
        """测试模式配置"""
        from core.mode.models import ModeConfig, OperatingMode

        dev_config = ModeConfig(
            mode=OperatingMode.DEV,
            ui_overlay_enabled=True,
            debug_channel_enabled=True
        )

        assert dev_config.mode == OperatingMode.DEV
        assert dev_config.ui_overlay_enabled is True

        config_dict = dev_config.to_dict()
        assert config_dict['mode'] == 'dev'

    def test_dev_session(self):
        """测试Dev会话"""
        from core.mode.models import DevSession, DebugEvent

        dev_session = DevSession(session_id="test-session")
        assert dev_session.session_id == "test-session"

        # 添加调试事件
        dev_session.add_debug_event("test_event", {"data": "test"})
        assert len(dev_session.debug_events) == 1

        # 获取最近事件
        recent_events = dev_session.get_recent_events(5)
        assert len(recent_events) == 1


class TestCLISystem:
    """CLI系统测试"""

    def test_session_commands(self, mock_websocket_client):
        """测试会话命令"""
        cli_context = {'ws_client': mock_websocket_client}
        commands = SessionCommands(cli_context)

        result = commands.create(['dom', 'screenshot'])
        assert 'success' in result
        assert 'session_id' in result

    def test_node_commands(self, mock_websocket_client):
        """测试Node命令"""
        cli_context = {'ws_client': mock_websocket_client}
        commands = NodeCommands(cli_context)

        result = commands.execute("test-session", "navigate", {"url": "https://example.com"})
        assert 'success' in result

    def test_container_commands(self, mock_websocket_client):
        """测试容器命令"""
        cli_context = {'ws_client': mock_websocket_client}
        commands = ContainerCommands(cli_context)

        result = commands.match_root("test-session", "https://example.com")
        assert 'success' in result

    def test_dev_commands(self, mock_websocket_client):
        """测试Dev命令"""
        cli_context = {'ws_client': mock_websocket_client}
        commands = DevCommands(cli_context)

        result = commands.enable_overlay("test-session")
        assert 'success' in result

    def test_workflow_commands(self, mock_websocket_client):
        """测试工作流命令"""
        cli_context = {'ws_client': mock_websocket_client}
        commands = WorkflowCommands(cli_context)

        result = commands.validate("workflow.json")
        assert 'success' in result

    def test_workflow_validation(self, sample_workflow):
        """测试工作流验证"""
        commands = WorkflowCommands({})

        # 测试有效工作流
        valid_result = commands.validate_workflow(sample_workflow)
        assert valid_result['valid'] is True

        # 测试无效工作流
        invalid_workflow = {"nodes": []}  # 缺少必需字段
        invalid_result = commands.validate_workflow(invalid_workflow)
        assert invalid_result['valid'] is False
        assert 'errors' in invalid_result


class TestIntegration:
    """集成测试"""

    def test_end_to_end_workflow(self, temp_dir, sample_workflow, mock_websocket_client):
        """端到端工作流测试"""
        # 创建CLI应用
        app = create_cli_app()

        # 设置测试环境
        workflow_file = temp_dir / "test_workflow.json"
        with open(workflow_file, 'w') as f:
            json.dump(sample_workflow, f)

        # 测试工作流验证
        from cli.commands.workflow import WorkflowCommands
        cli_context = {'ws_client': mock_websocket_client}
        workflow_commands = WorkflowCommands(cli_context)

        # 验证工作流
        validation_result = workflow_commands.validate(str(workflow_file))
        assert validation_result['success'] is True

        # 模拟运行工作流
        mock_websocket_client.send_command.return_value = {
            'data': {
                'success': True,
                'data': {
                    'success': True,
                    'total_steps': 3,
                    'successful_steps': 3,
                    'failed_steps': 0,
                    'execution_time': 1.5,
                    'results': [
                        {'step': 1, 'success': True},
                        {'step': 2, 'success': True},
                        {'step': 3, 'success': True}
                    ]
                }
            }
        }

        run_result = workflow_commands.run("test-session", str(workflow_file))
        assert run_result['success'] is True
        assert run_result['successful_steps'] == 3

    def test_container_lifecycle(self, temp_dir, sample_container):
        """测试容器生命周期"""
        # 创建容器库
        library_path = str(temp_dir / "test_container_lib")
        library = ContainerLibrary(library_path)

        # 创建CLI容器命令
        cli_context = {'ws_client': Mock()}
        container_commands = ContainerCommands(cli_context)

        # 保存容器
        save_result = container_commands.save_container("test-session", "test-container", ".test-selector")
        assert save_result['success'] is True

        # 测试容器定义
        test_result = container_commands.test_container(str(temp_dir / "test_container.json"))
        assert test_result['success'] is True

    def test_mode_switching(self, mock_websocket_client):
        """测试模式切换"""
        controller = ModeController()

        # 创建模拟会话
        from core.session.models import Session, SessionState, BrowserInstance

        session = Session(
            session_id="test-session",
            state=SessionState.ACTIVE,
            browser_instance=BrowserInstance("test-session", "chromium")
        )

        # 模拟浏览器会话
        mock_browser_session = Mock()

        # 设置模拟响应
        mock_websocket_client.send_command.return_value = {
            'data': {
                'success': True,
                'overlay_enabled': True
            }
        }

        # 切换到Dev模式
        switch_result = asyncio.run(
            controller.switch_mode(session, OperatingMode.DEV, mock_browser_session)
        )
        assert switch_result is True

        # 验证模式状态
        current_mode = controller.get_current_mode("test-session")
        assert current_mode == OperatingMode.DEV


if __name__ == '__main__':
    pytest.main([__file__])