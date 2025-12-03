"""WebSocket客户端实现 - 提供同步API包装异步websockets接口"""

import asyncio
import json
import logging
import threading
from contextlib import suppress
from typing import Any, Dict, Optional, Callable, Coroutine, TypeVar

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

T = TypeVar('T')


class WebSocketClient:
    """WebSocket客户端"""

    def __init__(self, url: str):
        self.url = url
        self.websocket: Optional[Any] = None
        self.logger = logging.getLogger(__name__)
        self.connected = False
        self.message_handlers: Dict[str, Callable] = {}
        self._listener_task: Optional[asyncio.Task] = None

        # 独立事件循环延迟创建，避免在无需WebSocket时也启动线程
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_ready = threading.Event()
        self._loop_thread: Optional[threading.Thread] = None

    def _ensure_loop(self):
        if self._loop and self._loop_thread and self._loop_thread.is_alive():
            return
        self._loop = asyncio.new_event_loop()
        self._loop_ready.clear()
        self._loop_thread = threading.Thread(
            target=self._run_loop,
            name="WebSocketClientLoop",
            daemon=True
        )
        self._loop_thread.start()
        self._loop_ready.wait()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop_ready.set()
        if self._loop:
            self._loop.run_forever()

    def _run_coroutine(self, coro: Coroutine[Any, Any, T]) -> T:
        """在内部事件循环中执行协程并同步等待结果"""
        self._ensure_loop()
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def connect(self) -> bool:
        """连接WebSocket服务器（同步接口）"""
        return self._run_coroutine(self._connect())

    async def _connect(self) -> bool:
        try:
            if self.connected and self.websocket and not self.websocket.closed:
                return True

            self.websocket = await websockets.connect(self.url)
            self.connected = True
            self.logger.info(f"Connected to WebSocket server: {self.url}")

            # 暂时停止消息监听任务，避免并发recv()冲突
            # TODO: 后续实现request_id消息路由后再启用
            # self._listener_task = asyncio.create_task(self._message_listener())
            return True

        except Exception as error:
            self.logger.error(f"Failed to connect to WebSocket: {error}")
            self.connected = False
            self.websocket = None
            return False

    def disconnect(self):
        """断开WebSocket连接"""
        return self._run_coroutine(self._disconnect())

    async def _disconnect(self):
        try:
            if self._listener_task:
                self._listener_task.cancel()
                with suppress(asyncio.CancelledError):
                    await self._listener_task
                self._listener_task = None

            if self.websocket:
                await self.websocket.close()
                self.websocket = None

            if self.connected:
                self.logger.info("Disconnected from WebSocket server")

            self.connected = False
        except Exception as error:
            self.logger.error(f"Error disconnecting from WebSocket: {error}")

    def send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """同步发送命令，等待响应"""
        return self._run_coroutine(self._send_command(session_id, command))

    async def _send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        try:
            # 自动连接如果未连接
            if not self.connected or not self.websocket:
                self.logger.info("Auto-connecting to WebSocket server...")
                await self._connect()
                if not self.connected or not self.websocket:
                    raise ConnectionError("Failed to establish WebSocket connection")

            loop = asyncio.get_running_loop()
            request = {
                "type": "command",
                "session_id": session_id,
                "data": command,
                "timestamp": loop.time()
            }

            await self.websocket.send(json.dumps(request))

            # 等待响应（后续可扩展为带request_id的匹配）
            response = await self.websocket.recv()
            response_data = json.loads(response)
            return response_data

        except ConnectionClosed:
            self.logger.error("WebSocket connection closed")
            self.connected = False
            raise
        except Exception as error:
            self.logger.error(f"Failed to send command: {error}")
            raise

    async def _message_listener(self):
        """消息监听器"""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    self.logger.warning(f"Invalid JSON message: {message}")
                except Exception as error:
                    self.logger.error(f"Error handling message: {error}")

        except ConnectionClosed:
            self.logger.info("WebSocket connection closed")
            self.connected = False
        except Exception as error:
            self.logger.error(f"Message listener error: {error}")
            self.connected = False

    async def _handle_message(self, data: Dict[str, Any]):
        """处理接收到的消息"""
        message_type = data.get('type')

        if message_type == 'response':
            # 处理响应消息
            request_id = data.get('request_id')
            if request_id in self.message_handlers:
                handler = self.message_handlers.pop(request_id)
                if callable(handler):
                    await handler(data)

        elif message_type == 'event':
            # 处理事件消息
            event_type = data.get('event_type')
            await self._handle_event(event_type, data.get('data', {}))

        elif message_type == 'error':
            # 处理错误消息
            error_msg = data.get('message', 'Unknown error')
            self.logger.error(f"WebSocket error: {error_msg}")

    async def _handle_event(self, event_type: str, data: Dict[str, Any]):
        """处理事件消息"""
        self.logger.debug(f"Received event: {event_type} - {data}")

        # 可以根据事件类型进行特殊处理
        if event_type == 'session_created':
            self.logger.info(f"Session created: {data.get('session_id')}")
        elif event_type == 'session_deleted':
            self.logger.info(f"Session deleted: {data.get('session_id')}")
        elif event_type == 'mode_changed':
            self.logger.info(f"Mode changed for session {data.get('session_id')}: {data.get('new_mode')}")

    def is_connected(self) -> bool:
        """检查连接状态"""
        return self.connected

    def ping(self) -> bool:
        """发送ping测试连接"""
        return self._run_coroutine(self._ping())

    async def _ping(self) -> bool:
        try:
            if not self.connected or not self.websocket:
                return False

            await self.websocket.ping()
            return True
        except Exception:
            return False
