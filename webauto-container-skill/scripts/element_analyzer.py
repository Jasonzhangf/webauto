#!/usr/bin/env python3
"""
DOM元素分析器 - 分析页面元素并提取容器定义信息
"""

import asyncio
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urlparse

# 导入容器系统
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from core.container.models_v2 import (
    ContainerDefV2, SelectorByClass, OperationType, OperationConfig,
    SelectorVariant, RunMode
)
from services.container_registry import get_containers_for_url_v2


@dataclass
class ElementInfo:
    """元素信息"""
    element_id: str
    tag_name: str
    css_classes: List[str]
    attributes: Dict[str, str]
    text_content: str
    xpath: str
    parent_xpath: Optional[str]
    children_count: int
    is_visible: bool
    is_clickable: bool
    is_inputtable: bool
    is_scrollable: bool
    position: Dict[str, float]
    size: Dict[str, float]


class DOMElementAnalyzer:
    """DOM元素分析器"""

    def __init__(self):
        self.browser_session = None
        self.session_id = None
        self.current_url = None

    async def initialize(self, browser_session: Any, session_id: str, url: str):
        """初始化分析器"""
        self.browser_session = browser_session
        self.session_id = session_id
        self.current_url = url

    async def analyze_element_by_selector(self, selector: str) -> Optional[ElementInfo]:
        """通过选择器分析元素"""
        try:
            # 查找元素
            element = await self.browser_session.query_selector(selector)
            if not element:
                return None

            # 获取元素信息
            element_info = await self._extract_element_info(element, selector)
            return element_info

        except Exception as e:
            print(f"分析元素失败: {e}")
            return None

    async def analyze_element_by_coordinates(self, x: float, y: float) -> Optional[ElementInfo]:
        """通过坐标分析元素"""
        try:
            # 在指定坐标点击获取元素
            element_script = f"""
            (x, y) => {{
                const element = document.elementFromPoint(x, y);
                if (!element) return null;

                // 生成唯一选择器
                const getSelector = (el) => {{
                    if (el.id) return `#${{literal_brace_left}id${literal_brace_right}}`;
                    const classes = Array.from(el.classList);
                    if (classes.length > 0) return `.${literal_brace_left}classes.join('.')${literal_brace_right}}`;
                    return el.tagName.toLowerCase();
                }};

                return {{
                    element: element,
                    selector: getSelector(element),
                    tagName: element.tagName.toLowerCase(),
                    classNames: Array.from(element.classList),
                    textContent: element.textContent?.slice(0, 200) || ''
                }};
            }}
            """

            # 使用正确的字符串格式
            script = f"""
            (x, y) => {{
                const element = document.elementFromPoint(x, y);
                if (!element) return null;

                const getSelector = (el) => {{
                    if (el.id) return `#${{literal_brace_left}el.id${literal_brace_right}}`;
                    const classes = Array.from(el.classList);
                    if (classes.length > 0) return `.${literal_brace_left}classes.join('.')${literal_brace_right}}`;
                    return el.tagName.toLowerCase();
                }};

                return {{
                    element: element,
                    selector: getSelector(element),
                    tagName: element.tagName.toLowerCase(),
                    classNames: Array.from(element.classList),
                    textContent: element.textContent?.slice(0, 200) || ''
                }};
            }}
            """

            result = await self.browser_session.evaluate(script, x, y)
            if not result:
                return None

            # 获取完整的元素信息
            element_info = await self._extract_element_info_from_result(result)
            return element_info

        except Exception as e:
            print(f"坐标分析失败: {e}")
            return None

    async def find_best_parent_container(self, element_info: ElementInfo) -> Optional[str]:
        """为元素找到最佳父容器"""
        try:
            # 获取当前页面的所有容器
            containers = get_containers_for_url_v2(self.current_url)
            if not containers:
                return None

            best_parent = None
            best_score = 0

            # 分析每个可能的父容器
            for container_id, container in containers.items():
                score = await self._calculate_parent_score(element_info, container)
                if score > best_score:
                    best_score = score
                    best_parent = container_id

            return best_parent

        except Exception as e:
            print(f"查找父容器失败: {e}")
            return None

    async def suggest_container_operations(self, element_info: ElementInfo) -> List[OperationConfig]:
        """为元素建议合适的操作"""
        operations = []

        # 默认添加find-child操作
        operations.append(OperationConfig(OperationType.FIND_CHILD))

        # 根据元素类型添加操作
        if element_info.is_clickable:
            operations.append(OperationConfig(
                OperationType.CLICK,
                config={
                    'scroll_to_view': True,
                    'wait_before': 0.1,
                    'wait_after': 0.2
                }
            ))

        if element_info.is_inputtable:
            operations.append(OperationConfig(
                OperationType.TYPE,
                config={
                    'clear_first': False,
                    'human_typing': True
                }
            ))

        if element_info.is_scrollable:
            operations.append(OperationConfig(
                OperationType.SCROLL,
                config={
                    'direction': 'down',
                    'distance': 300
                }
            ))

        # 总是添加高亮操作用于可视化
        operations.append(OperationConfig(
            OperationType.HIGHLIGHT,
            config={
                'style': '2px solid #ff0000',
                'duration': 3000
            }
        ))

        return operations

    async def create_container_from_element(self, element_info: ElementInfo,
                                          container_config: Dict[str, Any]) -> ContainerDefV2:
        """从元素信息创建容器定义"""
        try:
            # 生成容器ID
            container_id = container_config.get('id', self._generate_container_id(element_info))

            # 创建选择器
            selector = SelectorByClass(
                classes=element_info.css_classes,
                variant=SelectorVariant.PRIMARY,
                score=1.0
            )

            # 获取建议的操作
            suggested_operations = await self.suggest_container_operations(element_info)

            # 合并用户配置的操作
            user_operations = container_config.get('operations', [])
            for op_config in user_operations:
                op_type = OperationType(op_config.get('type', 'find-child'))
                op_params = op_config.get('config', {})
                suggested_operations.append(OperationConfig(op_type, op_params))

            # 创建容器定义
            container = ContainerDefV2(
                id=container_id,
                name=container_config.get('name', f"Container_{container_id}"),
                type=container_config.get('type', self._infer_container_type(element_info)),
                selectors=[selector],
                operations=suggested_operations,
                capabilities=self._infer_capabilities(element_info),
                page_patterns=container_config.get('page_patterns', [self.current_url]),
                run_mode=RunMode.SEQUENTIAL,
                metadata={
                    'element_info': {
                        'tag_name': element_info.tag_name,
                        'text_preview': element_info.text_content[:100],
                        'created_from': 'dom_analysis'
                    }
                }
            )

            return container

        except Exception as e:
            print(f"创建容器失败: {e}")
            raise

    async def _extract_element_info(self, element: Any, selector: str) -> ElementInfo:
        """提取元素信息"""
        try:
            script = f"""
            (element) => {{
                const rect = element.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(element);
                const parent = element.parentElement;

                // 获取XPath
                const getXPath = (el) => {{
                    if (!el) return null;
                    if (el.id) {{
                        return `id("${{literal_brace_left}el.id${literal_brace_right}}")`;
                    }}
                    if (el === document.body) return el.tagName.toLowerCase();

                    let ix = 0;
                    const siblings = el.parentNode.childNodes;
                    for (let i = 0; i < siblings.length; i++) {{
                        const sibling = siblings[i];
                        if (sibling === el) {{
                            return `${{literal_brace_left}getXPath(el.parentNode)${literal_brace_right}}/${{literal_brace_left}el.tagName.toLowerCase()${literal_brace_right}}[${{literal_brace_left}ix${literal_brace_right}}]`;
                        }}
                        if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {{
                            ix++;
                        }}
                    }}
                }};

                return {{
                    elementId: element.id || '',
                    tagName: element.tagName.toLowerCase(),
                    cssClasses: Array.from(element.classList),
                    attributes: (() => {{
                        const attrs = {{}};
                        for (let attr of element.attributes) {{
                            attrs[attr.name] = attr.value;
                        }}
                        return attrs;
                    }})(),
                    textContent: element.textContent?.slice(0, 500) || '',
                    xpath: getXPath(element),
                    parentXPath: parent ? getXPath(parent) : null,
                    childrenCount: element.children?.length || 0,
                    isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
                    isClickable: element.tagName.match(/^(button|a|input|select|textarea)$/) ||
                               element.onclick !== null ||
                               computedStyle.cursor === 'pointer',
                    isInputtable: element.tagName.match(/^(input|textarea|select)$/) ||
                               element.contentEditable === 'true',
                    isScrollable: element.scrollHeight > element.clientHeight ||
                                element.scrollWidth > element.clientWidth,
                    position: {{
                        x: rect.left,
                        y: rect.top
                    }},
                    size: {{
                        width: rect.width,
                        height: rect.height
                    }}
                }};
            }}
            """

            result = await element.evaluate(script)

            return ElementInfo(
                element_id=result['elementId'],
                tag_name=result['tagName'],
                css_classes=result['cssClasses'],
                attributes=result['attributes'],
                text_content=result['textContent'],
                xpath=result['xpath'],
                parent_xpath=result['parentXPath'],
                children_count=result['childrenCount'],
                is_visible=result['isVisible'],
                is_clickable=result['isClickable'],
                is_inputtable=result['isInputtable'],
                is_scrollable=result['isScrollable'],
                position=result['position'],
                size=result['size']
            )

        except Exception as e:
            print(f"提取元素信息失败: {e}")
            raise

    async def _extract_element_info_from_result(self, result: Dict[str, Any]) -> ElementInfo:
        """从分析结果提取元素信息"""
        return ElementInfo(
            element_id=result.get('elementId', ''),
            tag_name=result.get('tagName', ''),
            css_classes=result.get('classNames', []),
            attributes=result.get('attributes', {}),
            text_content=result.get('textContent', ''),
            xpath=result.get('xpath', ''),
            parent_xpath=None,  # 需要额外查询
            children_count=0,  # 需要额外查询
            is_visible=True,  # 需要额外查询
            is_clickable=result.get('tagName', '') in ['button', 'a', 'input', 'select', 'textarea'],
            is_inputtable=result.get('tagName', '') in ['input', 'textarea', 'select'],
            is_scrollable=False,  # 需要额外查询
            position={'x': 0, 'y': 0},
            size={'width': 0, 'height': 0}
        )

    async def _calculate_parent_score(self, element_info: ElementInfo, container: ContainerDefV2) -> float:
        """计算父容器匹配分数"""
        try:
            score = 0.0

            # 检查选择器匹配
            for selector in container.selectors:
                if self._classes_match(element_info.css_classes, selector.classes):
                    score += selector.score * 0.8  # 选择器匹配权重

            # 检查容器能力是否匹配元素能力
            if element_info.is_clickable and 'click' in container.capabilities:
                score += 0.1

            if element_info.is_inputtable and 'input' in container.capabilities:
                score += 0.1

            # 检查XPath层级关系
            if element_info.parent_xpath and container.id in element_info.parent_xpath:
                score += 0.2

            return min(score, 1.0)

        except Exception:
            return 0.0

    def _classes_match(self, element_classes: List[str], container_classes: List[str]) -> bool:
        """检查CSS类是否匹配"""
        if not container_classes:
            return True

        # 检查元素是否包含所有容器要求的类
        for container_class in container_classes:
            if container_class not in element_classes:
                return False

        return True

    def _generate_container_id(self, element_info: ElementInfo) -> str:
        """生成容器ID"""
        if element_info.element_id:
            return element_info.element_id

        if element_info.css_classes:
            # 使用第一个CSS类作为基础
            base_class = element_info.css_classes[0]
            # 清理类名
            clean_class = re.sub(r'[^a-zA-Z0-9_]', '_', base_class)
            return f"{clean_class}_container"

        # 使用标签名
        return f"{element_info.tag_name}_container"

    def _infer_container_type(self, element_info: ElementInfo) -> str:
        """推断容器类型"""
        if element_info.is_inputtable:
            return 'input'
        elif element_info.is_clickable:
            if element_info.tag_name == 'a':
                return 'link'
            elif element_info.tag_name == 'button':
                return 'button'
            else:
                return 'clickable'
        elif element_info.is_scrollable:
            return 'scrollable'
        elif element_info.children_count > 0:
            return 'container'
        else:
            return 'generic'

    def _infer_capabilities(self, element_info: ElementInfo) -> List[str]:
        """推断容器能力"""
        capabilities = []

        if element_info.is_clickable:
            capabilities.append('click')

        if element_info.is_inputtable:
            capabilities.append('input')

        if element_info.is_scrollable:
            capabilities.append('scroll')

        if element_info.children_count > 0:
            capabilities.append('find-child')

        capabilities.append('highlight')  # 所有容器都支持高亮

        return capabilities