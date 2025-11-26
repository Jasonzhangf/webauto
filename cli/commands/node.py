"""Node执行命令"""

import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path


class NodeCommands:
    """Node命令处理器"""

    def __init__(self, cli_context: Dict[str, Any]):
        self.ws_client = cli_context['ws_client']

    def execute(self, session_id: str, node_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """执行单个Node"""
        try:
            command = {
                'command_type': 'node_execute',
                'node_type': node_type,
                'parameters': parameters,
                'timestamp': datetime.utcnow().isoformat()
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'node_type': node_type,
                'parameters': parameters,
                'result': result.get('data', {}),
                'execution_time': result.get('execution_time', 0),
                'message': 'Node execution completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def batch(self, session_id: str, workflow_file: str) -> Dict[str, Any]:
        """批量执行Node（从文件）"""
        try:
            # 读取工作流文件
            workflow_path = Path(workflow_file)
            if not workflow_path.exists():
                return {
                    'success': False,
                    'error': f'Workflow file not found: {workflow_file}'
                }

            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)

            # 验证工作流格式
            if not isinstance(workflow, dict) or 'nodes' not in workflow:
                return {
                    'success': False,
                    'error': 'Invalid workflow format. Expected {"nodes": [...]}'
                }

            nodes = workflow['nodes']
            if not isinstance(nodes, list):
                return {
                    'success': False,
                    'error': 'Workflow nodes must be an array'
                }

            # 执行工作流
            results = []
            total_time = 0
            successful_nodes = 0
            failed_nodes = 0

            for i, node_def in enumerate(nodes):
                if not isinstance(node_def, dict) or 'type' not in node_def:
                    results.append({
                        'step': i + 1,
                        'success': False,
                        'error': 'Invalid node definition'
                    })
                    failed_nodes += 1
                    continue

                node_type = node_def['type']
                parameters = node_def.get('parameters', {})

                # 执行Node
                start_time = datetime.utcnow()
                node_result = self.execute(session_id, node_type, parameters)
                end_time = datetime.utcnow()
                execution_time = (end_time - start_time).total_seconds()

                step_result = {
                    'step': i + 1,
                    'node_type': node_type,
                    'parameters': parameters,
                    'success': node_result['success'],
                    'execution_time': execution_time,
                    'result': node_result.get('result'),
                    'error': node_result.get('error')
                }

                results.append(step_result)
                total_time += execution_time

                if node_result['success']:
                    successful_nodes += 1
                else:
                    failed_nodes += 1

                    # 如果节点标记为required且失败，停止执行
                    if node_def.get('required', True):
                        break

            return {
                'success': failed_nodes == 0,
                'workflow_file': workflow_file,
                'total_nodes': len(nodes),
                'successful_nodes': successful_nodes,
                'failed_nodes': failed_nodes,
                'total_execution_time': total_time,
                'results': results,
                'message': f'Workflow completed: {successful_nodes}/{len(nodes)} nodes successful'
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
