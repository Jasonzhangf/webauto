"""
Dev模式调试命令
"""

from typing import Dict, List, Any, Optional
from datetime import datetime


class DevCommands:
    """Dev模式命令处理器"""

    def __init__(self, cli_context: Dict[str, Any]):
        self.ws_client = cli_context['ws_client']

    def enable_overlay(self, session_id: str) -> Dict[str, Any]:
        """启用Dev覆盖层"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_control',
                'action': 'enable_overlay',
                'overlay_config': {
                    'inspect_enabled': True,
                    'container_editor': True,
                    'workflow_recorder': True,
                    'element_highlight': True,
                    'console_access': True
                }
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'session_id': session_id,
                'overlay_enabled': result.get('data', {}).get('enabled', False),
                'message': 'Dev overlay enabled' if result.get('success') else 'Failed to enable overlay'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def inspect_element(self, session_id: str, selector: str) -> Dict[str, Any]:
        """检查页面元素"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_command',
                'action': 'inspect_element',
                'parameters': {
                    'selector': selector,
                    'detailed': True
                }
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'selector': selector,
                'element_info': result.get('data', {}),
                'message': 'Element inspection completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def get_debug_events(self, session_id: str, limit: int = 50) -> Dict[str, Any]:
        """获取调试事件"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_command',
                'action': 'get_debug_events',
                'parameters': {
                    'limit': limit
                }
            }

            result = self._send_command(session_id, command)

            events = result.get('data', {}).get('events', [])

            return {
                'success': True,
                'session_id': session_id,
                'event_count': len(events),
                'events': events,
                'message': f'Retrieved {len(events)} debug events'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def get_status(self, session_id: str) -> Dict[str, Any]:
        """获取Dev模式状态"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_command',
                'action': 'get_status'
            }

            result = self._send_command(session_id, command)

            status_data = result.get('data', {})

            return {
                'success': True,
                'session_id': session_id,
                'mode': status_data.get('mode', 'unknown'),
                'overlay_active': status_data.get('overlay_active', False),
                'overlay_config': status_data.get('overlay_config', {}),
                'debug_events_count': status_data.get('debug_events_count', 0),
                'inspector_active': status_data.get('inspector_active', False),
                'container_editor_active': status_data.get('container_editor_active', False),
                'last_activity': status_data.get('last_activity'),
                'message': 'Dev status retrieved successfully'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def highlight_element(self, session_id: str, selector: str) -> Dict[str, Any]:
        """高亮元素"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_command',
                'action': 'highlight_element',
                'parameters': {
                    'selector': selector,
                    'style': '2px solid #ff6b6b',
                    'duration': 5000  # 5秒
                }
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'selector': selector,
                'highlighted': result.get('data', {}).get('highlighted', False),
                'message': 'Element highlighting completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def clear_highlights(self, session_id: str) -> Dict[str, Any]:
        """清除所有高亮"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'dev_command',
                'action': 'clear_highlights'
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'cleared_count': result.get('data', {}).get('cleared_count', 0),
                'message': 'Highlights cleared'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def take_screenshot(self, session_id: str, filename: Optional[str] = None) -> Dict[str, Any]:
        """截图"""
        try:
            if not self._ensure_connection():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            if not filename:
                filename = f"dev_screenshot_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"

            command = {
                'command_type': 'node_execute',
                'node_type': 'screenshot',
                'parameters': {
                    'filename': filename,
                    'full_page': True
                }
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'filename': filename,
                'screenshot_path': result.get('data', {}).get('screenshot_path'),
                'message': 'Screenshot taken successfully'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _ensure_connection(self) -> bool:
        """确保WebSocket连接可用"""
        if self.ws_client.is_connected():
            return True
        try:
            return self.ws_client.connect()
        except Exception:
            return False

    def _send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """发送WebSocket命令"""
        try:
            response = self.ws_client.send_command(session_id, command)
            return response.get('data', {})
        except Exception as error:
            raise Exception(f"WebSocket command failed: {error}")
