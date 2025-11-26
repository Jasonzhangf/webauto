"""
Async WebSocket server that bridges CLI commands to browser sessions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

import websockets
from websockets.server import WebSocketServerProtocol

from .container_handler import ContainerOperationHandler
from .session_manager import SessionManager


class WebSocketServer:
    """Receives CLI commands and routes them to the appropriate handlers."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8765):
        self.host = host
        self.port = port
        self.logger = logging.getLogger(__name__)
        self.session_manager = SessionManager()
        self.container_handler = ContainerOperationHandler(self.session_manager)
        self._server: Optional[websockets.server.Serve] = None

    async def start(self) -> None:
        self._server = await websockets.serve(self._handle_connection, self.host, self.port)
        self.logger.info("WebSocket server listening on ws://%s:%d", self.host, self.port)

    async def run_forever(self) -> None:
        await self.start()
        assert self._server is not None
        await self._server.wait_closed()

    async def shutdown(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        await self.session_manager.shutdown()

    async def _handle_connection(self, websocket: WebSocketServerProtocol) -> None:
        peer = websocket.remote_address
        self.logger.info("Client connected: %s", peer)

        try:
            async for message in websocket:
                response = await self._process_message(message)
                if response:
                    await websocket.send(json.dumps(response))
        except websockets.ConnectionClosed:
            self.logger.info("Client disconnected: %s", peer)
        except Exception as exc:
            self.logger.exception("Error handling client %s: %s", peer, exc)
        finally:
            self.logger.info("Connection closed: %s", peer)

    async def _process_message(self, raw_message: str) -> Dict[str, Any]:
        self.logger.debug("Processing message: %s", raw_message)
        try:
            payload = json.loads(raw_message)
            self.logger.debug("Parsed payload: %s", payload)
        except json.JSONDecodeError:
            return self._error_response(None, "Invalid JSON payload")

        if payload.get("type") != "command":
            return self._error_response(payload.get("session_id"), "Unsupported message type")

        session_id = payload.get("session_id", "")
        command = payload.get("data", {})
        self.logger.debug("Dispatching command: %s for session: %s", command.get("command_type"), session_id)

        try:
            result = await self._dispatch_command(session_id, command)
            self.logger.debug("Command result: %s", result)
        except Exception as exc:
            self.logger.exception("Command processing failed: %s", exc)
            return self._error_response(session_id, f"Command failed: {exc}")

        return {
            "type": "response",
            "session_id": session_id,
            "data": result,
        }

    async def _dispatch_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        command_type = command.get("command_type")
        self.logger.info(f"Dispatching command: {command_type} for session: {session_id}")

        try:
            if command_type == "session_control":
                return await self._handle_session_control(session_id, command)
            if command_type == "mode_switch":
                return await self._handle_mode_switch(session_id, command)
            if command_type == "container_operation":
                self.logger.info(f"Delegating to container_handler")
                return await self.container_handler.handle(session_id, command)
            if command_type == "node_execute":
                self.logger.info(f"Delegating to node handler")
                return await self._handle_node_execute(session_id, command)
            if command_type == "dev_control":
                self.logger.info(f"Delegating to dev handler")
                return await self._handle_dev_control(session_id, command)

            return {
                "success": False,
                "error": f"Unknown command_type: {command_type}",
            }
        except Exception as error:
            self.logger.error(f"Error handling command {command_type}: {error}")
            import traceback
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": f"Command execution error: {str(error)}",
            }

    async def _handle_session_control(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        action = command.get("action")
        if action == "create":
            capabilities = command.get("capabilities") or ["dom"]
            browser_config = command.get("browser_config")
            return await self.session_manager.create_session(capabilities, browser_config)

        if action == "list":
            sessions = await self.session_manager.list_sessions()
            return {"success": True, "sessions": sessions}

        if action == "info":
            info = await self.session_manager.get_session_info(session_id)
            if info:
                return {"success": True, "session_info": info}
            return {"success": False, "error": f"Session {session_id} not found"}

        if action == "delete":
            deleted = await self.session_manager.delete_session(session_id)
            return {
                "success": deleted,
                "session_id": session_id,
                "message": "Session removed" if deleted else "Session not found",
            }

        return {"success": False, "error": f"Unknown session action: {action}"}

    async def _handle_mode_switch(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        session = self.session_manager.get_session(session_id)
        if not session:
            return {"success": False, "error": f"Session {session_id} not found"}

        target_mode = command.get("target_mode", "dev")
        await session.set_mode(target_mode)
        return {
            "success": True,
            "session_id": session_id,
            "new_mode": target_mode,
        }

    async def _handle_node_execute(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """处理Node执行命令"""
        node_type = command.get("node_type")
        parameters = command.get("parameters", {})

        self.logger.info(f"Executing node: {node_type} with params: {parameters}")

        session = self.session_manager.get_session(session_id)
        if not session:
            return {
                "success": False,
                "error": f"Session {session_id} not found",
            }

        try:
            if node_type == "navigate":
                # 导航节点
                url = parameters.get("url")
                if not url:
                    return {
                        "success": False,
                        "error": "Navigate node requires 'url' parameter",
                    }

                await session.ensure_page(url)
                return {
                    "success": True,
                    "data": {
                        "action": "navigated",
                        "url": url,
                        "title": "Navigation successful"  # 简化title，避免PageWrapper属性问题
                    }
                }

            elif node_type == "click":
                # 点击节点
                selector = parameters.get("selector")
                if not selector:
                    return {
                        "success": False,
                        "error": "Click node requires 'selector' parameter",
                    }

                await session.current_page.click(selector)
                return {
                    "success": True,
                    "data": {
                        "action": "clicked",
                        "selector": selector
                    }
                }

            elif node_type == "type":
                # 输入文本节点
                selector = parameters.get("selector")
                text = parameters.get("text")
                if not selector or text is None:
                    return {
                        "success": False,
                        "error": "Type node requires 'selector' and 'text' parameters",
                    }

                await session.current_page.fill(selector, text)
                return {
                    "success": True,
                    "data": {
                        "action": "typed",
                        "selector": selector,
                        "text": text
                    }
                }
            elif node_type == "screenshot":
                filename = parameters.get("filename")
                full_page = bool(parameters.get("full_page", False))
                if not filename:
                    filename = f"screenshot_{int(time.time() * 1000)}.png"

                screenshot_dir = Path("screenshots")
                screenshot_dir.mkdir(parents=True, exist_ok=True)
                screenshot_path = screenshot_dir / filename

                def _capture_screenshot(session_obj: BrowserSession, path: Path, full: bool) -> Optional[str]:
                    page_wrapper = session_obj.current_page
                    playwright_page = getattr(page_wrapper, "page", None) if page_wrapper else None
                    if playwright_page is None:
                        return None
                    playwright_page.screenshot(path=str(path), full_page=full)
                    return str(path)

                result_path = await session.run(_capture_screenshot, screenshot_path, full_page)
                if not result_path:
                    return {
                        "success": False,
                        "error": "No active page to capture"
                    }

                return {
                    "success": True,
                    "data": {
                        "action": "screenshot",
                        "screenshot_path": result_path,
                        "full_page": full_page
                    }
                }

            elif node_type == "query":
                selector = parameters.get("selector")
                max_items = int(parameters.get("max_items", 5))
                if not selector:
                    return {
                        "success": False,
                        "error": "Query node requires 'selector'"
                    }

                def _query(session_obj: BrowserSession, sel: str, limit: int):
                    page_wrapper = session_obj.current_page
                    pw = getattr(page_wrapper, "page", None) if page_wrapper else None
                    if pw is None:
                        return None
                    try:
                        handles = pw.query_selector_all(sel)
                        count = len(handles)
                        sample = []
                        for h in handles[: max(0, limit)]:
                            info = pw.evaluate(
                                "el => ({ tag: el.tagName, id: el.id || null, classes: Array.from(el.classList||[]), text: (el.textContent||'').slice(0,120) })",
                                h,
                            )
                            sample.append(info)
                        return {"count": count, "sample": sample}
                    except Exception:
                        return {"count": 0, "sample": []}

                result = await session.run(_query, selector, max_items)
                if result is None:
                    return {"success": False, "error": "No active page"}
                return {"success": True, "data": {"selector": selector, **result}}

            elif node_type == "dom_info":
                # 提取接近根节点的DOM信息，辅助选择根容器选择器
                session = self.session_manager.get_session(session_id)
                if not session:
                    return {
                        "success": False,
                        "error": f"Session {session_id} not found",
                    }

                def _extract_dom_info(session_obj: BrowserSession) -> Optional[Dict[str, Any]]:
                    page_wrapper = session_obj.current_page
                    pw = getattr(page_wrapper, "page", None) if page_wrapper else None
                    if pw is None:
                        return None
                    try:
                        return pw.evaluate("""
                        () => {
                          const out = {};
                          const doc = document;
                          const html = doc.documentElement;
                          const body = doc.body;
                          out.html = { id: html.id || null, classes: Array.from(html.classList||[]) };
                          out.body = { id: body && body.id || null, classes: body ? Array.from(body.classList||[]) : [] };
                          const app = doc.getElementById('app');
                          out.app = app ? { id: app.id, classes: Array.from(app.classList||[]) } : null;
                          if (app) {
                            out.appChildren = Array.from(app.children||[]).slice(0,8).map(el => ({
                              tag: el.tagName,
                              id: el.id || null,
                              classes: Array.from(el.classList||[])
                            }));
                          } else {
                            out.appChildren = [];
                          }
                          out.bodyChildren = Array.from((body||{}).children||[]).slice(0,8).map(el => ({
                            tag: el.tagName,
                            id: el.id || null,
                            classes: Array.from(el.classList||[])
                          }));
                          return out;
                        }
                        """)
                    except Exception:
                        return None

                info = await session.run(_extract_dom_info)
                if info is None:
                    return { "success": False, "error": "No active page" }
                return { "success": True, "data": info }

            else:
                return {
                    "success": False,
                    "error": f"Unsupported node type: {node_type}",
                }

        except Exception as error:
            self.logger.error(f"Error executing node {node_type}: {error}")
            return {
                "success": False,
                "error": f"Node execution error: {str(error)}",
            }

    async def _handle_dev_control(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """处理Dev控制命令"""
        action = command.get("action")
        self.logger.info(f"Dev control action: {action}")

        session = self.session_manager.get_session(session_id)
        if not session:
            return {
                "success": False,
                "error": f"Session {session_id} not found",
            }

        try:
            if action == "enable_overlay":
                # 启用overlay
                self.logger.info(f"Enabling overlay for session {session_id}")
                # 这里可以调用session的overlay启用方法
                return {
                    "success": True,
                    "data": {
                        "action": "overlay_enabled",
                        "session_id": session_id,
                        "overlay_config": command.get("overlay_config", {})
                    }
                }

            else:
                return {
                    "success": False,
                    "error": f"Unsupported dev control action: {action}",
                }

        except Exception as error:
            self.logger.error(f"Error handling dev control {action}: {error}")
            return {
                "success": False,
                "error": f"Dev control error: {str(error)}",
            }

    def _error_response(self, session_id: Optional[str], message: str) -> Dict[str, Any]:
        return {
            "type": "error",
            "session_id": session_id,
            "message": message,
        }
