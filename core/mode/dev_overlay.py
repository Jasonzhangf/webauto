"""
Dev Mode UI Overlay Injection
"""

import asyncio
import json
from typing import Any, Dict, Optional, List
from datetime import datetime

from .models import OverlayConfig, DevSession, DebugEvent


class DevOverlayInjector:
    """Dev模式UI覆盖层注入器"""

    def __init__(self):
        self.logger = None
        self.overlay_sessions: Dict[str, DevSession] = {}

    async def inject_overlay(self, session_id: str, browser_session: Any,
                           overlay_config: OverlayConfig) -> bool:
        """注入UI覆盖层"""
        try:
            # 创建Dev会话
            dev_session = DevSession(
                session_id=session_id,
                overlay_config=overlay_config
            )
            self.overlay_sessions[session_id] = dev_session

            # 注入覆盖层脚本
            overlay_script = self._generate_overlay_script(overlay_config)

            # 执行脚本注入
            injection_result = await self._execute_injection(
                browser_session, overlay_script
            )

            if injection_result:
                dev_session.add_debug_event(
                    'overlay_injected',
                    {
                        'config': overlay_config.to_dict(),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                )
                return True
            else:
                dev_session.add_debug_event(
                    'overlay_injection_failed',
                    {'error': 'Script execution failed'}
                )
                return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Overlay injection failed: {error}")

            if session_id in self.overlay_sessions:
                self.overlay_sessions[session_id].add_debug_event(
                    'overlay_injection_error',
                    {'error': str(error)}
                )

            return False

    async def unload_overlay(self, session_id: str, browser_session: Any) -> bool:
        """卸载UI覆盖层"""
        try:
            if session_id not in self.overlay_sessions:
                return True  # 已经卸载

            # 执行卸载脚本
            unload_script = """
            (function() {
                if (window.webautoOverlay) {
                    window.webautoOverlay.destroy();
                    window.webautoOverlay = null;
                }

                // 移除覆盖层元素
                const overlay = document.getElementById('webauto-dev-overlay');
                if (overlay) {
                    overlay.remove();
                }

                return true;
            })();
            """

            result = await browser_session.evaluate(unload_script)

            # 清理会话记录
            dev_session = self.overlay_sessions[session_id]
            dev_session.add_debug_event(
                'overlay_unloaded',
                {'timestamp': datetime.utcnow().isoformat()}
            )

            del self.overlay_sessions[session_id]

            return result

        except Exception as error:
            if self.logger:
                self.logger.error(f"Overlay unloading failed: {error}")
            return False

    def _generate_overlay_script(self, config: OverlayConfig) -> str:
        """生成覆盖层脚本"""
        return f"""
        (function() {{
            // 防止重复注入
            if (window.webautoOverlay) {{
                return false;
            }}

            // 创建覆盖层iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'webauto-dev-overlay';
            iframe.src = 'about:blank';
            iframe.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 999999;
                pointer-events: none;
                border: none;
                background: transparent;
            `;

            document.body.appendChild(iframe);

            // 等待iframe加载并初始化
            iframe.onload = function() {{
                const doc = iframe.contentDocument;
                const win = iframe.contentWindow;

                // 写入覆盖层HTML
                doc.open();
                doc.write(`{self._generate_overlay_html(config)}`);
                doc.close();

                // 初始化覆盖层功能
                window.webautoOverlay = {{
                    config: {json.dumps(config.to_dict())},
                    iframe: iframe,
                    doc: doc,
                    win: win,

                    // 显示元素高亮
                    highlightElement: function(selector) {{
                        if (!{str(config.element_highlight).lower()}) return;

                        try {{
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(el => {{
                                el.style.outline = '2px solid #ff6b6b';
                                el.style.outlineOffset = '2px';
                            }});

                            this.postMessage({{
                                type: 'elements_highlighted',
                                selector: selector,
                                count: elements.length
                            }});
                        }} catch (error) {{
                            console.error('Highlight failed:', error);
                        }}
                    }},

                    // 清除高亮
                    clearHighlights: function() {{
                        const highlighted = document.querySelectorAll('[style*="outline: 2px solid"]');
                        highlighted.forEach(el => {{
                            el.style.outline = '';
                            el.style.outlineOffset = '';
                        }});
                    }},

                    // 获取元素信息
                    getElementInfo: function(selector) {{
                        try {{
                            const element = document.querySelector(selector);
                            if (!element) return null;

                            const rect = element.getBoundingClientRect();
                            const computed = window.getComputedStyle(element);

                            return {{
                                selector: selector,
                                tagName: element.tagName.toLowerCase(),
                                text: element.textContent?.substring(0, 100) || '',
                                id: element.id || '',
                                className: element.className || '',
                                attributes: this.getElementAttributes(element),
                                rect: {{
                                    x: rect.x,
                                    y: rect.y,
                                    width: rect.width,
                                    height: rect.height
                                }},
                                styles: {{
                                    display: computed.display,
                                    visibility: computed.visibility,
                                    opacity: computed.opacity
                                }}
                            }};
                        }} catch (error) {{
                            return {{ error: error.message }};
                        }}
                    }},

                    getElementAttributes: function(element) {{
                        const attrs = {{}};
                        for (let attr of element.attributes) {{
                            attrs[attr.name] = attr.value;
                        }}
                        return attrs;
                    }},

                    // 发送消息到父窗口
                    postMessage: function(data) {{
                        window.parent.postMessage({{
                            type: 'webauto-overlay',
                            data: data
                        }}, '*');
                    }},

                    // 销毁覆盖层
                    destroy: function() {{
                        this.clearHighlights();
                        if (this.iframe && this.iframe.parentNode) {{
                            this.iframe.parentNode.removeChild(this.iframe);
                        }}
                    }}
                }};

                // 设置消息监听
                window.addEventListener('message', function(event) {{
                    if (event.data.type === 'webauto-bridge' && event.data.target === 'overlay') {{
                        const command = event.data.command;
                        const handler = window.webautoOverlay[command];

                        if (typeof handler === 'function') {{
                            const result = handler.apply(window.webautoOverlay, event.data.args || []);

                            // 发送结果回父窗口
                            window.webautoOverlay.postMessage({{
                                type: 'command_result',
                                command: command,
                                result: result,
                                requestId: event.data.requestId
                            }});
                        }}
                    }}
                }});

                // 通知父窗口覆盖层已就绪
                window.webautoOverlay.postMessage({{
                    type: 'overlay_ready'
                }});
            }};

            return true;
        }})();
        """

    def _generate_overlay_html(self, config: OverlayConfig) -> str:
        """生成覆盖层HTML"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    margin: 0;
                    padding: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: transparent;
                    pointer-events: none;
                }}

                .webauto-toolbar {{
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    pointer-events: auto;
                    z-index: 1000000;
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }}

                .webauto-button {{
                    background: rgba(255, 255, 255, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                    pointer-events: auto;
                }}

                .webauto-button:hover {{
                    background: rgba(255, 255, 255, 0.3);
                }}

                .webauto-button.active {{
                    background: rgba(76, 175, 80, 0.5);
                    border-color: rgba(76, 175, 80, 0.8);
                }}

                .webauto-status {{
                    padding: 2px 6px;
                    background: rgba(33, 150, 243, 0.5);
                    border-radius: 2px;
                    font-size: 10px;
                }}
            </style>
        </head>
        <body>
            <div class="webauto-toolbar">
                <span class="webauto-status">Dev Mode</span>
                {'<button class="webauto-button" id="inspect-btn" onclick="toggleInspect()">Inspect</button>' if config.inspect_enabled else ''}
                {'<button class="webauto-button" id="container-btn" onclick="toggleContainerEditor()">Container</button>' if config.container_editor else ''}
                {'<button class="webauto-button" id="record-btn" onclick="toggleRecorder()">Record</button>' if config.workflow_recorder else ''}
                <button class="webauto-button" onclick="clearHighlights()">Clear</button>
            </div>

            <script>
                function toggleInspect() {{
                    const btn = document.getElementById('inspect-btn');
                    btn.classList.toggle('active');

                    window.parent.postMessage({{
                        type: 'webauto-bridge',
                        target: 'parent',
                        command: 'toggleInspectMode'
                    }}, '*');
                }}

                function toggleContainerEditor() {{
                    const btn = document.getElementById('container-btn');
                    btn.classList.toggle('active');

                    window.parent.postMessage({{
                        type: 'webauto-bridge',
                        target: 'parent',
                        command: 'toggleContainerEditor'
                    }}, '*');
                }}

                function toggleRecorder() {{
                    const btn = document.getElementById('record-btn');
                    btn.classList.toggle('active');

                    window.parent.postMessage({{
                        type: 'webauto-bridge',
                        target: 'parent',
                        command: 'toggleWorkflowRecorder'
                    }}, '*');
                }}

                function clearHighlights() {{
                    window.parent.postMessage({{
                        type: 'webauto-bridge',
                        target: 'overlay',
                        command: 'clearHighlights'
                    }}, '*');
                }}
            </script>
        </body>
        </html>
        """

    async def _execute_injection(self, browser_session: Any, script: str) -> bool:
        """执行脚本注入"""
        try:
            # 真实的浏览器会话集成
            if hasattr(browser_session, 'evaluate'):
                result = await browser_session.evaluate(script)
                return result is not None
            elif hasattr(browser_session, 'execute_script'):
                result = await browser_session.execute_script(script)
                return result is not None
            else:
                # 如果直接是JavaScript字符串，尝试执行
                if isinstance(browser_session, str):
                    # 这里可能需要通过WebSocket或其他方式执行
                    return False
                else:
                    # 尝试调用JavaScript执行方法
                    if hasattr(browser_session, 'run_js'):
                        result = await browser_session.run_js(script)
                        return result is not None
                    else:
                        if self.logger:
                            self.logger.warning(f"Browser session does not support script execution")
                        return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Script injection failed: {error}")
            return False

    def get_dev_session(self, session_id: str) -> Optional[DevSession]:
        """获取Dev会话"""
        return self.overlay_sessions.get(session_id)

    def send_message_to_overlay(self, session_id: str, message: Dict[str, Any]) -> bool:
        """向覆盖层发送消息"""
        try:
            if session_id not in self.overlay_sessions:
                return False

            # 通过WebSocket或其他机制发送消息
            # 这里需要实际的通信实现
            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to send message to overlay: {error}")
            return False

    def handle_overlay_message(self, session_id: str, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """处理来自覆盖层的消息"""
        if session_id not in self.overlay_sessions:
            return None

        dev_session = self.overlay_sessions[session_id]

        # 记录事件
        dev_session.add_debug_event(
            'overlay_message',
            {
                'message_type': message.get('type'),
                'data': message.get('data', {})
            }
        )

        # 处理特定消息类型
        if message.get('type') == 'overlay_ready':
            return {'status': 'ready'}
        elif message.get('type') == 'elements_highlighted':
            return {'status': 'highlighted'}
        elif message.get('type') == 'element_info_request':
            # 处理元素信息请求
            selector = message.get('data', {}).get('selector')
            if selector:
                # 这里需要通过浏览器会话获取元素信息
                return {'selector': selector, 'info': 'placeholder'}

        return None


class UIOverlayManager:
    """UI覆盖层管理器"""

    def __init__(self, injector: DevOverlayInjector):
        self.injector = injector
        self.active_overlays: Dict[str, str] = {}  # session_id -> overlay_version

    async def enable_overlay(self, session_id: str, browser_session: Any,
                           overlay_config: OverlayConfig) -> bool:
        """启用UI覆盖层"""
        try:
            # 如果已有覆盖层，先卸载
            if session_id in self.active_overlays:
                await self.injector.unload_overlay(session_id, browser_session)

            # 注入新的覆盖层
            success = await self.injector.inject_overlay(
                session_id, browser_session, overlay_config
            )

            if success:
                self.active_overlays[session_id] = "1.0.0"  # 版本号

            return success

        except Exception as error:
            if self.injector.logger:
                self.injector.logger.error(f"Failed to enable overlay: {error}")
            return False

    async def disable_overlay(self, session_id: str, browser_session: Any) -> bool:
        """禁用UI覆盖层"""
        try:
            success = await self.injector.unload_overlay(session_id, browser_session)

            if success and session_id in self.active_overlays:
                del self.active_overlays[session_id]

            return success

        except Exception as error:
            if self.injector.logger:
                self.injector.logger.error(f"Failed to disable overlay: {error}")
            return False

    def is_overlay_active(self, session_id: str) -> bool:
        """检查覆盖层是否活跃"""
        return session_id in self.active_overlays

    def get_overlay_status(self, session_id: str) -> Dict[str, Any]:
        """获取覆盖层状态"""
        if session_id not in self.active_overlays:
            return {'active': False}

        dev_session = self.injector.get_dev_session(session_id)
        if not dev_session:
            return {'active': True, 'session': None}

        return {
            'active': True,
            'version': self.active_overlays[session_id],
            'session': dev_session.to_dict(),
            'recent_events': [
                event.to_dict() for event in dev_session.get_recent_events(10)
            ]
        }