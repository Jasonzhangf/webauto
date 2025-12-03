"""
Browser orchestration implementation - main browser controller.

This module implements the IBrowserOrchestrator interface and serves as the main entry point
for browser operations in the WebAuto system.
"""

from __future__ import annotations
from typing import Dict, Any, Optional
import uuid
from datetime import datetime

from .interfaces import IBrowserOrchestrator, ISessionManager, IOverlayManager, IConfigManager
from .config_manager import ConfigManager
from .session_manager import SessionManager
from .overlay_manager import OverlayManager


class BrowserOrchestrator(IBrowserOrchestrator):
    """Browser orchestration implementation - coordinates all browser operations"""

    def __init__(self, config: Dict[str, Any]):
        """Initialize browser orchestration with required managers"""
        self.config = config
        self.config_manager = ConfigManager(config)
        self.session_manager = SessionManager(config)
        self.overlay_manager = OverlayManager(config)

        # Active sessions storage
        self._active_sessions: Dict[str, Any] = {}

        print("🎭 浏览器编排器初始化完成")
        print(f"📊 配置管理器: {type(self.config_manager).__name__}")
        print(f"🔄 会话管理器: {type(self.session_manager).__name__}")
        print(f"🎛 Overlay管理器: {type(self.overlay_manager).__name__}")

    def create_session(self, profile: Dict[str, Any]) -> str:
        """Create a new browser session"""
        session_id = str(uuid.uuid4())

        # Create session configuration
        session_config = {
            'id': session_id,
            'profile': profile,
            'created_at': datetime.now().isoformat(),
            'status': 'active'
        }

        # Store active session
        self._active_sessions[session_id] = session_config

        # Initialize session via session manager
        self.session_manager.create_session(session_id, session_config)

        # Setup overlay for new session
        overlay_config = {
            'session_id': session_id,
            'auto_inject': self.config_manager.get_config('auto_overlay', False),
            'dev_mode': self.config_manager.get_config('dev_mode', False)
        }

        print(f"🆔 会话已创建: {session_id}")
        return session_id

    def get_page(self, session_id: str) -> Any:
        """Get page instance for session"""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session {session_id} not found")

        session_config = self._active_sessions[session_id]

        # Get page from session manager
        page = self.session_manager.get_page(session_id)
        if not page:
            raise ValueError(f"Page not available for session {session_id}")

        # Setup overlay if configured
        if session_config.get('auto_inject'):
            try:
                self.overlay_manager.inject_overlay(page, {
                    'session_id': session_id,
                    'dev_mode': session_config.get('dev_mode', False)
                })
                print(f"🎛 Overlay已注入会话 {session_id}")
            except Exception as e:
                print(f"⚠️ Overlay注入失败 {session_id}: {str(e)}")

        return page

    def close_session(self, session_id: str) -> bool:
        """Close browser session"""
        if session_id not in self._active_sessions:
            return False

        session_config = self._active_sessions[session_id]
        session_config['status'] = 'closed'
        session_config['closed_at'] = datetime.now().isoformat()

        # Close via session manager
        success = self.session_manager.close_session(session_id)

        # Cleanup overlay
        try:
            page = self.session_manager.get_page(session_id)
            if page:
                self.overlay_manager.remove_overlay(page)
        except Exception as e:
            print(f"⚠️ 清理Overlay失败 {session_id}: {str(e)}")

        # Remove from active sessions
        del self._active_sessions[session_id]

        print(f"🔒 会话已关闭: {session_id}")
        return success

    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session information"""
        return self._active_sessions.get(session_id)

    def list_sessions(self) -> Dict[str, Dict[str, Any]]:
        """List all active sessions"""
        return self._active_sessions.copy()

    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        return self.config_manager.get_config(key, default)

    def set_config(self, key: str, value: Any) -> None:
        """Set configuration value"""
        self.config_manager.set_config(key, value)
        print(f"⚙️ 配置已更新: {key} = {value}")

    def cleanup(self) -> None:
        """Cleanup all resources"""
        # Close all active sessions
        for session_id in list(self._active_sessions.keys()):
            self.close_session(session_id)

        # Cleanup managers
        self.session_manager.cleanup()
        self.overlay_manager.cleanup()
        self.config_manager.cleanup()

        print("🧹 资源清理完成")


__all__ = ["BrowserOrchestrator"]