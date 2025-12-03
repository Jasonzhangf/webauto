"""
Container数据模型
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
import uuid


@dataclass
class ContainerMatcher:
    """容器匹配器"""
    selector: str
    attributes: Dict[str, Any] = field(default_factory=dict)
    text_patterns: List[str] = field(default_factory=list)
    position_weights: Dict[str, float] = field(default_factory=lambda: {
        'exact_match': 1.0,
        'partial_match': 0.7,
        'attribute_match': 0.5,
        'text_match': 0.3
    })
    similarity_threshold: float = 0.8

    def to_dict(self) -> Dict[str, Any]:
        return {
            'selector': self.selector,
            'attributes': self.attributes,
            'text_patterns': self.text_patterns,
            'position_weights': self.position_weights,
            'similarity_threshold': self.similarity_threshold
        }


@dataclass
class ContainerAction:
    """容器操作"""
    action_type: str  # 'click', 'input', 'extract', 'wait'
    selector: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    timeout: int = 30000
    description: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'action_type': self.action_type,
            'selector': self.selector,
            'parameters': self.parameters,
            'timeout': self.timeout,
            'description': self.description
        }


@dataclass
class Container:
    """容器模型"""
    name: str
    matcher: ContainerMatcher
    actions: List[ContainerAction] = field(default_factory=list)
    children: List['Container'] = field(default_factory=list)
    xpath: Optional[str] = None
    confidence: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    container_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def add_child(self, child: 'Container'):
        """添加子容器"""
        child.container_id = str(uuid.uuid4())
        self.children.append(child)

    def add_action(self, action: ContainerAction):
        """添加操作"""
        self.actions.append(action)

    def get_actions_by_type(self, action_type: str) -> List[ContainerAction]:
        """根据类型获取操作"""
        return [action for action in self.actions if action.action_type == action_type]

    def to_dict(self) -> Dict[str, Any]:
        return {
            'container_id': self.container_id,
            'name': self.name,
            'matcher': self.matcher.to_dict(),
            'actions': [action.to_dict() for action in self.actions],
            'children': [child.to_dict() for child in self.children],
            'xpath': self.xpath,
            'confidence': self.confidence,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat()
        }


@dataclass
class ContainerMatchResult:
    """容器匹配结果"""
    container: Container
    confidence: float
    match_details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'container': self.container.to_dict(),
            'confidence': self.confidence,
            'match_details': self.match_details
        }


@dataclass
class PageContext:
    """页面上下文"""
    url: str
    title: Optional[str] = None
    domain: Optional[str] = None
    page_type: Optional[str] = None
    features: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'url': self.url,
            'title': self.title,
            'domain': self.domain,
            'page_type': self.page_type,
            'features': self.features
        }