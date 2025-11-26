"""
会话管理命令
"""

from typing import Dict, List, Any, Optional
import uuid
from datetime import datetime


class SessionCommands:
    """会话命令处理器"""

    def __init__(self, cli_context: Dict[str, Any]):
        self.ws_client = cli_context['ws_client']
        self.default_capabilities = ['dom', 'screenshot', 'network']

    def create(self, capabilities: List[str]) -> Dict[str, Any]:
        """创建新的浏览器会话"""
        try:
            # 确保WebSocket连接
            if not self.ws_client.is_connected():
                # 尝试连接
                if not self.ws_client.connect():
                    return {
                        'success': False,
                        'error': 'Failed to connect to WebSocket server'
                    }

            # 创建会话命令
            command = {
                'command_type': 'session_control',
                'action': 'create',
                'capabilities': capabilities or self.default_capabilities
            }

            # 生成临时会话ID（实际由服务器生成）
            session_id = f"session_{uuid.uuid4().hex[:8]}"

            # 发送命令（这里需要异步支持）
            # 在实际实现中，这里需要处理异步调用
            result = self._send_command(session_id, command)

            return {
                'success': True,
                'session_id': result.get('session_id', session_id),
                'capabilities': result.get('capabilities', capabilities),
                'created_at': datetime.utcnow().isoformat(),
                'message': 'Session created successfully'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def list(self) -> Dict[str, Any]:
        """列出所有活跃会话"""
        try:
            if not self.ws_client.is_connected():
                # 自动连接
                if not self.ws_client.connect():
                    return {
                        'success': False,
                        'error': 'Failed to connect to WebSocket server'
                    }

            command = {
                'command_type': 'session_control',
                'action': 'list'
            }

            result = self._send_command('', command)

            return {
                'success': True,
                'sessions': result.get('sessions', []),
                'total_count': len(result.get('sessions', []))
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def info(self, session_id: str) -> Dict[str, Any]:
        """获取会话详细信息"""
        try:
            if not self.ws_client.is_connected():
                if not self.ws_client.connect():
                    return {
                        'success': False,
                        'error': 'Failed to connect to WebSocket server'
                    }

            command = {
                'command_type': 'session_control',
                'action': 'info'
            }

            result = self._send_command(session_id, command)

            return {
                'success': True,
                'session_info': result.get('session_info', {}),
                'message': 'Session info retrieved successfully'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def delete(self, session_id: str, force: bool = False) -> Dict[str, Any]:
        """删除会话"""
        try:
            if not self.ws_client.is_connected():
                if not self.ws_client.connect():
                    return {
                        'success': False,
                        'error': 'Failed to connect to WebSocket server'
                    }

            command = {
                'command_type': 'session_control',
                'action': 'delete',
                'force': force
            }

            result = self._send_command(session_id, command)

            return {
                'success': True,
                'session_id': session_id,
                'deleted_at': datetime.utcnow().isoformat(),
                'message': 'Session deleted successfully'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def set_mode(self, session_id: str, mode: str) -> Dict[str, Any]:
        """设置会话模式"""
        try:
            if not self.ws_client.is_connected():
                if not self.ws_client.connect():
                    return {
                        'success': False,
                        'error': 'Failed to connect to WebSocket server'
                    }

            command = {
                'command_type': 'mode_switch',
                'target_mode': mode
            }

            result = self._send_command(session_id, command)

            return {
                'success': True,
                'session_id': session_id,
                'new_mode': mode,
                'changed_at': datetime.utcnow().isoformat(),
                'message': f'Mode changed to {mode}'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """发送WebSocket命令"""
        try:
            response = self.ws_client.send_command(session_id, command)
            return response.get('data', {})
        except Exception as error:
            raise Exception(f"WebSocket command failed: {error}")
