"""
容器发现引擎 - DOM式层层递进容器匹配
"""

import asyncio
import re
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from difflib import SequenceMatcher

from .models import Container, ContainerMatcher, ContainerMatchResult, PageContext


class ContainerDiscoveryEngine:
    """容器发现引擎"""

    def __init__(self):
        self.logger = None  # 可以注入logger

    async def match_root_container(self, session_id: str, page_context: PageContext,
                                  container_library: 'ContainerLibrary') -> Optional[ContainerMatchResult]:
        """匹配根容器"""
        try:
            # 获取页面容器候选
            root_candidates = await self._find_root_candidates(session_id, page_context, container_library)

            if not root_candidates:
                return None

            # 对每个候选计算置信度
            best_match = None
            best_confidence = 0.0

            for candidate in root_candidates:
                confidence = await self._calculate_confidence(
                    candidate, page_context, container_library
                )

                if confidence > best_confidence:
                    best_match = candidate
                    best_confidence = confidence

            # 自适应阈值：如果所有候选置信度都低，选择最高的
            adaptive_threshold = max(0.7, min(0.9, best_confidence + 0.05))

            if best_match and best_confidence > adaptive_threshold:
                return ContainerMatchResult(
                    container=best_match,
                    confidence=best_confidence,
                    match_details={
                        'match_type': 'root',
                        'candidates_count': len(root_candidates),
                        'adaptive_threshold': adaptive_threshold,
                        'page_context': page_context.to_dict()
                    }
                )

            # 即使置信度不高，也返回最佳匹配供调用方决定
            if best_match:
                return ContainerMatchResult(
                    container=best_match,
                    confidence=best_confidence,
                    match_details={
                        'match_type': 'root_fallback',
                        'candidates_count': len(root_candidates),
                        'adaptive_threshold': adaptive_threshold,
                        'fallback_reason': 'confidence_below_threshold',
                        'page_context': page_context.to_dict()
                    }
                )

            return None

        except Exception as error:
            if self.logger:
                self.logger.error(f"Root container matching failed: {error}")
            return None

    async def discover_children(self, session_id: str, parent_container: Container,
                               container_library: 'ContainerLibrary') -> List[ContainerMatchResult]:
        """发现子容器"""
        try:
            # 在父容器DOM scope内搜索子容器
            child_candidates = await self._search_in_scope(
                session_id, parent_container, container_library
            )

            # 评分机制选择最优匹配
            scored_children = []
            for candidate in child_candidates:
                score = await self._score_child_container(
                    candidate, parent_container, container_library
                )

                if score > 0.7:
                    scored_children.append(
                        ContainerMatchResult(
                            container=candidate,
                            confidence=score,
                            match_details={
                                'match_type': 'child',
                                'parent_container': parent_container.container_id
                            }
                        )
                    )

            # 按分数排序
            scored_children.sort(key=lambda x: x.confidence, reverse=True)
            return scored_children[:10]  # 最多返回10个子容器

        except Exception as error:
            if self.logger:
                self.logger.error(f"Child container discovery failed: {error}")
            return []

    async def _find_root_candidates(self, session_id: str, page_context: PageContext,
                                 container_library: 'ContainerLibrary') -> List[Container]:
        """查找根容器候选"""
        candidates = []

        # 从容器库中查找匹配的容器
        domain = page_context.domain
        if domain:
            domain_containers = container_library.get_containers_by_domain(domain)
            candidates.extend(domain_containers)

        # 基于页面类型查找
        page_type = page_context.page_type
        if page_type:
            type_containers = container_library.search_containers(page_type)
            candidates.extend(type_containers)

        # 基于URL模式匹配库中的容器
        url_patterns = await self._get_url_patterns(page_context.url)
        for pattern in url_patterns:
            pattern_containers = container_library.search_containers(pattern)
            candidates.extend(pattern_containers)

        # 基于页面特征查找
        page_features = page_context.features
        if page_features:
            for feature_name, feature_value in page_features.items():
                feature_containers = container_library.search_containers(feature_name)
                candidates.extend(feature_containers)

        # 去重
        unique_candidates = []
        seen_selectors = set()
        for container in candidates:
            if container.matcher.selector not in seen_selectors:
                unique_candidates.append(container)
                seen_selectors.add(container.matcher.selector)

        return unique_candidates

    async def _calculate_confidence(self, container: Container, page_context: PageContext,
                                   container_library: 'ContainerLibrary') -> float:
        """计算容器匹配置信度"""
        url_score = await self._match_url_pattern(page_context.url, container.metadata.get('url_patterns', []))
        uniqueness_score = await self._check_selector_uniqueness(container.matcher.selector)
        feature_score = self._match_page_features(page_context.features, container.metadata.get('page_features', {}))

        # 综合评分
        confidence = (url_score * 0.4 + uniqueness_score * 0.4 + feature_score * 0.2)
        return min(confidence, 1.0)

    async def _match_url_pattern(self, current_url: str, url_patterns: List[str]) -> float:
        """匹配URL模式"""
        if not url_patterns:
            return 0.5  # 默认分数

        parsed_current = urlparse(current_url)
        best_score = 0.0

        for pattern in url_patterns:
            # 简单的URL匹配逻辑
            if pattern == current_url:
                return 1.0  # 完全匹配

            # 域名匹配
            if pattern.startswith('*.'):
                domain_pattern = pattern[2:]
                if parsed_current.netloc == domain_pattern or parsed_current.netloc.endswith('.' + domain_pattern):
                    best_score = max(best_score, 0.8)

            # 路径模式匹配（转义特殊字符）
            elif '*' in pattern:
                # 转义URL中的特殊字符，但保留通配符
                escaped_pattern = re.escape(pattern).replace(r'\*', '.*')
                # 确保精确匹配（添加边界）
                pattern_regex = f'^{escaped_pattern}$'
                if re.match(pattern_regex, current_url):
                    best_score = max(best_score, 0.7)

            # 前缀匹配
            elif current_url.startswith(pattern):
                best_score = max(best_score, 0.6)

        return best_score

    async def _check_selector_uniqueness(self, selector: str) -> float:
        """检查选择器唯一性"""
        try:
            # 实际DOM检查选择器唯一性
            element_count = await self._count_dom_elements_by_selector(selector)

            if element_count == 1:
                return 1.0  # 完全唯一
            elif element_count == 0:
                return 0.0  # 没有匹配元素
            else:
                # 根据匹配数量计算唯一性分数
                # 匹配越多，唯一性越低
                return max(0.1, 1.0 / (element_count * 0.5))

        except Exception as error:
            if self.logger:
                self.logger.error(f"Selector uniqueness check failed: {error}")

            # 回退到启发式评分
            if selector.startswith('#'):
                return 0.9
            elif selector.startswith('[data-'):
                return 0.85
            elif '.' in selector and selector.count('.') <= 2:
                return 0.7
            else:
                return 0.5

    async def _count_dom_elements_by_selector(self, selector: str) -> int:
        """通过选择器计算DOM元素数量"""
        # 这里需要实际的浏览器自动化接口
        # 暂时返回模拟数据
        if selector.startswith('#'):
            return 1  # 假设ID唯一
        elif selector.startswith('[data-'):
            return 1
        elif '.' in selector:
            class_count = selector.count('.')
            return min(10, class_count * 2)
        else:
            return 5

    def _match_page_features(self, current_features: Dict[str, Any],
                            expected_features: Dict[str, Any]) -> float:
        """匹配页面特征"""
        if not expected_features:
            return 0.5

        if not current_features:
            return 0.0

        matched_features = 0
        total_features = len(expected_features)

        for key, expected_value in expected_features.items():
            if key in current_features:
                current_value = current_features[key]
                if current_value == expected_value:
                    matched_features += 1.0
                elif isinstance(current_value, str) and isinstance(expected_value, str):
                    # 字符串相似度匹配
                    similarity = SequenceMatcher(None, current_value, expected_value).ratio()
                    if similarity > 0.8:
                        matched_features += similarity

        return matched_features / total_features if total_features > 0 else 0.0

    async def _search_in_scope(self, session_id: str, parent_container: Container,
                              container_library: 'ContainerLibrary') -> List[Container]:
        """在父容器范围内搜索子容器"""
        # 模拟子容器发现
        children = []

        # 这里应该在实际DOM的父容器范围内搜索
        # 暂时返回模拟数据
        potential_selectors = [
            f"{parent_container.matcher.selector} > .child-element",
            f"{parent_container.matcher.selector} .content",
            f"{parent_container.matcher.selector} .section"
        ]

        for i, selector in enumerate(potential_selectors):
            child_container = Container(
                name=f"child_{i}",
                matcher=ContainerMatcher(selector=selector),
                xpath=f"//child_{i}"
            )
            children.append(child_container)

        return children

    async def _score_child_container(self, child: Container, parent: Container,
                                    container_library: 'ContainerLibrary') -> float:
        """为子容器评分"""
        # 基础评分基于选择器质量和元素特征
        selector_score = self._evaluate_selector_quality(child.matcher.selector)
        position_score = self._evaluate_position_relative_to_parent(child, parent)

        return (selector_score * 0.6 + position_score * 0.4)

    def _evaluate_selector_quality(self, selector: str) -> float:
        """评估选择器质量"""
        if selector.startswith('#'):
            return 0.9
        elif selector.startswith('[data-'):
            return 0.85
        elif '.' in selector:
            class_count = selector.count('.')
            return max(0.3, 0.8 - class_count * 0.1)
        elif '>' in selector:
            return 0.7
        else:
            return 0.5

    def _evaluate_position_relative_to_parent(self, child: Container, parent: Container) -> float:
        """评估子容器相对于父容器的位置"""
        # 这里应该基于实际的DOM位置关系
        # 暂时返回默认分数
        return 0.6

    async def _get_url_patterns(self, url: str) -> List[str]:
        """获取URL模式"""
        patterns = []
        parsed = urlparse(url)

        # 添加精确URL
        patterns.append(url)

        # 添加域名模式
        patterns.append(f"*.{parsed.netloc}")
        patterns.append(parsed.netloc)

        # 添加路径模式
        path = parsed.path
        if path != '/':
            # 分路径段
            path_parts = path.strip('/').split('/')
            for i in range(len(path_parts)):
                pattern_path = '/' + '/'.join(path_parts[:i+1])
                patterns.append(f"{parsed.scheme}://{parsed.netloc}{pattern_path}/*")

        return patterns

    async def _find_containers_by_pattern(self, session_id: str, pattern: str) -> List[Container]:
        """根据模式查找容器"""
        try:
            # 在实际DOM中查找匹配模式的容器
            # 这里需要与browser session集成
            containers = []

            # 简单实现：假设我们有一个DOM查询接口
            selector_matches = await self._query_dom_by_pattern(session_id, pattern)

            for match_data in selector_matches:
                container = Container(
                    name=f"pattern_match_{len(containers)}",
                    matcher=ContainerMatcher(
                        selector=match_data.get('selector', ''),
                        attributes=match_data.get('attributes', {})
                    ),
                    xpath=match_data.get('xpath'),
                    metadata={'pattern': pattern, 'session_id': session_id}
                )
                containers.append(container)

            return containers

        except Exception as error:
            if self.logger:
                self.logger.error(f"Pattern matching failed: {error}")
            return []

    async def _find_containers_by_features(self, session_id: str, features: Dict[str, Any]) -> List[Container]:
        """根据特征查找容器"""
        try:
            containers = []

            # 基于页面特征查找容器
            feature_matches = await self._query_dom_by_features(session_id, features)

            for match_data in feature_matches:
                container = Container(
                    name=f"feature_match_{len(containers)}",
                    matcher=ContainerMatcher(
                        selector=match_data.get('selector', ''),
                        attributes=match_data.get('attributes', {}),
                        text_patterns=match_data.get('text_patterns', [])
                    ),
                    xpath=match_data.get('xpath'),
                    metadata={'features': features, 'session_id': session_id}
                )
                containers.append(container)

            return containers

        except Exception as error:
            if self.logger:
                self.logger.error(f"Feature matching failed: {error}")
            return []

    async def _query_dom_by_pattern(self, session_id: str, pattern: str) -> List[Dict[str, Any]]:
        """通过模式查询DOM"""
        # 这里需要实际的浏览器自动化接口
        # 暂时返回模拟数据
        return [
            {
                'selector': '.main-container',
                'attributes': {'class': 'main-container'},
                'xpath': '//div[@class="main-container"]'
            }
        ]

    async def _query_dom_by_features(self, session_id: str, features: Dict[str, Any]) -> List[Dict[str, Any]]:
        """通过特征查询DOM"""
        # 这里需要实际的浏览器自动化接口
        # 暂时返回模拟数据
        return [
            {
                'selector': '.content-wrapper',
                'attributes': {'class': 'content-wrapper'},
                'text_patterns': features.get('keywords', []),
                'xpath': '//div[@class="content-wrapper"]'
            }
        ]