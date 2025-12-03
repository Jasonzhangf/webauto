"""
Session manager that controls Chromium browser instances for the WebSocket server.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import threading
import uuid
from typing import Any, Callable, Dict, List, Optional

from browser_interface.chromium_browser import ChromiumBrowserWrapper

DEFAULT_BROWSER_CONFIG: Dict[str, Any] = {
    "headless": False,  # 前台模式，便于查看 overlay/容器菜单
    "auto_overlay": True,  # 启用自动注入overlay菜单
    # 启用自动会话（storage_state）加载，以便默认从 cookies/session_default.json 注入Cookie
    # 这有助于在创建会话后，直接进入已登录态（若对应站点Cookie有效）
    "auto_session": True,
    # 指定默认会话名称为 weibo-fresh，这样会从 cookies/session_weibo-fresh.json 读取较新的Weibo登录态
    "session_name": "weibo-fresh",
    "cookie_monitoring_enabled": False,
    "remote_debugging": False,
}


class BrowserSession:
    """Wraps a ChromiumBrowserWrapper instance that lives on a dedicated thread."""

    def __init__(self, session_id: str, capabilities: List[str], config: Dict[str, Any]):
        self.session_id = session_id
        self.capabilities = capabilities
        self.config = config
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"ws-session-{session_id}")
        self.browser: Optional[ChromiumBrowserWrapper] = None
        self.current_page: Any = None
        self.current_url: Optional[str] = None
        self.mode: str = "dev"
        self.created_at = datetime.utcnow()
        self.last_activity = self.created_at

        self._ready = threading.Event()
        self._init_error: Optional[Exception] = None
        self._closed = False

        # Initialize the browser on the worker thread immediately.
        self.executor.submit(self._initialize_browser)

    def _initialize_browser(self) -> None:
        try:
            self.browser = ChromiumBrowserWrapper(self.config)
        except Exception as exc:
            self._init_error = exc
            raise
        finally:
            self._ready.set()

    def _ensure_ready(self) -> None:
        self._ready.wait()
        if self._init_error:
            raise self._init_error

    def _run_in_thread(self, fn: Callable[["BrowserSession", Any], Any], *args, **kwargs):
        self._ensure_ready()
        if self._closed:
            raise RuntimeError(f"Session {self.session_id} is closed")

        self.last_activity = datetime.utcnow()
        return fn(self, *args, **kwargs)

    async def run(self, fn: Callable[["BrowserSession", Any], Any], *args, **kwargs):
        """Run a callable inside the dedicated session thread."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self.executor, lambda: self._run_in_thread(fn, *args, **kwargs)
        )

    async def ensure_page(self, url: str) -> Dict[str, Any]:
        return await self.run(BrowserSession._ensure_page_sync, url)

    async def set_mode(self, mode: str) -> str:
        return await self.run(BrowserSession._set_mode_sync, mode)

    async def close(self) -> None:
        if self._closed:
            return

        try:
            await self.run(BrowserSession._close_sync)
        except RuntimeError:
            # Session already closed or failed to initialize.
            pass
        finally:
            self.executor.shutdown(wait=False)
            self._closed = True

    def get_info(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "capabilities": self.capabilities,
            "mode": self.mode,
            "current_url": self.current_url,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "status": "ready" if self._ready.is_set() and not self._init_error else "error",
        }

    @staticmethod
    def _set_mode_sync(session: "BrowserSession", mode: str) -> str:
        session.mode = mode
        return session.mode

    @staticmethod
    def _ensure_page_sync(session: "BrowserSession", url: str) -> Dict[str, Any]:
        if not url and not session.current_url:
            raise ValueError("URL is required to load a page")

        should_navigate = (
            session.current_page is None or (url and url != session.current_url)
        )
        if should_navigate:
            BrowserSession._navigate_sync(session, url or session.current_url)

        title = None
        try:
            if hasattr(session.current_page, "page"):
                title = session.current_page.page.title()
        except Exception:
            title = None

        try:
            session.browser._emit_overlay_container_data(session.current_page, session.current_url)
        except Exception:
            pass

        return {
            "url": session.current_url,
            "title": title,
        }

    @staticmethod
    def _navigate_sync(session: "BrowserSession", url: str) -> Dict[str, Any]:
        page = session.browser.goto(url)
        session.current_page = page
        session.current_url = url

        title = None
        try:
            if hasattr(page, "page"):
                title = page.page.title()
        except Exception:
            title = None

        try:
            session.browser._emit_overlay_container_data(page, url)
        except Exception:
            pass

        return {
            "url": url,
            "title": title,
        }

    @staticmethod
    def _close_sync(session: "BrowserSession") -> None:
        if session.browser:
            session.browser.close()
        session.current_page = None
        session.current_url = None
        session._closed = True


class SessionManager:
    """Coordinates BrowserSession instances and exposes async helpers."""

    def __init__(self, default_browser_config: Optional[Dict[str, Any]] = None):
        self.default_browser_config = dict(DEFAULT_BROWSER_CONFIG)
        if default_browser_config:
            self.default_browser_config.update(default_browser_config)

        self.sessions: Dict[str, BrowserSession] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        capabilities: Optional[List[str]] = None,
        browser_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        session_id = f"session_{uuid.uuid4().hex[:8]}"
        config = dict(self.default_browser_config)
        if browser_config:
            config.update(browser_config)
        config["session_id"] = session_id
        config.setdefault("profile_id", session_id)

        session = BrowserSession(session_id, capabilities or ["dom"], config)
        async with self._lock:
            self.sessions[session_id] = session

        return {
            "success": True,
            "session_id": session_id,
            "capabilities": session.capabilities,
            "status": "initializing",
        }

    def get_session(self, session_id: str) -> Optional[BrowserSession]:
        import logging
        logger = logging.getLogger(__name__)

        session = self.sessions.get(session_id)
        logger.info(f"get_session called for {session_id}, found: {session is not None}")
        logger.info(f"Available sessions: {list(self.sessions.keys())}")
        return session

    async def list_sessions(self) -> List[Dict[str, Any]]:
        async with self._lock:
            sessions = list(self.sessions.values())
        return [session.get_info() for session in sessions]

    async def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.get_session(session_id)
        if not session:
            return None
        return session.get_info()

    async def delete_session(self, session_id: str) -> bool:
        async with self._lock:
            session = self.sessions.pop(session_id, None)

        if not session:
            return False

        await session.close()
        return True

    async def shutdown(self) -> None:
        async with self._lock:
            sessions = list(self.sessions.values())
            self.sessions.clear()

        for session in sessions:
            await session.close()
