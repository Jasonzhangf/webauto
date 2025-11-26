#!/usr/bin/env python3
"""
容器管理器 - 管理容器的编辑、层级关系和操作执行
"""

import asyncio
import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

# 导入容器系统
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from core.container.models_v2 import (
    ContainerDefV2, OperationType, OperationConfig, SelectorByClass,
    SelectorVariant, RunMode
)
from services.container_registry import (
    get_containers_for_url_v2, save_container_v2, delete_container_v2,
    get_container_hierarchy_v2
)
from core.container.executor import ContainerOperationExecutor, ContainerExecutionContext


@dataclass
class ContainerEditRequest:
    """容器编辑请求"""
    session_id: str
    url: str
    container_id: str
    updates: Dict[str, Any]
    validate_before_save: bool = True


@dataclass
class ContainerEditResult:
    """容器编辑结果"""
    success: bool
    container_id: str
    old_container_def: Optional[ContainerDefV2] = None
    new_container_def: Optional[ContainerDefV2] = None
    changes_made: List[str] = None
    validation_warnings: List[str] = None
    errors: List[str] = None

    def __post_init__(self):
        if self.changes_made is None:
            self.changes_made = []
        if self.validation_warnings is None:
            self.validation_warnings = []
        if self.errors is None:
            self.errors = []


@dataclass
class ContainerHierarchyNode:
    """容器层级节点"""
    container_id: str
    name: str
    type: str
    capabilities: List[str]
    operations_count: int
    children_count: int
    children: List['ContainerHierarchyNode'] = None
    parent_id: Optional[str] = None
    depth: int = 0
    is_leaf: bool = False

    def __post_init__(self):
        if self.children is None:
            self.children = []


class ContainerManager:
    """容器管理器"""

    def __init__(self):
        self.executor = ContainerOperationExecutor()
        self.browser_session = None

    async def initialize(self, browser_session: Any):
        """初始化管理器"""
        self.browser_session = browser_session

    async def edit_container(self, request: ContainerEditRequest) -> ContainerEditResult:
        """编辑容器定义"""
        result = ContainerEditResult(success=False, container_id=request.container_id)

        try:
            # 获取现有容器定义
            containers = get_containers_for_url_v2(request.url)
            if request.container_id not in containers:
                result.errors.append(f"容器 {request.container_id} 不存在")
                return result

            old_container = containers[request.container_id]
            result.old_container_def = old_container

            # 创建新容器定义（深拷贝）
            new_container = ContainerDefV2.from_dict(old_container.to_dict())
            result.new_container_def = new_container

            # 应用更新
            changes_made = []
            for field, value in request.updates.items():
                if hasattr(new_container, field):
                    old_value = getattr(new_container, field)
                    setattr(new_container, field, value)
                    changes_made.append(f"更新 {field}: {old_value} -> {value}")
                elif field == 'operations':
                    # 特殊处理operations
                    new_container.operations = []
                    for op_config in value:
                        op_type = OperationType(op_config.get('type', 'find-child'))
                        op_params = op_config.get('config', {})
                        new_container.add_operation(op_type, op_params)
                    changes_made.append(f"更新 operations: {len(value)} 个操作")

            result.changes_made = changes_made

            # 验证更新后的容器
            if request.validate_before_save:
                validation_result = self._validate_container_def(new_container)
                if not validation_result['valid']:
                    result.errors.extend(validation_result['errors'])
                    return result
                result.validation_warnings.extend(validation_result['warnings'])

            # 保存更新后的容器
            if await self._save_container(request.url, new_container):
                result.success = True
            else:
                result.errors.append("保存容器失败")

        except Exception as e:
            result.errors.append(f"编辑容器时发生异常: {str(e)}")

        return result

    async def delete_container(self, session_id: str, url: str,
                              container_id: str, confirm: bool = False) -> Dict[str, Any]:
        """删除容器"""
        try:
            # 获取容器信息用于确认
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]

            # 检查是否有子容器
            has_children = len(container.children) > 0
            if has_children and not confirm:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 有 {len(container.children)} 个子容器，需要确认删除',
                    'children': container.children,
                    'requires_confirmation': True
                }

            # 执行删除
            site_key = self._get_site_key_from_url(url)
            if delete_container_v2(site_key, container_id):
                # 从父容器中移除引用
                await self._remove_from_parent_containers(url, container_id)

                return {
                    'success': True,
                    'container_id': container_id,
                    'deleted_children': container.children if has_children else [],
                    'message': f'容器 {container_id} 删除成功'
                }
            else:
                return {
                    'success': False,
                    'error': f'删除容器 {container_id} 失败'
                }

        except Exception as e:
            return {
                'success': False,
                'error': f'删除容器时发生异常: {str(e)}'
            }

    async def get_container_tree(self, url: str) -> Dict[str, Any]:
        """获取容器树结构"""
        try:
            containers = get_containers_for_url_v2(url)
            hierarchy = get_container_hierarchy_v2(url)

            # 构建树形结构
            root_nodes = []
            node_map = {}

            # 首先创建所有节点
            for container_id, container in containers.items():
                node = ContainerHierarchyNode(
                    container_id=container_id,
                    name=container.name or container_id,
                    type=container.type or 'unknown',
                    capabilities=container.capabilities,
                    operations_count=len(container.operations),
                    children_count=len(container.children),
                    children=[],
                    depth=0,
                    is_leaf=len(container.children) == 0
                )
                node_map[container_id] = node

            # 构建父子关系
            for container_id, container in containers.items():
                if container_id in node_map:
                    node = node_map[container_id]

                    # 查找父容器
                    parent_id = self._find_parent_container(container_id, containers)
                    if parent_id and parent_id in node_map:
                        parent_node = node_map[parent_id]
                        parent_node.children.append(node)
                        node.parent_id = parent_id
                        node.depth = parent_node.depth + 1
                    else:
                        # 根节点
                        root_nodes.append(node)

            # 生成树形数据
            def node_to_dict(node: ContainerHierarchyNode) -> Dict[str, Any]:
                return {
                    'container_id': node.container_id,
                    'name': node.name,
                    'type': node.type,
                    'capabilities': node.capabilities,
                    'operations_count': node.operations_count,
                    'children_count': node.children_count,
                    'depth': node.depth,
                    'is_leaf': node.is_leaf,
                    'parent_id': node.parent_id,
                    'children': [node_to_dict(child) for child in node.children]
                }

            tree_data = [node_to_dict(node) for node in root_nodes]

            return {
                'success': True,
                'url': url,
                'tree': tree_data,
                'total_containers': len(containers),
                'root_containers': len(root_nodes),
                'max_depth': max((node.depth for node in node_map.values()), default=0)
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'获取容器树失败: {str(e)}'
            }

    async def execute_container_operations(self, session_id: str, url: str,
                                          container_id: str, operations_subset: List[int] = None) -> Dict[str, Any]:
        """执行容器的操作序列"""
        try:
            # 获取容器定义
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]

            # 如果指定了操作子集，创建临时容器
            if operations_subset is not None:
                temp_container = ContainerDefV2.from_dict(container.to_dict())
                temp_container.operations = [
                    temp_container.operations[i]
                    for i in operations_subset
                    if 0 <= i < len(temp_container.operations)
                ]
                container = temp_container

            # 创建执行上下文
            context = ContainerExecutionContext(
                session_id=session_id,
                browser_session=self.browser_session,
                page_url=url,
                container_library=containers,
                anti_detection_enabled=True,
                debug_mode=True
            )

            # 执行容器操作
            execution_result = await self.executor.execute_container(container, context)

            return {
                'success': execution_result.success,
                'container_id': container_id,
                'execution_time': execution_result.execution_time,
                'operations_executed': len(container.operations),
                'results': execution_result.results,
                'errors': execution_result.errors,
                'message': '容器执行成功' if execution_result.success else '容器执行失败'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'执行容器操作时发生异常: {str(e)}'
            }

    async def highlight_container(self, session_id: str, url: str,
                                  container_id: str, duration: int = 3000) -> Dict[str, Any]:
        """高亮显示容器"""
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

            # 执行高亮脚本
            highlight_script = f"""
            (selector, duration, sessionId) => {{
                const elements = document.querySelectorAll(selector);
                const highlightColor = '#ff0000';
                const bgColor = 'rgba(255, 0, 0, 0.1)';

                elements.forEach((element, index) => {{
                    const originalStyle = element.style.cssText;
                    const originalZIndex = element.style.zIndex;
                    const originalPosition = element.style.position;

                    // 设置高亮样式
                    element.style.border = '2px solid ' + highlightColor;
                    element.style.backgroundColor = bgColor;
                    element.style.boxShadow = '0 0 10px ' + highlightColor;
                    element.style.zIndex = '9999';
                    element.style.position = element.style.position || 'relative';

                    // 添加容器标识
                    const label = document.createElement('div');
                    label.textContent = 'Container: {containerId}';
                    label.style.cssText = `
                        position: absolute;
                        top: -25px;
                        left: 0;
                        background: {highlightColor};
                        color: white;
                        padding: 2px 6px;
                        font-size: 12px;
                        border-radius: 3px;
                        z-index: 10000;
                        font-family: monospace;
                        pointer-events: none;
                    `;
                    element.style.position = 'relative';
                    element.appendChild(label);

                    // 定时恢复
                    setTimeout(() => {{
                        element.style.cssText = originalStyle;
                        element.removeChild(label);
                    }}, duration);
                }});

                return {{
                    elementCount: elements.length,
                    sessionId: sessionId,
                    containerId: '{container_id}',
                    selector: selector,
                    duration: duration
                }};
            }}
            """

            result = await self.browser_session.evaluate(highlight_script, css_selector, duration, session_id)

            return {
                'success': True,
                'container_id': container_id,
                'selector': css_selector,
                'highlighted_elements': result['elementCount'],
                'duration': duration,
                'message': f'容器 {container_id} 已高亮显示 {result["elementCount"]} 个元素'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'高亮容器时发生异常: {str(e)}'
            }

    async def get_container_execution_history(self, url: str, limit: int = 50) -> Dict[str, Any]:
        """获取容器执行历史"""
        try:
            history = self.executor.get_execution_history(limit)

            # 过滤相关URL的执行历史
            filtered_history = [
                h for h in history
                if h.metadata.get('page_url') == url
            ]

            return {
                'success': True,
                'url': url,
                'history': [
                    {
                        'container_id': h.container_id,
                        'success': h.success,
                        'execution_time': h.execution_time,
                        'operations_count': len(h.results),
                        'errors_count': len(h.errors),
                        'timestamp': h.metadata.get('executed_at'),
                        'results': h.results,
                        'errors': h.errors
                    }
                    for h in filtered_history
                ],
                'total_executions': len(filtered_history),
                'success_rate': (
                    sum(1 for h in filtered_history if h.success) / len(filtered_history)
                    if filtered_history else 0
                )
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'获取执行历史失败: {str(e)}'
            }

    def _validate_container_def(self, container_def: ContainerDefV2) -> Dict[str, Any]:
        """验证容器定义"""
        errors = []
        warnings = []

        # 检查必需字段
        if not container_def.id:
            errors.append("容器ID是必需的")

        if not container_def.selectors:
            errors.append("选择器是必需的")

        # 检查选择器格式
        for i, selector in enumerate(container_def.selectors):
            if not selector.classes:
                errors.append(f"选择器 {i+1} 必须包含CSS类")
            if not selector.classes:
                warnings.append(f"选择器 {i+1} 没有CSS类，可能不稳定")

        # 检查操作类型
        valid_operations = [op.value for op in OperationType]
        for i, operation in enumerate(container_def.operations):
            if operation.type.value not in valid_operations:
                warnings.append(f"操作 {i+1} 使用了未知的类型: {operation.type.value}")

        # 检查循环引用
        if container_def.children:
            for child_id in container_def.children:
                if child_id == container_def.id:
                    errors.append(f"容器不能引用自身作为子容器: {child_id}")

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    async def _save_container(self, url: str, container_def: ContainerDefV2) -> bool:
        """保存容器"""
        try:
            return save_container_v2(self._get_site_key_from_url(url), container_def)
        except Exception as e:
            print(f"保存容器失败: {e}")
            return False

    async def _remove_from_parent_containers(self, url: str, container_id: str):
        """从父容器中移除引用"""
        try:
            containers = get_containers_for_url_v2(url)

            for parent_container in containers.values():
                if container_id in parent_container.children:
                    parent_container.children.remove(container_id)
                    await self._save_container(url, parent_container)

        except Exception as e:
            print(f"从父容器移除引用失败: {e}")

    def _find_parent_container(self, container_id: str, containers: Dict[str, ContainerDefV2]) -> Optional[str]:
        """查找父容器"""
        for potential_parent_id, potential_parent in containers.items():
            if container_id in potential_parent.children:
                return potential_parent_id
        return None

    def _get_site_key_from_url(self, url: str) -> str:
        """从URL获取站点key"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.lower()

            if 'weibo.com' in domain:
                return 'weibo'
            elif '1688.com' in domain:
                return 'cbu'
            else:
                return domain.replace('.', '_')
        except:
            return 'unknown'