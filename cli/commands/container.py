"""容器操作命令 - 支持ContainerDefV2完整功能"""

import json
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

# 导入容器系统
import sys
import os
sys.path.append(str(Path(__file__).parent.parent.parent))

# 直接导入避免循环依赖
sys.path.append(os.path.join(Path(__file__).parent.parent.parent, 'services'))
from container_registry import (
    get_containers_for_url_v2, save_container_v2, delete_container_v2,
    list_all_sites_v2, get_container_hierarchy_v2, upsert_container_for_url
)

from core.container.models_v2 import (
    ContainerDefV2, OperationType, OperationConfig, SelectorByClass,
    SelectorVariant, RunMode
)
from core.container.executor import ContainerOperationExecutor, ContainerExecutionContext


class ContainerCommands:
    """容器命令处理器 - 支持ContainerDefV2完整功能"""

    def __init__(self, cli_context: Dict[str, Any]):
        self.ws_client = cli_context['ws_client']
        self.executor = ContainerOperationExecutor()

    def match_root(self, session_id: str, url: str) -> Dict[str, Any]:
        """匹配根容器"""
        try:
            # 解析页面信息
            parsed_url = urlparse(url)
            page_context = {
                'url': url,
                'domain': parsed_url.netloc,
                'path': parsed_url.path
            }

            command = {
                'command_type': 'container_operation',
                'action': 'match_root',
                'page_context': page_context
            }

            result = self._send_command(session_id, command)
            matched_data = result.get('data', {}) or {}

            return {
                'success': result.get('success', False),
                'url': url,
                'matched_container': matched_data.get('matched_container'),
                'match_details': matched_data.get('match_details'),
                'message': 'Root container matching completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def discover_children(self, session_id: str, root_selector: Optional[str]) -> Dict[str, Any]:
        """发现子容器"""
        try:
            command = {
                'command_type': 'container_operation',
                'action': 'discover_children',
                'root_selector': root_selector
            }

            result = self._send_command(session_id, command)

            return {
                'success': result.get('success', False),
                'root_selector': root_selector,
                'child_containers': result.get('data', []),
                'message': 'Child container discovery completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def save_container(self, session_id: str, container_name: str, selector: str) -> Dict[str, Any]:
        """保存容器到库"""
        try:
            # 首先获取容器信息
            inspect_result = self._inspect_container(session_id, selector)
            if not inspect_result['success']:
                # 如果无法通过服务器检查元素信息，退化为仅使用传入信息
                container_info = {
                    'page_url': 'https://weibo.com'
                }
            else:
                container_info = inspect_result['container_info']

            # 使用统一注册表保存（自动站点归属 + v2转换）
            page_url = container_info.get('page_url') or 'https://weibo.com'
            site_payload = upsert_container_for_url(
                url=page_url,
                container_id=container_name,
                selector=selector,
                description=container_name,
                parent_id=None,
                actions=None,
                event_key=None,
            )

            return {
                'success': True,
                'container_name': container_name,
                'selector': selector,
                'site': site_payload.get('website'),
                'page_url': page_url,
                'container_info': container_info,
                'message': f'Container "{container_name}" saved to site registry'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def test_container(self, container_file: str) -> Dict[str, Any]:
        """测试容器定义"""
        try:
            container_path = Path(container_file)
            if not container_path.exists():
                return {
                    'success': False,
                    'error': f'Container file not found: {container_file}'
                }

            with open(container_path, 'r', encoding='utf-8') as f:
                container_data = json.load(f)

            # 验证容器定义
            validation_result = self._validate_container_def(container_data)

            return {
                'success': validation_result['valid'],
                'container_file': container_file,
                'validation_result': validation_result,
                'message': 'Container validation completed'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _inspect_container(self, session_id: str, selector: str) -> Dict[str, Any]:
        """检查容器元素"""
        try:
            command = {
                'command_type': 'node_execute',
                'node_type': 'query',
                'parameters': {
                    'selector': selector,
                    'extract_type': 'element_info',
                    'multiple': False
                }
            }

            result = self._send_command(session_id, command)

            if result.get('success', False):
                return {
                    'success': True,
                    'container_info': result.get('data', {}),
                    'message': 'Container inspection completed'
                }
            else:
                return {
                    'success': False,
                    'error': result.get('error', 'Container inspection failed')
                }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _save_to_library(self, container_def: Dict[str, Any]) -> Dict[str, Any]:
        """保存到容器库"""
        try:
            # 确定保存路径
            container_name = container_def['name']
            safe_name = self._sanitize_filename(container_name)
            file_path = Path('container-library') / f"{safe_name}.json"

            # 创建目录
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # 保存容器定义
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(container_def, f, indent=2, ensure_ascii=False)

            return {
                'success': True,
                'file_path': str(file_path),
                'container_name': container_name
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _validate_container_def(self, container_data: Dict[str, Any]) -> Dict[str, Any]:
        """验证容器定义"""
        errors = []
        warnings = []

        # 检查必需字段
        if not container_data.get('name'):
            errors.append('Container name is required')

        if not container_data.get('selector'):
            errors.append('Container selector is required')

        # 检查选择器格式
        selector = container_data.get('selector', '')
        if selector:
            if not any(char in selector for char in ['.', '#', '[', '>', ' ']):
                warnings.append('Selector should include specific identifiers (class, id, attributes)')

        # 检查属性定义
        attributes = container_data.get('attributes', {})
        if isinstance(attributes, dict):
            for key, value in attributes.items():
                if not isinstance(key, str):
                    warnings.append(f'Attribute key should be string: {key}')

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'container_data': container_data
        }

    def _sanitize_filename(self, name: str) -> str:
        """清理文件名"""
        import re
        # 只允许字母、数字、下划线和短横线
        safe_name = re.sub(r'[^A-Za-z0-9_-]', '_', name)
        return safe_name[:100]

    def _send_command(self, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
        """发送WebSocket命令"""
        try:
            response = self.ws_client.send_command(session_id, command)
            return response.get('data', {})
        except Exception as error:
            raise Exception(f"WebSocket command failed: {error}")

    # ===== ContainerDefV2 新功能 =====

    def list_sites(self) -> Dict[str, Any]:
        """列出所有有容器定义的站点"""
        try:
            sites = list_all_sites_v2()
            return {
                'success': True,
                'sites': sites,
                'count': len(sites),
                'message': f'找到 {len(sites)} 个站点'
            }
        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def list_containers(self, url: str) -> Dict[str, Any]:
        """列出指定URL的所有容器（v2格式）"""
        try:
            containers = get_containers_for_url_v2(url)
            container_list = []

            for container_id, container in containers.items():
                container_list.append({
                    'id': container.id,
                    'name': container.name,
                    'type': container.type,
                    'children_count': len(container.children),
                    'operations_count': len(container.operations),
                    'capabilities': container.capabilities,
                    'selectors': [sel.to_dict() for sel in container.selectors]
                })

            return {
                'success': True,
                'url': url,
                'containers': container_list,
                'count': len(container_list),
                'message': f'找到 {len(container_list)} 个容器'
            }
        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def get_container_hierarchy(self, url: str) -> Dict[str, Any]:
        """获取容器的层级关系树"""
        try:
            hierarchy = get_container_hierarchy_v2(url)
            return {
                'success': True,
                'url': url,
                'hierarchy': hierarchy,
                'message': '容器层级关系获取成功'
            }
        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def get_container(self, url: str, container_id: str) -> Dict[str, Any]:
        """获取指定容器的详细信息"""
        try:
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]
            return {
                'success': True,
                'container': container.to_dict(),
                'message': f'容器 {container_id} 获取成功'
            }
        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def create_container_from_element(self, session_id: str, url: str,
                                    element_info: Dict[str, Any],
                                    container_config: Dict[str, Any]) -> Dict[str, Any]:
        """从页面元素创建容器定义"""
        try:
            # 提取元素信息
            selector = element_info.get('selector', '')
            element_classes = element_info.get('classes', [])

            if not element_classes:
                return {
                    'success': False,
                    'error': '元素没有CSS类名，无法创建容器'
                }

            # 生成容器ID和名称
            container_id = container_config.get('id', f"container_{int(time.time())}")
            container_name = container_config.get('name', container_id)

            # 创建选择器
            selector_by_class = SelectorByClass(
                classes=element_classes,
                variant=SelectorVariant.PRIMARY,
                score=1.0
            )

            # 创建容器定义
            container = ContainerDefV2(
                id=container_id,
                name=container_name,
                type=container_config.get('type', 'generic'),
                selectors=[selector_by_class],
                page_patterns=container_config.get('page_patterns', []),
                capabilities=container_config.get('capabilities', []),
                run_mode=RunMode.SEQUENTIAL
            )

            # 添加操作
            operations = container_config.get('operations', [])
            for op_config in operations:
                op_type = OperationType(op_config.get('type', 'find-child'))
                op_params = op_config.get('config', {})
                container.add_operation(op_type, op_params)

            # 保存容器
            site_key = self._get_site_key_from_url(url)
            if save_container_v2(site_key, container):
                return {
                    'success': True,
                    'container_id': container_id,
                    'container': container.to_dict(),
                    'site_key': site_key,
                    'message': f'容器 {container_id} 创建成功'
                }
            else:
                return {
                    'success': False,
                    'error': '保存容器失败'
                }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def update_container(self, url: str, container_id: str,
                        updates: Dict[str, Any]) -> Dict[str, Any]:
        """更新容器定义"""
        try:
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]

            # 应用更新
            if 'name' in updates:
                container.name = updates['name']
            if 'type' in updates:
                container.type = updates['type']
            if 'capabilities' in updates:
                container.capabilities = updates['capabilities']
            if 'children' in updates:
                container.children = updates['children']
            if 'operations' in updates:
                container.operations = []
                for op_config in updates['operations']:
                    op_type = OperationType(op_config.get('type', 'find-child'))
                    op_params = op_config.get('config', {})
                    container.add_operation(op_type, op_params)

            # 保存更新
            site_key = self._get_site_key_from_url(url)
            if save_container_v2(site_key, container):
                return {
                    'success': True,
                    'container_id': container_id,
                    'container': container.to_dict(),
                    'message': f'容器 {container_id} 更新成功'
                }
            else:
                return {
                    'success': False,
                    'error': '保存容器更新失败'
                }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def delete_container(self, url: str, container_id: str) -> Dict[str, Any]:
        """删除容器定义"""
        try:
            site_key = self._get_site_key_from_url(url)
            if delete_container_v2(site_key, container_id):
                return {
                    'success': True,
                    'container_id': container_id,
                    'message': f'容器 {container_id} 删除成功'
                }
            else:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在或删除失败'
                }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    async def run_container(self, session_id: str, url: str,
                          container_id: str) -> Dict[str, Any]:
        """运行容器的操作序列"""
        try:
            # 获取容器定义
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]

            # 获取浏览器会话（这里需要实际的浏览器会话）
            browser_session = await self._get_browser_session(session_id)
            if not browser_session:
                return {
                    'success': False,
                    'error': '无法获取浏览器会话'
                }

            # 创建执行上下文
            context = ContainerExecutionContext(
                session_id=session_id,
                browser_session=browser_session,
                page_url=url,
                container_library=containers,
                anti_detection_enabled=True,
                debug_mode=True
            )

            # 执行容器操作
            result = await self.executor.execute_container(container, context)

            return {
                'success': result.success,
                'container_id': container_id,
                'execution_time': result.execution_time,
                'results': result.results,
                'errors': result.errors,
                'message': f'容器 {container_id} 执行完成' if result.success else f'容器 {container_id} 执行失败'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    async def highlight_container(self, session_id: str, url: str,
                                 container_id: str, duration: int = 3000) -> Dict[str, Any]:
        """高亮显示容器元素"""
        try:
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]
            primary_selector = container.get_primary_selector()
            if not primary_selector:
                return {
                    'success': False,
                    'error': '容器没有定义选择器'
                }

            # 构建CSS选择器
            css_selector = "." + ".".join(primary_selector.classes)

            # 执行高亮操作
            browser_session = await self._get_browser_session(session_id)
            if not browser_session:
                return {
                    'success': False,
                    'error': '无法获取浏览器会话'
                }

            # 注入高亮脚本
            highlight_script = f"""
            (selector, duration) => {{
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {{
                    const originalStyle = element.style.border;
                    const originalBg = element.style.backgroundColor;
                    element.style.border = '2px solid #ff0000';
                    element.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

                    setTimeout(() => {{
                        element.style.border = originalStyle;
                        element.style.backgroundColor = originalBg;
                    }}, duration);
                }});
                return elements.length;
            }}
            """

            result = await browser_session.evaluate(highlight_script, css_selector, duration)

            return {
                'success': True,
                'container_id': container_id,
                'selector': css_selector,
                'highlighted_elements': result,
                'duration': duration,
                'message': f'容器 {container_id} 已高亮显示'
            }

        except Exception as error:
            return {
                'success': False,
                'error': str(error)
            }

    def _get_site_key_from_url(self, url: str) -> str:
        """从URL获取站点key"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.lower()

            # 简单的域名到key映射
            if 'weibo.com' in domain:
                return 'weibo'
            elif '1688.com' in domain:
                return 'cbu'
            else:
                return domain.replace('.', '_')
        except:
            return 'unknown'

    async def _get_browser_session(self, session_id: str):
        """获取浏览器会话（需要实际实现）"""
        # 这里需要与实际的浏览器会话管理器集成
        # 暂时返回None，实际使用时需要实现
        return None
