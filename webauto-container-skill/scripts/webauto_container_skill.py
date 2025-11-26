#!/usr/bin/env python3
"""
WebAuto Container Skill 主要实现
集成DOM分析、容器创建、编辑和操作执行功能
"""

import asyncio
import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

# 导入容器系统和脚本
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from core.container.models_v2 import ContainerDefV2
from services.container_registry import get_containers_for_url_v2
from scripts.element_analyzer import DOMElementAnalyzer, ElementInfo
from scripts.container_creator import ContainerCreator, ContainerCreationRequest
from scripts.container_manager import ContainerManager, ContainerEditRequest


@dataclass
class SkillRequest:
    """Skill请求"""
    session_id: str
    url: str
    action: str
    parameters: Dict[str, Any]
    browser_session: Any = None


@dataclass
class SkillResponse:
    """Skill响应"""
    success: bool
    action: str
    result: Any = None
    message: str = ""
    data: Dict[str, Any] = None
    errors: List[str] = None
    next_actions: List[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.next_actions is None:
            self.next_actions = []
        if self.data is None:
            self.data = {}


class WebAutoContainerSkill:
    """WebAuto容器技能"""

    def __init__(self):
        self.element_analyzer = DOMElementAnalyzer()
        self.container_creator = ContainerCreator()
        self.container_manager = ContainerManager()
        self.browser_session = None
        self.session_id = None
        self.current_url = None

    async def initialize(self, session_id: str, url: str, browser_session: Any):
        """初始化技能"""
        self.session_id = session_id
        self.current_url = url
        self.browser_session = browser_session

        await self.element_analyzer.initialize(browser_session, session_id, url)
        await self.container_creator.initialize(browser_session)
        await self.container_manager.initialize(browser_session)

    async def process_request(self, request: SkillRequest) -> SkillResponse:
        """处理技能请求"""
        try:
            # 更新会话状态
            if request.browser_session:
                self.browser_session = request.browser_session
            self.session_id = request.session_id
            self.current_url = request.url

            # 分发到对应的处理器
            if request.action == "analyze_element":
                return await self._handle_analyze_element(request)
            elif request.action == "create_container":
                return await self._handle_create_container(request)
            elif request.action == "edit_container":
                return await self._handle_edit_container(request)
            elif request.action == "delete_container":
                return await self._handle_delete_container(request)
            elif request.action == "list_containers":
                return await self._handle_list_containers(request)
            elif request.action == "get_container_tree":
                return await self._handle_get_container_tree(request)
            elif request.action == "run_container":
                return await self._handle_run_container(request)
            elif request.action == "highlight_container":
                return await self._handle_highlight_container(request)
            elif request.action == "interactive_create":
                return await self._handle_interactive_create(request)
            elif request.action == "preview_operations":
                return await self._handle_preview_operations(request)
            elif request.action == "get_execution_history":
                return await self._handle_get_execution_history(request)
            elif request.action == "smart_suggest":
                return await self._handle_smart_suggest(request)
            else:
                return SkillResponse(
                    success=False,
                    action=request.action,
                    errors=[f"不支持的操作: {request.action}"]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action=request.action,
                errors=[f"处理请求时发生异常: {str(e)}"]
            )

    async def _handle_analyze_element(self, request: SkillRequest) -> SkillResponse:
        """处理元素分析请求"""
        try:
            element_selector = request.parameters.get('selector')
            element_coordinates = request.parameters.get('coordinates')

            if not element_selector and not element_coordinates:
                return SkillResponse(
                    success=False,
                    action="analyze_element",
                    errors=["必须提供selector或coordinates参数"]
                )

            # 分析元素
            if element_selector:
                element_info = await self.element_analyzer.analyze_element_by_selector(element_selector)
            else:
                x, y = element_coordinates
                element_info = await self.element_analyzer.analyze_element_by_coordinates(x, y)

            if not element_info:
                return SkillResponse(
                    success=False,
                    action="analyze_element",
                    errors=["未找到目标元素"]
                )

            # 获取建议的操作
            suggested_operations = await self.element_analyzer.suggest_container_operations(element_info)
            operation_descriptions = []
            for op in suggested_operations:
                op_desc = self._describe_operation(op)
                operation_descriptions.append(op_desc)

            # 查找最佳父容器
            best_parent = await self.element_analyzer.find_best_parent_container(element_info)

            return SkillResponse(
                success=True,
                action="analyze_element",
                result={
                    'element_info': {
                        'id': element_info.element_id,
                        'tag_name': element_info.tag_name,
                        'css_classes': element_info.css_classes,
                        'attributes': element_info.attributes,
                        'text_content': element_info.text_content[:100],
                        'is_visible': element_info.is_visible,
                        'is_clickable': element_info.is_clickable,
                        'is_inputtable': element_info.is_inputtable,
                        'position': element_info.position,
                        'size': element_info.size
                    },
                    'suggested_operations': [op.to_dict() for op in suggested_operations],
                    'operation_descriptions': operation_descriptions,
                    'best_parent_container': best_parent,
                    'can_create_container': len(element_info.css_classes) > 0
                },
                message=f"成功分析元素: {element_info.tag_name}.{element_info.css_classes}"
            )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="analyze_element",
                errors=[f"分析元素失败: {str(e)}"]
            )

    async def _handle_create_container(self, request: SkillRequest) -> SkillResponse:
        """处理容器创建请求"""
        try:
            element_selector = request.parameters.get('selector')
            element_coordinates = request.parameters.get('coordinates')
            container_config = request.parameters.get('config', {})

            # 创建创建请求
            creation_request = ContainerCreationRequest(
                session_id=self.session_id,
                url=self.current_url,
                element_selector=element_selector,
                element_coordinates=tuple(element_coordinates) if element_coordinates else None,
                container_config=container_config,
                auto_find_parent=True,
                validate_before_save=True
            )

            # 执行创建
            creation_result = await self.container_creator.create_container_from_request(creation_request)

            if creation_result.success:
                return SkillResponse(
                    success=True,
                    action="create_container",
                    result={
                        'container_id': creation_result.container_id,
                        'container_def': creation_result.container_def.to_dict() if creation_result.container_def else None,
                        'parent_container_id': creation_result.parent_container_id,
                        'element_info': {
                            'tag_name': creation_result.element_info.tag_name if creation_result.element_info else None,
                            'css_classes': creation_result.element_info.css_classes if creation_result.element_info else None
                        }
                    },
                    message=f"成功创建容器: {creation_result.container_id}",
                    data={
                        'messages': creation_result.messages,
                        'metadata': creation_result.metadata
                    },
                    next_actions=[
                        "highlight_container",
                        "run_container",
                        "edit_container"
                    ]
                )
            else:
                return SkillResponse(
                    success=False,
                    action="create_container",
                    errors=creation_result.errors,
                    message="容器创建失败"
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="create_container",
                errors=[f"创建容器失败: {str(e)}"]
            )

    async def _handle_interactive_create(self, request: SkillRequest) -> SkillResponse:
        """处理交互式容器创建"""
        try:
            user_instructions = request.parameters.get('instructions', '')

            if not user_instructions:
                return SkillResponse(
                    success=False,
                    action="interactive_create",
                    errors=["缺少用户指令参数"]
                )

            creation_result = await self.container_creator.create_interactive_container(
                self.session_id, self.current_url, user_instructions
            )

            if creation_result.success:
                return SkillResponse(
                    success=True,
                    action="interactive_create",
                    result={
                        'container_id': creation_result.container_id,
                        'container_def': creation_result.container_def.to_dict() if creation_result.container_def else None,
                        'parent_container_id': creation_result.parent_container_id
                    },
                    message=f"根据指令成功创建容器: {creation_result.container_id}",
                    next_actions=[
                        "highlight_container",
                        "run_container",
                        "edit_container"
                    ]
                )
            else:
                return SkillResponse(
                    success=False,
                    action="interactive_create",
                    errors=creation_result.errors
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="interactive_create",
                errors=[f"交互式创建失败: {str(e)}"]
            )

    async def _handle_edit_container(self, request: SkillRequest) -> SkillResponse:
        """处理容器编辑请求"""
        try:
            container_id = request.parameters.get('container_id')
            updates = request.parameters.get('updates', {})

            if not container_id:
                return SkillResponse(
                    success=False,
                    action="edit_container",
                    errors=["缺少container_id参数"]
                )

            if not updates:
                return SkillResponse(
                    success=False,
                    action="edit_container",
                    errors=["缺少updates参数"]
                )

            edit_request = ContainerEditRequest(
                session_id=self.session_id,
                url=self.current_url,
                container_id=container_id,
                updates=updates,
                validate_before_save=True
            )

            edit_result = await self.container_manager.edit_container(edit_request)

            if edit_result.success:
                return SkillResponse(
                    success=True,
                    action="edit_container",
                    result={
                        'container_id': edit_result.container_id,
                        'changes_made': edit_result.changes_made,
                        'old_container': edit_result.old_container_def.to_dict() if edit_result.old_container_def else None,
                        'new_container': edit_result.new_container_def.to_dict() if edit_result.new_container_def else None
                    },
                    message=f"成功编辑容器: {edit_result.container_id}",
                    data={
                        'validation_warnings': edit_result.validation_warnings
                    }
                )
            else:
                return SkillResponse(
                    success=False,
                    action="edit_container",
                    errors=edit_result.errors
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="edit_container",
                errors=[f"编辑容器失败: {str(e)}"]
            )

    async def _handle_delete_container(self, request: SkillRequest) -> SkillResponse:
        """处理容器删除请求"""
        try:
            container_id = request.parameters.get('container_id')
            confirm = request.parameters.get('confirm', False)

            if not container_id:
                return SkillResponse(
                    success=False,
                    action="delete_container",
                    errors=["缺少container_id参数"]
                )

            delete_result = await self.container_manager.delete_container(
                self.session_id, self.current_url, container_id, confirm
            )

            if delete_result['success']:
                next_actions = []
                if delete_result.get('deleted_children'):
                    next_actions.append("清理子容器")

                return SkillResponse(
                    success=True,
                    action="delete_container",
                    result={
                        'container_id': container_id,
                        'deleted_children': delete_result.get('deleted_children', [])
                    },
                    message=delete_result['message'],
                    next_actions=next_actions
                )
            else:
                if delete_result.get('requires_confirmation'):
                    return SkillResponse(
                        success=False,
                        action="delete_container",
                        message=delete_result['error'],
                        data={
                            'children': delete_result.get('children', []),
                            'requires_confirmation': True
                        },
                        next_actions=["confirm_delete"]
                    )
                else:
                    return SkillResponse(
                        success=False,
                        action="delete_container",
                        errors=[delete_result['error']]
                    )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="delete_container",
                errors=[f"删除容器失败: {str(e)}"]
            )

    async def _handle_list_containers(self, request: SkillResponse) -> SkillResponse:
        """处理容器列表请求"""
        try:
            containers = get_containers_for_url_v2(self.current_url)

            container_list = []
            for container_id, container in containers.items():
                container_list.append({
                    'id': container_id,
                    'name': container.name,
                    'type': container.type,
                    'capabilities': container.capabilities,
                    'operations_count': len(container.operations),
                    'children_count': len(container.children),
                    'selectors': [sel.to_dict() for sel in container.selectors],
                    'has_operations': len(container.operations) > 0
                })

            return SkillResponse(
                success=True,
                action="list_containers",
                result={
                    'containers': container_list,
                    'total_count': len(container_list),
                    'url': self.current_url
                },
                message=f"找到 {len(container_list)} 个容器",
                next_actions=["get_container_tree"] if container_list else ["create_container"]
            )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="list_containers",
                errors=[f"列出容器失败: {str(e)}"]
            )

    async def _handle_get_container_tree(self, request: SkillRequest) -> SkillResponse:
        """处理获取容器树请求"""
        try:
            tree_result = await self.container_manager.get_container_tree(self.current_url)

            if tree_result['success']:
                return SkillResponse(
                    success=True,
                    action="get_container_tree",
                    result=tree_result,
                    message=tree_result.get('message', '容器树获取成功')
                )
            else:
                return SkillResponse(
                    success=False,
                    action="get_container_tree",
                    errors=[tree_result['error']]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="get_container_tree",
                errors=[f"获取容器树失败: {str(e)}"]
            )

    async def _handle_run_container(self, request: SkillRequest) -> SkillResponse:
        """处理运行容器请求"""
        try:
            container_id = request.parameters.get('container_id')
            operations_subset = request.parameters.get('operations_subset')

            if not container_id:
                return SkillResponse(
                    success=False,
                    action="run_container",
                    errors=["缺少container_id参数"]
                )

            run_result = await self.container_manager.execute_container_operations(
                self.session_id, self.current_url, container_id, operations_subset
            )

            if run_result['success']:
                return SkillResponse(
                    success=True,
                    action="run_container",
                    result=run_result,
                    message=run_result['message']
                )
            else:
                return SkillResponse(
                    success=False,
                    action="run_container",
                    errors=[run_result['error']]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="run_container",
                errors=[f"运行容器失败: {str(e)}"]
            )

    async def _handle_highlight_container(self, request: SkillRequest) -> SkillResponse:
        """处理高亮容器请求"""
        try:
            container_id = request.parameters.get('container_id')
            duration = request.parameters.get('duration', 3000)

            if not container_id:
                return SkillResponse(
                    success=False,
                    action="highlight_container",
                    errors=["缺少container_id参数"]
                )

            highlight_result = await self.container_manager.highlight_container(
                self.session_id, self.current_url, container_id, duration
            )

            if highlight_result['success']:
                return SkillResponse(
                    success=True,
                    action="highlight_container",
                    result=highlight_result,
                    message=highlight_result['message']
                )
            else:
                return SkillResponse(
                    success=False,
                    action="highlight_container",
                    errors=[highlight_result['error']]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="highlight_container",
                errors=[f"高亮容器失败: {str(e)}"]
            )

    async def _handle_preview_operations(self, request: SkillRequest) -> SkillResponse:
        """处理预览操作请求"""
        try:
            container_id = request.parameters.get('container_id')

            if not container_id:
                return SkillResponse(
                    success=False,
                    action="preview_operations",
                    errors=["缺少container_id参数"]
                )

            preview_result = await self.container_manager.preview_container_operations(
                self.session_id, self.current_url, container_id
            )

            if preview_result['success']:
                return SkillResponse(
                    success=True,
                    action="preview_operations",
                    result=preview_result,
                    message="操作预览成功"
                )
            else:
                return SkillResponse(
                    success=False,
                    action="preview_operations",
                    errors=[preview_result['error']]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="preview_operations",
                errors=[f"预览操作失败: {str(e)}"]
            )

    async def _handle_get_execution_history(self, request: SkillRequest) -> SkillResponse:
        """处理获取执行历史请求"""
        try:
            limit = request.parameters.get('limit', 50)

            history_result = await self.container_manager.get_container_execution_history(
                self.current_url, limit
            )

            if history_result['success']:
                return SkillResponse(
                    success=True,
                    action="get_execution_history",
                    result=history_result,
                    message="执行历史获取成功"
                )
            else:
                return SkillResponse(
                    success=False,
                    action="get_execution_history",
                    errors=[history_result['error']]
                )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="get_execution_history",
                errors=[f"获取执行历史失败: {str(e)}"]
            )

    async def _handle_smart_suggest(self, request: SkillRequest) -> SkillResponse:
        """处理智能建议请求"""
        try:
            user_request = request.parameters.get('request', '')
            context = request.parameters.get('context', {})

            if not user_request:
                return SkillResponse(
                    success=False,
                    action="smart_suggest",
                    errors=["缺少request参数"]
                )

            suggestions = await self._generate_smart_suggestions(user_request, context)

            return SkillResponse(
                success=True,
                action="smart_suggest",
                result={
                    'suggestions': suggestions,
                    'user_request': user_request,
                    'context': context
                },
                message=f"生成了 {len(suggestions)} 个智能建议"
            )

        except Exception as e:
            return SkillResponse(
                success=False,
                action="smart_suggest",
                errors=[f"生成智能建议失败: {str(e)}"]
            )

    def _describe_operation(self, operation) -> str:
        """描述操作"""
        op_type = operation.type.value
        config = operation.config

        descriptions = {
            'find-child': f"查找子元素",
            'click': f"点击元素",
            'type': f"输入文本",
            'scroll': f"滚动元素",
            'waitFor': f"等待操作",
            'highlight': f"高亮显示",
            'custom': f"自定义操作"
        }

        description = descriptions.get(op_type, f"执行{op_type}操作")

        # 添加配置详情
        if config:
            config_details = []
            if op_type == 'click' and config.get('wait_before'):
                config_details.append(f"点击前等待{config['wait_before']}秒")
            if op_type == 'type' and config.get('human_typing'):
                config_details.append("模拟人类打字")
            if op_type == 'highlight' and config.get('duration'):
                config_details.append(f"持续{config['duration']}毫秒")

            if config_details:
                description += f" ({', '.join(config_details)})"

        return description

    async def _generate_smart_suggestions(self, user_request: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """生成智能建议"""
        suggestions = []
        request_lower = user_request.lower()

        try:
            # 获取当前容器的上下文信息
            containers = get_containers_for_url_v2(self.current_url)

            # 分析用户请求类型
            if any(keyword in request_lower for keyword in ['创建', 'create', 'new']):
                if any(keyword in request_lower for keyword in ['登录', 'login']):
                    suggestions.extend([
                        {
                            'type': 'create_container',
                            'description': '创建登录容器，支持用户名和密码输入',
                            'suggested_selector': '.login-form, .login, form[action*="login"]',
                            'suggested_operations': ['type', 'click', 'highlight']
                        }
                    ])
                elif any(keyword in request_lower for keyword in ['搜索', 'search', '查找']):
                    suggestions.extend([
                        {
                            'type': 'create_container',
                            'description': '创建搜索容器，支持输入和提交',
                            'suggested_selector': '.search-form, .search, input[type="search"]',
                            'suggested_operations': ['type', 'click', 'highlight']
                        }
                    ])
                else:
                    suggestions.extend([
                        {
                            'type': 'create_container',
                            'description': '创建通用容器',
                            'suggested_operations': ['highlight', 'find-child']
                        }
                    ])

            elif any(keyword in request_lower for keyword in ['运行', 'run', '执行', 'execute']):
                if containers:
                    # 建议可运行的容器
                    for container_id, container in containers.items():
                        if container.operations:
                            suggestions.append({
                                'type': 'run_container',
                                'description': f'运行容器 {container.name or container_id}',
                                'container_id': container_id,
                                'operations_count': len(container.operations)
                            })

            elif any(keyword in request_lower for keyword in ['高亮', 'highlight', '显示']):
                suggestions.extend([
                    {
                        'type': 'highlight_container',
                        'description': '高亮显示容器元素',
                        'suggested_duration': 5000
                    }
                ])

            elif any(keyword in request_lower for keyword in ['树', 'tree', '层级', '关系']):
                suggestions.extend([
                    {
                        'type': 'get_container_tree',
                        'description': '查看容器层级关系树'
                    }
                ])

            elif any(keyword in request_lower for keyword in ['分析', 'analyze']):
                suggestions.extend([
                    {
                        'type': 'analyze_element',
                        'description': '分析页面元素'
                    },
                    {
                        'type': 'preview_operations',
                        'description': '预览容器操作'
                    }
                ])

            # 添加通用的建议
            if not suggestions:
                suggestions.extend([
                    {
                        'type': 'list_containers',
                        'description': '查看所有可用容器'
                    },
                    {
                        'type': 'interactive_create',
                        'description': '使用自然语言创建容器'
                    }
                ])

        except Exception as e:
            print(f"生成智能建议失败: {e}")
            suggestions = [
                {
                    'type': 'list_containers',
                    'description': '查看所有可用容器'
                }
            ]

        return suggestions