"""
Container operation handling for WebSocket server commands.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
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
        if action == "inspect_tree":
            page_context = command.get("page_context", {})
            parameters = command.get("parameters", {})
            return await self.inspect_tree(session_id, page_context, parameters)
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

    async def inspect_tree(
        self,
        session_id: str,
        page_context: Dict[str, Any],
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        import logging
        logger = logging.getLogger(__name__)
        params = parameters or {}

        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                return {
                    "success": False,
                    "error": f"Session {session_id} not found",
                }

            url = page_context.get("url") or session.current_url or ""
            if not url:
                return {
                    "success": False,
                    "error": "page_context.url is required",
                }

            containers = get_containers_for_url_v2(url)
            if not containers:
                return {
                    "success": False,
                    "error": "No container definitions available for this URL",
                }

            try:
                await session.ensure_page(url)
            except AntiBotError as anti_bot_error:
                logger.warning("Anti-bot detection triggered during inspect_tree: %s", anti_bot_error)
                browser = getattr(session, "browser", None)
                if browser is not None and hasattr(browser, "_risk_control_enabled"):
                    try:
                        browser._risk_control_enabled = False  # type: ignore[attr-defined]
                        await session.ensure_page(url)
                    except Exception:
                        raise

            snapshot = await session.run(
                ContainerOperationHandler._capture_inspector_data,
                containers,
                page_context,
                params,
            )

            if not snapshot:
                return {
                    "success": False,
                    "error": "Unable to capture inspector snapshot",
                }

            return {
                "success": True,
                "data": snapshot,
            }
        except Exception as error:
            logger = logging.getLogger(__name__)
            logger.error("Error in inspect_tree: %s", error)
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": f"Inspector error: {str(error)}",
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

    @staticmethod
    def _capture_inspector_data(
        session: BrowserSession,
        containers: Dict[str, ContainerDefV2],
        page_context: Dict[str, Any],
        parameters: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        page = session.current_page
        playwright_page = getattr(page, "page", None)
        if playwright_page is None:
            return None

        url = page_context.get("url") or session.current_url or ""
        path = urlparse(url).path
        root_container_id = parameters.get("root_container_id") or parameters.get("root_id")
        root_selector = parameters.get("root_selector")
        try:
            max_depth = int(parameters.get("max_depth", 4))
        except Exception:
            max_depth = 4
        try:
            max_children = int(parameters.get("max_children", 6))
        except Exception:
            max_children = 6
        max_depth = max(1, min(max_depth, 6))
        max_children = max(1, min(max_children, 12))

        root_match = None
        if root_container_id and root_container_id in containers:
            root_match = ContainerOperationHandler._match_single_container(
                playwright_page,
                root_container_id,
                containers[root_container_id],
                url,
                path,
            )

        if not root_match:
            root_match = ContainerOperationHandler._match_containers_sync(
                session,
                containers,
                page_context,
            )

        if not root_match:
            return None

        if not root_selector:
            root_selector = root_match["container"].get("matched_selector")

        root_container_id = root_match["container"]["id"]
        match_map = ContainerOperationHandler._collect_container_matches(
            playwright_page,
            containers,
            root_selector,
        )
        container_tree = ContainerOperationHandler._build_container_tree(
            containers,
            root_container_id,
            match_map,
        )
        dom_tree = ContainerOperationHandler._capture_dom_outline(
            playwright_page,
            root_selector,
            max_depth,
            max_children,
        )
        annotations = ContainerOperationHandler._build_dom_annotation_map(match_map)
        ContainerOperationHandler._attach_dom_annotations(dom_tree, annotations)

        return {
            "root_match": root_match,
            "container_tree": container_tree,
            "dom_tree": dom_tree,
            "matches": match_map,
            "metadata": {
                "captured_at": time.time(),
                "max_depth": max_depth,
                "max_children": max_children,
            },
        }

    @staticmethod
    def _build_container_tree(
        containers: Dict[str, ContainerDefV2],
        root_id: Optional[str],
        match_map: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        if not containers:
            return None
        target_root = root_id if root_id in containers else ContainerOperationHandler._infer_fallback_root(containers, root_id)
        if target_root is None:
            return None

        def build(node_id: str) -> Optional[Dict[str, Any]]:
            container = containers.get(node_id)
            if not container:
                return None
            child_ids = ContainerOperationHandler._resolve_child_ids(node_id, container, containers)
            node = {
                "id": container.id,
                "name": container.name,
                "type": container.type,
                "capabilities": container.capabilities,
                "selectors": [selector.to_dict() for selector in container.selectors],
                "match": ContainerOperationHandler._summarize_match_payload(node_id, match_map),
                "children": [],
            }
            for child_id in child_ids:
                child_node = build(child_id)
                if child_node:
                    node["children"].append(child_node)
            return node

        return build(target_root)

    @staticmethod
    def _infer_fallback_root(
        containers: Dict[str, ContainerDefV2],
        preferred_id: Optional[str] = None,
    ) -> Optional[str]:
        if preferred_id and preferred_id in containers:
            return preferred_id
        candidates = [cid for cid in containers.keys() if "." not in cid]
        if candidates:
            return sorted(candidates)[0]
        # fallback to deterministic first key
        return sorted(containers.keys())[0] if containers else None

    @staticmethod
    def _resolve_child_ids(
        container_id: str,
        container: ContainerDefV2,
        containers: Dict[str, ContainerDefV2],
    ) -> List[str]:
        declared = container.children or []
        child_ids = [child for child in declared if child in containers]
        if child_ids:
            return child_ids

        prefix = f"{container_id}."
        target_depth = container_id.count(".") + 1
        fallback: List[str] = []
        for candidate_id in containers.keys():
            if not candidate_id.startswith(prefix):
                continue
            if candidate_id.count(".") != target_depth:
                continue
            fallback.append(candidate_id)
        fallback.sort()
        return fallback

    @staticmethod
    def _summarize_match_payload(container_id: str, match_map: Dict[str, Any]) -> Dict[str, Any]:
        payload = match_map.get(container_id) or {}
        return {
            "match_count": payload.get("match_count", 0),
            "selectors": payload.get("selectors", []),
            "nodes": payload.get("nodes", []),
        }

    @staticmethod
    def _extract_dom_outline(
        playwright_page: Any,
        root_selector: Optional[str],
        max_depth: int,
        max_children: int,
    ) -> Optional[Dict[str, Any]]:
        try:
            return playwright_page.evaluate(
                """
                (options) => {
                  const selector = options?.selector || null;
                  const depthLimit = options?.depthLimit ?? 4;
                  const childLimit = options?.childLimit ?? 6;
                  const root = selector ? document.querySelector(selector) : document.body;
                  if (!root) return null;

                  const build = (element, path, depth) => {
                    const meta = {
                      path: path.join('/'),
                      tag: element.tagName,
                      id: element.id || null,
                      classes: Array.from(element.classList || []),
                      childCount: element.children ? element.children.length : 0,
                      textSnippet: (element.textContent || '').trim().slice(0, 80),
                      children: [],
                    };
                    if (depth >= depthLimit) {
                      return meta;
                    }
                    const kids = Array.from(element.children || []).slice(0, childLimit);
                    meta.children = kids.map((child, index) =>
                      build(child, path.concat(index), depth + 1)
                    );
                    return meta;
                  };

                  return build(root, ['root'], 0);
                }
                """,
                {
                    "selector": root_selector,
                    "depthLimit": max_depth,
                    "childLimit": max_children,
                },
            )
        except Exception:
            return None

    @staticmethod
    def _capture_dom_outline(
        playwright_page: Any,
        preferred_selector: Optional[str],
        max_depth: int,
        max_children: int,
    ) -> Optional[Dict[str, Any]]:
        tried = set()
        selector_order: List[Optional[str]] = []
        if preferred_selector:
            selector_order.append(preferred_selector)
        selector_order.extend(["#app", "body", None])

        for selector in selector_order:
            if selector in tried:
                continue
            tried.add(selector)
            attempts = 5 if selector == preferred_selector and selector is not None else 3
            for _ in range(max(1, attempts)):
                dom_tree = ContainerOperationHandler._extract_dom_outline(
                    playwright_page,
                    selector,
                    max_depth,
                    max_children,
                )
                if dom_tree:
                    return dom_tree
                time.sleep(0.25)

        return ContainerOperationHandler._fallback_dom_outline(
            playwright_page,
            max_depth,
            max_children,
        )

    @staticmethod
    def _fallback_dom_outline(
        playwright_page: Any,
        max_depth: int = 4,
        max_children: int = 8,
    ) -> Optional[Dict[str, Any]]:
        try:
            return playwright_page.evaluate(
                """
                (config) => {
                  const root = document.body || document.documentElement;
                  if (!root) return null;
                  const walk = (element, path, depth) => {
                    const meta = {
                      path: path.join('/'),
                      tag: element.tagName,
                      id: element.id || null,
                      classes: Array.from(element.classList || []),
                      childCount: element.children ? element.children.length : 0,
                      textSnippet: (element.textContent || '').trim().slice(0, 80),
                      children: [],
                    };
                    if (depth >= config.maxDepth) {
                      return meta;
                    }
                    const kids = Array.from(element.children || []).slice(0, config.maxChildren);
                    meta.children = kids.map((child, index) => walk(child, path.concat(index), depth + 1));
                    return meta;
                  };
                  return walk(root, ['root'], 0);
                }
                """,
                {
                    "maxDepth": max(1, min(int(max_depth or 4), 8)),
                    "maxChildren": max(1, min(int(max_children or 8), 40)),
                },
            )
        except Exception:
            return None

    @staticmethod
    def _collect_container_matches(
        playwright_page: Any,
        containers: Dict[str, ContainerDefV2],
        root_selector: Optional[str],
        max_nodes: int = 4,
    ) -> Dict[str, Any]:
        summary: Dict[str, Any] = {}
        for container_id, container in containers.items():
            selectors: List[str] = []
            nodes: List[Dict[str, Any]] = []
            total_matches = 0
            for selector in container.selectors:
                css = ContainerOperationHandler._selector_to_css(selector)
                if not css:
                    continue
                try:
                    handles = playwright_page.query_selector_all(css)
                except Exception:
                    continue
                count = len(handles)
                if count == 0:
                    continue
                selectors.append(css)
                total_matches += count
                for handle in handles[:max_nodes]:
                    info = ContainerOperationHandler._describe_element(handle, root_selector)
                    if not info:
                        continue
                    info["selector"] = css
                    nodes.append(info)
                if len(nodes) >= max_nodes:
                    break

            summary[container_id] = {
                "container": {
                    "id": container.id,
                    "name": container.name,
                    "type": container.type,
                },
                "selectors": selectors,
                "match_count": total_matches,
                "nodes": nodes,
            }
        return summary

    @staticmethod
    def _describe_element(handle: Any, root_selector: Optional[str]) -> Optional[Dict[str, Any]]:
        try:
            return handle.evaluate(
                """
                (element, options) => {
                  const selector = options?.rootSelector || null;
                  let root = selector ? document.querySelector(selector) : null;
                  if (!root) {
                    root = document.querySelector('#app') || document.body || document.documentElement;
                  }
                  const buildPath = () => {
                    if (root && element === root) {
                      return 'root';
                    }
                    const indices = [];
                    let current = element;
                    let guard = 0;
                    while (current && guard < 80) {
                      if (root && current === root) {
                        break;
                      }
                      const parent = current.parentElement;
                      if (!parent) {
                        break;
                      }
                      const index = Array.prototype.indexOf.call(parent.children || [], current);
                      indices.unshift(index);
                      current = parent;
                      guard += 1;
                    }
                    return ['root'].concat(indices).join('/');
                  };
                  const classes = Array.from(element.classList || []);
                  const snippet = (element.innerText || element.textContent || '')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .slice(0, 120);
                  return {
                    dom_path: buildPath(),
                    tag: element.tagName,
                    id: element.id || null,
                    classes,
                    textSnippet: snippet,
                  };
                }
                """,
                {"rootSelector": root_selector},
            )
        except Exception:
            return None
        finally:
            try:
                handle.dispose()
            except Exception:
                pass

    @staticmethod
    def _build_dom_annotation_map(match_map: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        annotations: Dict[str, List[Dict[str, Any]]] = {}
        for container_id, payload in match_map.items():
            nodes = payload.get("nodes") or []
            for node in nodes:
                dom_path = node.get("dom_path")
                if not dom_path:
                    continue
                annotations.setdefault(dom_path, []).append(
                    {
                        "container_id": container_id,
                        "container_name": payload.get("container", {}).get("name"),
                        "selector": node.get("selector"),
                    }
                )
        return annotations

    @staticmethod
    def _attach_dom_annotations(
        dom_tree: Optional[Dict[str, Any]],
        annotations: Dict[str, List[Dict[str, Any]]],
    ) -> None:
        if not dom_tree:
            return

        def attach(node: Dict[str, Any]) -> None:
            path = node.get("path")
            node["containers"] = annotations.get(path, [])
            for child in node.get("children") or []:
                attach(child)

        attach(dom_tree)
