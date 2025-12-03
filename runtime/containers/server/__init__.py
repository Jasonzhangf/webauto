"""
WebAuto WebSocket server package.

Provides asyncio-based WebSocket server, browser session management,
and container operation handling used by the CLI tooling.
"""

from .session_manager import SessionManager
from .container_handler import ContainerOperationHandler
from .websocket_server import WebSocketServer

__all__ = [
    "SessionManager",
    "ContainerOperationHandler",
    "WebSocketServer",
]
