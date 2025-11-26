"""工作流管理命令"""

import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path


class WorkflowCommands:
    """工作流命令处理器"""

    def __init__(self, cli_context: Dict[str, Any]):
        self.ws_client = cli_context['ws_client']

    def run(self, session_id: str, workflow_file: str) -> Dict[str, Any]:
        """运行工作流"""
        try:
            # 验证工作流文件
            workflow_path = Path(workflow_file)
            if not workflow_path.exists():
                return {
                    'success': False,
                    'error': f'Workflow file not found: {workflow_file}'
                }

            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)

            # 验证工作流结构
            validation_result = self._validate_workflow(workflow)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': f'Invalid workflow: {", ".join(validation_result["errors"])}'
                }

            # 运行工作流
            if not self.ws_client.is_connected():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'workflow_run',
                'workflow': workflow,
                'workflow_file': workflow_file,
                'timestamp': datetime.utcnow().isoformat()
            }

            result = self._send_command(session_id, command)

            workflow_result = result.get('data', {})

            return {
                'success': workflow_result.get('success', False),
                'workflow_file': workflow_file,
                'total_steps': workflow_result.get('total_steps', 0),
                'successful_steps': workflow_result.get('successful_steps', 0),
                'failed_steps': workflow_result.get('failed_steps', 0),
                'execution_time': workflow_result.get('execution_time', 0),
                'results': workflow_result.get('results', []),
                'message': 'Workflow execution completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def record(self, session_id: str, output_file: str) -> Dict[str, Any]:
        """录制用户操作为工作流"""
        try:
            if not self.ws_client.is_connected():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            # 启动录制
            command = {
                'command_type': 'workflow_record',
                'action': 'start',
                'output_file': output_file
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'session_id': session_id,
                'output_file': output_file,
                'recording_id': result.get('data', {}).get('recording_id'),
                'message': 'Workflow recording started'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def stop_recording(self, session_id: str) -> Dict[str, Any]:
        """停止录制"""
        try:
            if not self.ws_client.is_connected():
                return {
                    'success': False,
                    'error': 'Not connected to WebSocket server'
                }

            command = {
                'command_type': 'workflow_record',
                'action': 'stop'
            }

            result = self._send_command(session_id, command)

            recording_data = result.get('data', {})

            return {
                'success': result.get('success', False),
                'session_id': session_id,
                'recorded_steps': recording_data.get('recorded_steps', 0),
                'output_file': recording_data.get('output_file'),
                'recording_time': recording_data.get('recording_time', 0),
                'message': 'Workflow recording stopped'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def validate(self, workflow_file: str) -> Dict[str, Any]:
        """验证工作流定义"""
        try:
            workflow_path = Path(workflow_file)
            if not workflow_path.exists():
                return {
                    'success': False,
                    'error': f'Workflow file not found: {workflow_file}'
                }

            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)

            validation_result = self._validate_workflow(workflow)

            return {
                'success': validation_result['valid'],
                'workflow_file': workflow_file,
                'validation_result': validation_result,
                'message': 'Workflow validation completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _validate_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """验证工作流结构"""
        errors = []
        warnings = []

        # 检查必需字段
        if 'name' not in workflow:
            errors.append('Workflow name is required')

        if 'nodes' not in workflow:
            errors.append('Workflow nodes array is required')

        nodes = workflow.get('nodes', [])
        if not isinstance(nodes, list):
            errors.append('Workflow nodes must be an array')

        # 验证每个节点
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                errors.append(f'Node {i+1} must be an object')
                continue

            if 'type' not in node:
                errors.append(f'Node {i+1} missing required field: type')
                continue

            node_type = node['type']
            if not node_type:
                errors.append(f'Node {i+1} type cannot be empty')
                continue

            # 验证参数
            parameters = node.get('parameters', {})
            if not isinstance(parameters, dict):
                errors.append(f'Node {i+1} parameters must be an object')

            # 检查必需的节点类型特定参数
            if node_type == 'navigate':
                if 'url' not in parameters:
                    errors.append(f'Node {i+1} (navigate) missing required parameter: url')
            elif not parameters['url']:
                errors.append(f'Node {i+1} (navigate) url cannot be empty')

            elif node_type == 'click':
                if 'selector' not in parameters:
                    errors.append(f'Node {i+1} (click) missing required parameter: selector')

            elif node_type == 'input':
                if 'selector' not in parameters or 'value' not in parameters:
                    errors.append(f'Node {i+1} (input) missing required parameters: selector and value')

        # 检查可选配置
        if 'timeout' in workflow:
            timeout = workflow['timeout']
            if not isinstance(timeout, (int, float)) or timeout <= 0:
                warnings.append('Workflow timeout should be a positive number')

        if 'retry_count' in workflow:
            retry_count = workflow['retry_count']
            if not isinstance(retry_count, int) or retry_count < 0:
                warnings.append('Workflow retry_count should be a non-negative integer')

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'node_count': len(nodes),
            'workflow_data': workflow
        }

    def _send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """发送WebSocket命令"""
        try:
            response = self.ws_client.send_command(session_id, command)
            return response.get('data', {})
        except Exception as error:
            raise Exception(f"WebSocket command failed: {error}")
