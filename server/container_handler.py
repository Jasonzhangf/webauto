"""
Container operation handling for WebSocket server commands.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import time
from urllib.parse import urlparse

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.container.models_v2 import ContainerDefV2, SelectorVariant
# 针对容器匹配流程，需要识别并处理浏览器反爬错误
from browser_interface.chromium_browser import AntiBotError
# 直接导入container_registry模块避免循环依赖
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'services'))
from container_registry import get_containers_for_url_v2

from .session_manager import BrowserSession, SessionManager


class ContainerOperationHandler:
    """Executes container matching routines inside browser sessions."""

    def __init__(self, session_manager: SessionManager):
        self.session_manager = session_manager

    async def handle(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"ContainerHandler received action: {command.get('action')} for session: {session_id}")

        action = command.get("action")
        if action == "match_root":
            page_context = command.get("page_context", {})
            return await self.match_root(session_id, page_context)
        return {
            "success": False,
            "error": f"Unsupported container action: {action}",
        }

    async def match_root(self, session_id: str, page_context: Dict[str, Any]) -> Dict[str, Any]:
        import logging
        logger = logging.getLogger(__name__)

        try:
            logger.info(f"Starting match_root for session {session_id}")
            session = self.session_manager.get_session(session_id)
            if not session:
                logger.error(f"Session {session_id} not found")
                return {
                    "success": False,
                    "error": f"Session {session_id} not found",
                }

            url = page_context.get("url")
            if not url:
                return {
                    "success": False,
                    "error": "page_context.url is required",
                }

            # 调试：直接调用容器注册表函数
            containers = get_containers_for_url_v2(url)
            logger.info(f"Found {len(containers)} containers for URL: {url}")
            for cid, container in containers.items():
                logger.info(f"Container: {cid} - {container.name}")

            if not containers:
                return {
                    "success": False,
                    "error": "No container definitions available for this URL",
                }
            
            # 为了保证容器匹配在存在风控页面时依然可用，这里对 AntiBotError 做一次降级处理：
            # 第一次按正常逻辑检查；若触发 AntiBotError，则关闭当前会话浏览器实例的风控检测后重试一次。
            try:
                await session.ensure_page(url)
            except AntiBotError as anti_bot_error:
                logger.warning(
                    "Anti-bot detection triggered during match_root: %s", anti_bot_error
                )
                browser = getattr(session, "browser", None)
                if browser is not None and hasattr(browser, "_risk_control_enabled"):
                    try:
                        logger.info("Disabling risk control checks for match_root retry")
                        # 仅对本次会话的匹配流程关闭风控检测
                        browser._risk_control_enabled = False  # type: ignore[attr-defined]
                        await session.ensure_page(url)
                    except Exception:
                        # 重试失败则交给统一异常处理逻辑
                        raise
                else:
                    # 无法安全降级时，仍然交给统一异常处理逻辑
                    raise

            match_result = await session.run(
                ContainerOperationHandler._match_containers_sync,
                containers,
                page_context,
            )

            if not match_result:
                return {
                    "success": False,
                    "error": "No DOM elements matched known containers",
                }

            return {
                "success": True,
                "data": {
                    "matched_container": match_result["container"],
                    "match_details": match_result["match_details"],
                },
            }

        except Exception as error:
            logger.error(f"Error in match_root: {error}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": f"Match root error: {str(error)}",
            }

    @staticmethod
    def _match_containers_sync(
        session: BrowserSession,
        containers: Dict[str, ContainerDefV2],
        page_context: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        page = session.current_page
        playwright_page = getattr(page, "page", None)
        if playwright_page is None:
            return None

        # 等待页面初步稳定，减少SPA首屏未渲染导致的漏匹配
        try:
            for _ in range(15):  # ~3s
                try:
                    rs = playwright_page.evaluate("document.readyState")
                except Exception:
                    rs = None
                if rs in ("interactive", "complete"):
                    # 等待 #app 出现（常见根锚点）
                    try:
                        if playwright_page.query_selector("#app"):
                            break
                    except Exception:
                        pass
                time.sleep(0.2)
        except Exception:
            pass

        url = page_context.get("url") or session.current_url or ""
        path = urlparse(url).path

        def _specificity(c: ContainerDefV2) -> int:
            meta = getattr(c, 'metadata', {}) or {}
            req = meta.get('required_descendants_any') or []
            exc = meta.get('excluded_descendants_any') or []
            score = len(req) * 2 + len(exc)
            # 优先非通用的 css 选择器（不是仅 '#app'）
            try:
                sel = c.selectors[0]
                css = getattr(sel, 'css', None)
                if css and css.strip() != '#app':
                    score += 1
            except Exception:
                pass
            return score

        root_containers = [
            (container_id, container_def)
            for container_id, container_def in containers.items()
            if ContainerOperationHandler._is_root_container(container_id, container_def)
        ]
        # 按特异性降序，优先匹配约束更强的根容器（如个人主页）
        root_containers.sort(key=lambda item: _specificity(item[1]), reverse=True)

        for container_id, container_def in root_containers:
            match = ContainerOperationHandler._match_single_container(
                playwright_page, container_id, container_def, url, path
            )
            if match:
                return match

        return None

    @staticmethod
    def _match_single_container(
        playwright_page: Any,
        container_id: str,
        container: ContainerDefV2,
        page_url: str,
        page_path: str,
    ) -> Optional[Dict[str, Any]]:
        if not ContainerOperationHandler._matches_page_patterns(container, page_url, page_path):
            return None

        for selector in container.selectors:
            css_selector = ContainerOperationHandler._selector_to_css(selector)
            if not css_selector:
                continue

            try:
                elements = playwright_page.query_selector_all(css_selector)
            except Exception:
                continue

            count = len(elements)
            if count == 0:
                continue

            # Guard checks based on metadata
            guards = getattr(container, 'metadata', {}) or {}
            req_any = guards.get('required_descendants_any') or []
            excl_any = guards.get('excluded_descendants_any') or []

            # Evaluate guards on the first matched element (closest to root)
            if req_any or excl_any:
                try:
                    host = elements[0]
                    # required any: at least one exists
                    if req_any:
                        ok = False
                        for sel in req_any:
                            try:
                                if host.query_selector(sel):
                                    ok = True
                                    break
                            except Exception:
                                pass
                        if not ok:
                            # Guards not satisfied; skip this selector
                            continue
                    # excluded any: none should exist
                    if excl_any:
                        bad = False
                        for sel in excl_any:
                            try:
                                if host.query_selector(sel):
                                    bad = True
                                    break
                            except Exception:
                                pass
                        if bad:
                            continue
                except Exception:
                    # If guard evaluation fails, skip
                    continue

            container_payload = {
                "id": container.id,
                "name": container.name,
                "type": container.type,
                "matched_selector": css_selector,
                "match_count": count,
                "definition": container.to_dict(),
            }

            return {
                "container": container_payload,
                "match_details": {
                    "container_id": container_id,
                    "selector_variant": getattr(selector.variant, "value", None),
                    "selector_classes": getattr(selector, "classes", []),
                    "page_url": page_url,
                    "match_count": count,
                },
            }

        return None

    @staticmethod
    def _selector_to_css(selector) -> Optional[str]:
        css = getattr(selector, 'css', None)
        if css:
            return css
        sel_id = getattr(selector, 'id', None)
        if sel_id:
            return f"#{sel_id}"
        classes = getattr(selector, "classes", None)
        if classes:
            return "." + ".".join(classes)
        return None

    @staticmethod
    def _matches_page_patterns(container: ContainerDefV2, page_url: str, page_path: str) -> bool:
        if not container.page_patterns:
            return True

        import fnmatch

        includes: List[str] = []
        excludes: List[str] = []
        for pattern in container.page_patterns:
            if pattern.startswith('!'):
                excludes.append(pattern[1:])
            else:
                includes.append(pattern)

        for pattern in excludes:
            if fnmatch.fnmatch(page_url, f"*{pattern}*") or fnmatch.fnmatch(page_path, pattern):
                return False

        if not includes:
            return True

        for pattern in includes:
            if fnmatch.fnmatch(page_url, f"*{pattern}*") or fnmatch.fnmatch(page_path, pattern):
                return True

        return False

    @staticmethod
    def _is_root_container(container_id: str, container: ContainerDefV2) -> bool:
        if "." in container_id:
            return False
        return True
