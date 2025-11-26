"""
Mode Controller - 模式切换和管理
"""

import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
import importlib
import os

from .models import OperatingMode, ModeConfig, ModeTransition, OverlayConfig
from .dev_overlay import UIOverlayManager, DevOverlayInjector
from .run_executor import RunModeExecutor
from ..session.models import Session
from ..nodes.registry import NodeRegistry


class ModeController:
    """模式控制器"""

    def __init__(self):
        self.injector = DevOverlayInjector()
        self.overlay_manager = UIOverlayManager(self.injector)
        self.run_executor = RunModeExecutor()
        self.node_registry = NodeRegistry()
        self.logger = None

        # 模式转换历史
        self.transition_history: List[ModeTransition] = []

        # 活跃会话的模式配置
        self.session_modes: Dict[str, ModeConfig] = {}

        # 扩展系统
        self.extensions: Dict[str, Any] = {}
        self.extension_registry: Dict[str, str] = {}  # name -> module_path

    async def switch_mode(self, session: Session, target_mode: OperatingMode,
                         browser_session: Any) -> bool:
        """切换操作模式"""
        try:
            session_id = session.session_id
            current_mode = self.get_current_mode(session_id)

            # 检查是否需要切换
            if current_mode == target_mode:
                return True

            # 确保操作队列为空
            if not await self._ensure_command_queue_empty(session):
                if self.logger:
                    self.logger.warning(f"Command queue not empty for session {session_id}")
                return False

            # 记录模式转换
            transition = ModeTransition(
                session_id=session_id,
                from_mode=current_mode or OperatingMode.RUN,
                to_mode=target_mode,
                reason='manual_switch'
            )
            self.transition_history.append(transition)

            # 执行模式切换
            success = await self._execute_mode_switch(
                session, current_mode, target_mode, browser_session
            )

            if success:
                # 更新会话模式配置
                if target_mode == OperatingMode.DEV:
                    mode_config = ModeConfig(
                        mode=target_mode,
                        ui_overlay_enabled=True,
                        debug_channel_enabled=True,
                        interaction_allowed=True,
                        auto_save_containers=True,
                        permissions=['inspect', 'edit', 'record', 'debug']
                    )
                else:
                    mode_config = ModeConfig(
                        mode=target_mode,
                        ui_overlay_enabled=False,
                        debug_channel_enabled=False,
                        interaction_allowed=False,
                        auto_save_containers=False,
                        permissions=[]
                    )

                self.session_modes[session_id] = mode_config

                if self.logger:
                    self.logger.info(
                        f"Session {session_id} switched from {current_mode} to {target_mode}"
                    )

            return success

        except Exception as error:
            if self.logger:
                self.logger.error(f"Mode switch failed: {error}")
            return False

    async def _execute_mode_switch(self, session: Session, from_mode: Optional[OperatingMode],
                                 to_mode: OperatingMode, browser_session: Any) -> bool:
        """执行具体的模式切换"""
        session_id = session.session_id

        try:
            # 从当前模式退出
            if from_mode == OperatingMode.DEV:
                # 退出Dev模式
                await self._disable_dev_mode(session_id, browser_session)
            elif from_mode == OperatingMode.RUN:
                # 退出Run模式
                await self._disable_run_mode(session_id, browser_session)

            # 进入目标模式
            if to_mode == OperatingMode.DEV:
                return await self._enable_dev_mode(session, browser_session)
            elif to_mode == OperatingMode.RUN:
                return await self._enable_run_mode(session, browser_session)

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Mode switch execution failed: {error}")
            return False

    async def _enable_dev_mode(self, session: Session, browser_session: Any) -> bool:
        """启用Dev模式"""
        session_id = session.session_id

        try:
            # 初始化扩展系统
            await self._initialize_extensions()

            # 获取当前URL并激活相应的扩展
            current_url = await browser_session.evaluate("window.location.href")
            await self._activate_extensions_for_url(session_id, current_url, browser_session)

            # 配置覆盖层
            overlay_config = OverlayConfig(
                inspect_enabled=True,
                container_editor=True,
                workflow_recorder=True,
                element_highlight=True,
                console_access=True
            )

            # 注入UI覆盖层
            success = await self.overlay_manager.enable_overlay(
                session_id, browser_session, overlay_config
            )

            if success:
                # 启用调试通道
                await self._enable_debug_channel(session_id)

                # 启用交互功能
                await self._enable_interaction_features(session_id)

                if self.logger:
                    self.logger.info(f"Dev mode enabled for session {session_id}")

            return success

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to enable dev mode: {error}")
            return False

    async def _disable_dev_mode(self, session_id: str, browser_session: Any) -> bool:
        """禁用Dev模式"""
        try:
            # 停用扩展
            await self._deactivate_extensions_for_session(session_id)

            # 卸载覆盖层
            success = await self.overlay_manager.disable_overlay(session_id, browser_session)

            # 关闭调试通道
            await self._disable_debug_channel(session_id)

            # 禁用交互功能
            await self._disable_interaction_features(session_id)

            if self.logger:
                self.logger.info(f"Dev mode disabled for session {session_id}")

            return success

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to disable dev mode: {error}")
            return False

    async def _enable_run_mode(self, session: Session, browser_session: Any) -> bool:
        """启用Run模式"""
        session_id = session.session_id

        try:
            # 初始化运行模式执行器
            success = await self.run_executor.initialize(session_id, browser_session)

            if success:
                # 配置运行时参数
                await self._configure_run_mode(session_id)

                if self.logger:
                    self.logger.info(f"Run mode enabled for session {session_id}")

            return success

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to enable run mode: {error}")
            return False

    async def _disable_run_mode(self, session_id: str, browser_session: Any) -> bool:
        """禁用Run模式"""
        try:
            # 清理运行模式执行器
            success = await self.run_executor.cleanup(session_id)

            if self.logger:
                self.logger.info(f"Run mode disabled for session {session_id}")

            return success

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to disable run mode: {error}")
            return False

    async def _enable_debug_channel(self, session_id: str):
        """启用调试通道"""
        # 这里可以建立WebSocket或IPC通信通道
        # 用于Dev模式下的实时调试
        pass

    async def _disable_debug_channel(self, session_id: str):
        """关闭调试通道"""
        # 关闭调试通信通道
        pass

    async def _enable_interaction_features(self, session_id: str):
        """启用交互功能"""
        # 启用Dev模式的交互功能
        # 如元素检查、容器编辑等
        pass

    async def _disable_interaction_features(self, session_id: str):
        """禁用交互功能"""
        # 禁用Dev模式的交互功能
        pass

    async def _configure_run_mode(self, session_id: str):
        """配置运行模式"""
        # 配置运行模式的参数
        # 如性能监控、错误处理等
        pass

    async def _ensure_command_queue_empty(self, session: Session) -> bool:
        """确保操作队列为空"""
        try:
            # 检查是否有正在执行的操作
            # 这里需要与具体的执行系统集成
            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to check command queue: {error}")
            return False

    def get_current_mode(self, session_id: str) -> Optional[OperatingMode]:
        """获取当前模式"""
        mode_config = self.session_modes.get(session_id)
        return mode_config.mode if mode_config else None

    def get_mode_config(self, session_id: str) -> Optional[ModeConfig]:
        """获取模式配置"""
        return self.session_modes.get(session_id)

    def is_mode_allowed(self, session_id: str, operation: str) -> bool:
        """检查操作是否被当前模式允许"""
        mode_config = self.session_modes.get(session_id)
        if not mode_config:
            return False

        return operation in mode_config.permissions

    def get_transition_history(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取模式转换历史"""
        transitions = [
            transition for transition in self.transition_history
            if transition.session_id == session_id
        ]

        return [transition.to_dict() for transition in transitions[-limit:]]

    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """获取会话状态"""
        current_mode = self.get_current_mode(session_id)
        mode_config = self.get_mode_config(session_id)

        status = {
            'session_id': session_id,
            'current_mode': current_mode.value if current_mode else None,
            'mode_config': mode_config.to_dict() if mode_config else None,
            'overlay_active': self.overlay_manager.is_overlay_active(session_id)
        }

        if current_mode == OperatingMode.DEV:
            status['overlay_status'] = self.overlay_manager.get_overlay_status(session_id)

        return status

    async def handle_dev_command(self, session_id: str, command: str,
                               args: List[Any]) -> Any:
        """处理Dev模式命令"""
        if not self.is_mode_allowed(session_id, command):
            return {'error': 'Operation not allowed in current mode'}

        try:
            # 尝试通过扩展处理命令
            extension_result = await self._handle_command_via_extensions(session_id, command, args)
            if extension_result is not None:
                return extension_result

            # 默认命令处理
            if command == 'inspect_element':
                selector = args[0] if args else None
                return await self._inspect_element(session_id, selector)
            elif command == 'create_container':
                return await self._create_container(session_id, args[0] if args else {})
            elif command == 'highlight_element':
                selector = args[0] if args else None
                return await self._highlight_element(session_id, selector)
            elif command == 'get_debug_events':
                limit = args[0] if args else 50
                return await self._get_debug_events(session_id, limit)
            elif command == 'extension_status':
                return await self._get_extension_status()
            elif command == 'activate_extension':
                extension_name = args[0] if args else None
                return await self._activate_extension(session_id, extension_name)
            else:
                return {'error': f'Unknown command: {command}'}

        except Exception as error:
            if self.logger:
                self.logger.error(f"Dev command failed: {error}")
            return {'error': str(error)}

    async def _inspect_element(self, session_id: str, selector: str) -> Dict[str, Any]:
        """检查元素"""
        # 实现元素检查逻辑
        return {'selector': selector, 'info': 'Element inspection results'}

    async def _create_container(self, session_id: str, container_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建容器"""
        # 实现容器创建逻辑
        return {'container_id': 'new_container', 'status': 'created'}

    async def _highlight_element(self, session_id: str, selector: str) -> Dict[str, Any]:
        """高亮元素"""
        # 实现元素高亮逻辑
        return {'selector': selector, 'highlighted': True}

    async def _get_debug_events(self, session_id: str, limit: int) -> List[Dict[str, Any]]:
        """获取调试事件"""
        dev_session = self.injector.get_dev_session(session_id)
        if not dev_session:
            return []

        events = dev_session.get_recent_events(limit)
        return [event.to_dict() for event in events]

    async def _initialize_extensions(self):
        """初始化扩展系统"""
        try:
            # 注册扩展模块
            self._register_extension("weibo-extension", "extensions.weibo_extension.WeiboExtension")

            # 初始化已注册的扩展
            for extension_name, module_path in self.extension_registry.items():
                await self._load_extension(extension_name, module_path)

            if self.logger:
                self.logger.info(f"Extensions initialized: {list(self.extensions.keys())}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to initialize extensions: {error}")

    def _register_extension(self, name: str, module_path: str):
        """注册扩展"""
        self.extension_registry[name] = module_path

    async def _load_extension(self, name: str, module_path: str):
        """加载扩展"""
        try:
            # 动态导入扩展模块
            module = importlib.import_module(".".join(module_path.split(".")[:-1]))
            extension_class = getattr(module, module_path.split(".")[-1])

            # 创建扩展实例
            extension_instance = extension_class()

            # 初始化扩展
            config = {}  # 从配置文件读取
            await extension_instance.initialize(config)

            # 存储扩展实例
            self.extensions[name] = extension_instance

            if self.logger:
                self.logger.info(f"Loaded extension: {name}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to load extension {name}: {error}")

    async def _activate_extensions_for_url(self, session_id: str, url: str, browser_session):
        """为URL激活相应的扩展"""
        try:
            for extension_name, extension in self.extensions.items():
                if await extension.can_handle_url(url):
                    # 设置扩展的浏览器会话引用
                    if not hasattr(extension, 'browser_session'):
                        extension.browser_session = browser_session

                    # 激活扩展
                    await extension.handle_navigation(url, browser_session)

                    if self.logger:
                        self.logger.info(f"Activated extension {extension_name} for URL: {url}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to activate extensions for URL {url}: {error}")

    async def _deactivate_extensions_for_session(self, session_id: str):
        """停用会话的扩展"""
        try:
            for extension_name, extension in self.extensions.items():
                if hasattr(extension, 'cleanup'):
                    await extension.cleanup()

            if self.logger:
                self.logger.info(f"Deactivated extensions for session {session_id}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to deactivate extensions: {error}")

    async def _handle_command_via_extensions(self, session_id: str, command: str, args: List[Any]) -> Optional[Any]:
        """通过扩展处理命令"""
        try:
            for extension_name, extension in self.extensions.items():
                if hasattr(extension, f'handle_{command}'):
                    method = getattr(extension, f'handle_{command}')
                    if asyncio.iscoroutinefunction(method):
                        return await method(session_id, *args)
                    else:
                        return method(session_id, *args)

            return None

        except Exception as error:
            if self.logger:
                self.logger.error(f"Extension command handling failed: {error}")
            return {'error': f'Extension command failed: {str(error)}'}

    async def _get_extension_status(self) -> Dict[str, Any]:
        """获取扩展状态"""
        status = {
            'loaded_extensions': list(self.extensions.keys()),
            'registered_extensions': list(self.extension_registry.keys()),
            'extension_info': {}
        }

        for name, extension in self.extensions.items():
            status['extension_info'][name] = extension.get_extension_info()

        return status

    async def _activate_extension(self, session_id: str, extension_name: str) -> Dict[str, Any]:
        """手动激活扩展"""
        try:
            if extension_name not in self.extensions:
                return {'error': f'Extension {extension_name} not found'}

            extension = self.extensions[extension_name]

            # 获取当前会话的浏览器会话（这里需要从会话管理器获取）
            # browser_session = self._get_browser_session(session_id)
            # await extension.activate_for_session(session_id, browser_session)

            return {'success': True, 'message': f'Extension {extension_name} activated'}

        except Exception as error:
            return {'error': f'Failed to activate extension: {str(error)}'}

    def get_extension_for_url(self, url: str) -> Optional[Any]:
        """获取适合URL的扩展"""
        for extension in self.extensions.values():
            if hasattr(extension, 'can_handle_url'):
                # 需要在同步上下文中处理
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # 如果循环正在运行，创建任务
                        task = asyncio.create_task(extension.can_handle_url(url))
                        # 这里不能等待，返回None
                        return None
                    else:
                        # 如果循环没有运行，直接运行
                        return asyncio.run(extension.can_handle_url(url))
                except:
                    return None
        return None