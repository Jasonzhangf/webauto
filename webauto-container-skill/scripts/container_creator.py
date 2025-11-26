#!/usr/bin/env python3
"""
容器创建器 - 基于元素分析结果创建和管理容器
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
    get_containers_for_url_v2, save_container_v2, get_container_hierarchy_v2
)
from core.container.executor import ContainerOperationExecutor, ContainerExecutionContext
from scripts.element_analyzer import DOMElementAnalyzer, ElementInfo


@dataclass
class ContainerCreationRequest:
    """容器创建请求"""
    session_id: str
    url: str
    element_selector: Optional[str] = None
    element_coordinates: Optional[Tuple[float, float]] = None
    container_config: Dict[str, Any] = None
    auto_find_parent: bool = True
    validate_before_save: bool = True


@dataclass
class ContainerCreationResult:
    """容器创建结果"""
    success: bool
    container_id: Optional[str] = None
    container_def: Optional[ContainerDefV2] = None
    parent_container_id: Optional[str] = None
    element_info: Optional[ElementInfo] = None
    messages: List[str] = None
    errors: List[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.messages is None:
            self.messages = []
        if self.errors is None:
            self.errors = []
        if self.metadata is None:
            self.metadata = {}


class ContainerCreator:
    """容器创建器"""

    def __init__(self):
        self.element_analyzer = DOMElementAnalyzer()
        self.browser_session = None

    async def initialize(self, browser_session: Any):
        """初始化创建器"""
        self.browser_session = browser_session

    async def create_container_from_request(self, request: ContainerCreationRequest) -> ContainerCreationResult:
        """根据请求创建容器"""
        result = ContainerCreationResult(success=False)

        try:
            # 初始化元素分析器
            await self.element_analyzer.initialize(
                self.browser_session, request.session_id, request.url
            )

            # 分析目标元素
            element_info = await self._analyze_target_element(request)
            if not element_info:
                result.errors.append("无法找到目标元素")
                return result

            result.element_info = element_info
            result.messages.append(f"成功分析元素: {element_info.tag_name}.{element_info.css_classes}")

            # 验证元素是否可以创建容器
            if not self._validate_element_for_container(element_info):
                result.errors.append("元素不满足容器创建条件（缺少CSS类或不可见）")
                return result

            # 查找父容器
            parent_container_id = None
            if request.auto_find_parent:
                parent_container_id = await self.element_analyzer.find_best_parent_container(element_info)
                if parent_container_id:
                    result.parent_container_id = parent_container_id
                    result.messages.append(f"找到父容器: {parent_container_id}")

            # 创建容器定义
            container_config = request.container_config or {}
            if parent_container_id:
                container_config['parent_id'] = parent_container_id

            container_def = await self.element_analyzer.create_container_from_element(
                element_info, container_config
            )

            # 验证容器定义
            if request.validate_before_save:
                validation_result = self._validate_container_def(container_def)
                if not validation_result['valid']:
                    result.errors.extend(validation_result['errors'])
                    return result

            result.container_def = container_def
            result.container_id = container_def.id
            result.messages.append("容器定义创建成功")

            # 保存容器
            if await self._save_container(request.url, container_def):
                result.messages.append("容器保存到容器库成功")

                # 更新父容器的children列表
                if parent_container_id:
                    await self._update_parent_children(request.url, parent_container_id, container_def.id)
                    result.messages.append(f"已更新父容器 {parent_container_id} 的子容器列表")

                result.success = True
                result.metadata['creation_timestamp'] = asyncio.get_event_loop().time()
            else:
                result.errors.append("保存容器失败")

        except Exception as e:
            result.errors.append(f"容器创建过程中发生异常: {str(e)}")

        return result

    async def create_interactive_container(self, session_id: str, url: str,
                                        user_instructions: str) -> ContainerCreationResult:
        """交互式创建容器 - 基于用户指令"""
        try:
            # 解析用户指令
            parsed_instructions = self._parse_user_instructions(user_instructions)

            # 高亮候选元素
            candidates = await self._find_candidate_elements(parsed_instructions)
            if not candidates:
                return ContainerCreationResult(
                    success=False,
                    errors=["未找到符合条件的元素"]
                )

            # 选择最佳候选
            best_candidate = await self._select_best_candidate(candidates, parsed_instructions)

            # 创建容器请求
            container_config = self._generate_config_from_instructions(parsed_instructions)

            request = ContainerCreationRequest(
                session_id=session_id,
                url=url,
                element_selector=best_candidate['selector'],
                container_config=container_config,
                auto_find_parent=True,
                validate_before_save=True
            )

            return await self.create_container_from_request(request)

        except Exception as e:
            return ContainerCreationResult(
                success=False,
                errors=[f"交互式容器创建失败: {str(e)}"]
            )

    async def preview_container_operations(self, session_id: str, url: str,
                                          container_id: str) -> Dict[str, Any]:
        """预览容器操作"""
        try:
            # 获取容器定义
            containers = get_containers_for_url_v2(url)
            if container_id not in containers:
                return {
                    'success': False,
                    'error': f'容器 {container_id} 不存在'
                }

            container = containers[container_id]

            # 获取元素信息
            selector = "." + ".".join(container.get_primary_selector().classes)
            element_info = await self.element_analyzer.analyze_element_by_selector(selector)

            if not element_info:
                return {
                    'success': False,
                    'error': '无法找到容器元素'
                }

            # 分析操作序列
            operations_analysis = []
            for i, operation in enumerate(container.operations):
                op_analysis = {
                    'index': i,
                    'type': operation.type.value,
                    'config': operation.config,
                    'estimated_duration': self._estimate_operation_duration(operation, element_info),
                    'risk_level': self._assess_operation_risk(operation, element_info)
                }
                operations_analysis.append(op_analysis)

            return {
                'success': True,
                'container_id': container_id,
                'element_info': {
                    'tag_name': element_info.tag_name,
                    'css_classes': element_info.css_classes,
                    'is_visible': element_info.is_visible,
                    'is_clickable': element_info.is_clickable,
                    'position': element_info.position,
                    'size': element_info.size
                },
                'operations': operations_analysis,
                'total_operations': len(container.operations),
                'estimated_total_duration': sum(op['estimated_duration'] for op in operations_analysis),
                'overall_risk_level': max(op['risk_level'] for op in operations_analysis) if operations_analysis else 'low'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'预览容器操作失败: {str(e)}'
            }

    async def _analyze_target_element(self, request: ContainerCreationRequest) -> Optional[ElementInfo]:
        """分析目标元素"""
        if request.element_selector:
            return await self.element_analyzer.analyze_element_by_selector(request.element_selector)
        elif request.element_coordinates:
            x, y = request.element_coordinates
            return await self.element_analyzer.analyze_element_by_coordinates(x, y)
        else:
            raise ValueError("必须提供元素选择器或坐标")

    def _validate_element_for_container(self, element_info: ElementInfo) -> bool:
        """验证元素是否适合创建容器"""
        # 必须有CSS类名
        if not element_info.css_classes:
            return False

        # 必须可见
        if not element_info.is_visible:
            return False

        return True

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
        for selector in container_def.selectors:
            if not selector.classes:
                errors.append("选择器必须包含CSS类")

        # 检查操作类型
        valid_operations = [op.value for op in OperationType]
        for operation in container_def.operations:
            if operation.type.value not in valid_operations:
                warnings.append(f"未知的操作类型: {operation.type.value}")

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    async def _save_container(self, url: str, container_def: ContainerDefV2) -> bool:
        """保存容器到注册表"""
        try:
            from services.container_registry import _find_site_key_for_url, _load_registry, _save_registry

            # 获取站点key
            registry = _load_registry()
            site_key = _find_site_key_for_url(url, registry)

            if not site_key:
                # 从URL推断站点key
                from urllib.parse import urlparse
                parsed = urlparse(url)
                domain = parsed.netloc.lower()
                if 'weibo.com' in domain:
                    site_key = 'weibo'
                elif '1688.com' in domain:
                    site_key = 'cbu'
                else:
                    site_key = domain.replace('.', '_')

            return save_container_v2(site_key, container_def)

        except Exception as e:
            print(f"保存容器失败: {e}")
            return False

    async def _update_parent_children(self, url: str, parent_id: str, child_id: str):
        """更新父容器的children列表"""
        try:
            containers = get_containers_for_url_v2(url)
            if parent_id in containers:
                parent = containers[parent_id]
                if child_id not in parent.children:
                    parent.children.append(child_id)
                    await self._save_container(url, parent)

        except Exception as e:
            print(f"更新父容器children失败: {e}")

    def _parse_user_instructions(self, instructions: str) -> Dict[str, Any]:
        """解析用户指令"""
        # 简单的指令解析逻辑
        parsed = {
            'target_type': None,
            'target_text': None,
            'operations': [],
            'requirements': []
        }

        instructions_lower = instructions.lower()

        # 解析目标类型
        if 'button' in instructions_lower or '按钮' in instructions_lower:
            parsed['target_type'] = 'button'
        elif 'input' in instructions_lower or '输入框' in instructions_lower or 'input框' in instructions_lower:
            parsed['target_type'] = 'input'
        elif 'link' in instructions_lower or '链接' in instructions_lower:
            parsed['target_type'] = 'link'
        elif 'menu' in instructions_lower or '菜单' in instructions_lower:
            parsed['target_type'] = 'menu'

        # 解析操作
        if 'click' in instructions_lower or '点击' in instructions_lower:
            parsed['operations'].append('click')
        if 'input' in instructions_lower or '输入' in instructions_lower or 'fill' in instructions_lower:
            parsed['operations'].append('input')
        if 'highlight' in instructions_lower or '高亮' in instructions_lower:
            parsed['operations'].append('highlight')

        return parsed

    async def _find_candidate_elements(self, parsed_instructions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查找候选元素"""
        candidates = []

        try:
            # 根据目标类型查找元素
            if parsed_instructions['target_type'] == 'button':
                selectors = ['button', '[type="button"]', '.btn', '.button']
            elif parsed_instructions['target_type'] == 'input':
                selectors = ['input', 'textarea', '.input']
            elif parsed_instructions['target_type'] == 'link':
                selectors = ['a[href]', '.link']
            else:
                selectors = ['*']

            for selector in selectors:
                try:
                    elements = await self.browser_session.query_selector_all(selector)
                    for element in elements:
                        # 检查元素是否可见
                        is_visible = await element.evaluate('el => el.offsetParent !== null')
                        if is_visible:
                            # 获取元素信息
                            element_info = await self.element_analyzer._extract_element_info(element, selector)
                            candidates.append({
                                'element': element,
                                'selector': selector,
                                'element_info': element_info,
                                'relevance_score': self._calculate_relevance_score(element_info, parsed_instructions)
                            })
                except:
                    continue

        except Exception as e:
            print(f"查找候选元素失败: {e}")

        # 按相关性排序
        candidates.sort(key=lambda x: x['relevance_score'], reverse=True)
        return candidates

    async def _select_best_candidate(self, candidates: List[Dict[str, Any]],
                                    parsed_instructions: Dict[str, Any]) -> Dict[str, Any]:
        """选择最佳候选元素"""
        if not candidates:
            raise ValueError("没有找到候选元素")

        # 返回相关性最高的候选
        return candidates[0]

    def _generate_config_from_instructions(self, parsed_instructions: Dict[str, Any]) -> Dict[str, Any]:
        """从指令生成容器配置"""
        config = {
            'operations': []
        }

        # 根据解析的操作生成配置
        for op in parsed_instructions.get('operations', []):
            if op == 'click':
                config['operations'].append({
                    'type': 'click',
                    'config': {
                        'scroll_to_view': True,
                        'wait_before': 0.1,
                        'wait_after': 0.2
                    }
                })
            elif op == 'input':
                config['operations'].append({
                    'type': 'type',
                    'config': {
                        'clear_first': False,
                        'human_typing': True
                    }
                })
            elif op == 'highlight':
                config['operations'].append({
                    'type': 'highlight',
                    'config': {
                        'style': '2px solid #ff0000',
                        'duration': 3000
                    }
                })

        return config

    def _calculate_relevance_score(self, element_info: ElementInfo,
                                  parsed_instructions: Dict[str, Any]) -> float:
        """计算元素相关性分数"""
        score = 0.0

        # 类型匹配分数
        if parsed_instructions['target_type']:
            if parsed_instructions['target_type'] == 'button' and element_info.is_clickable:
                score += 0.5
            elif parsed_instructions['target_type'] == 'input' and element_info.is_inputtable:
                score += 0.5
            elif parsed_instructions['target_type'] == 'link' and element_info.tag_name == 'a':
                score += 0.5

        # CSS类质量分数
        if element_info.css_classes:
            # 有描述性的类名加分
            descriptive_classes = ['btn', 'button', 'input', 'search', 'submit', 'login', 'menu']
            for cls in element_info.css_classes:
                if any(desc in cls.lower() for desc in descriptive_classes):
                    score += 0.1

        # 元素可见性分数
        if element_info.is_visible:
            score += 0.2

        return min(score, 1.0)

    def _estimate_operation_duration(self, operation: OperationConfig,
                                    element_info: ElementInfo) -> float:
        """估算操作持续时间（秒）"""
        base_durations = {
            'find-child': 0.5,
            'click': 0.8,
            'type': 2.0,
            'scroll': 1.0,
            'waitFor': operation.config.get('duration', 1.0),
            'highlight': 0.3,
            'custom': 1.0
        }

        base_duration = base_durations.get(operation.type.value, 1.0)

        # 根据反检测需求调整时间
        if operation.type.value in ['click', 'type']:
            base_duration *= 1.5  # 反检测需要额外时间

        return base_duration

    def _assess_operation_risk(self, operation: OperationConfig,
                             element_info: ElementInfo) -> str:
        """评估操作风险等级"""
        if operation.type.value in ['find-child', 'highlight']:
            return 'low'
        elif operation.type.value in ['scroll', 'waitFor']:
            return 'medium'
        elif operation.type.value in ['click', 'type']:
            return 'high'
        else:
            return 'medium'  # custom操作默认medium风险