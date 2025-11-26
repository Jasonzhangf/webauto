"""
Container v2 数据模型 - 符合 ContainerDefV2 schema
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
import uuid
from enum import Enum


class OperationType(Enum):
    """操作类型枚举"""
    FIND_CHILD = "find-child"
    CLICK = "click"
    SCROLL = "scroll"
    TYPE = "type"
    WAIT_FOR = "waitFor"
    CUSTOM = "custom"
    HIGHLIGHT = "highlight"
    INPUT = "input"
    EXTRACT = "extract"


class SelectorVariant(Enum):
    """选择器变体"""
    PRIMARY = "primary"
    BACKUP = "backup"


class RunMode(Enum):
    """运行模式"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class PaginationMode(Enum):
    """分页模式"""
    SCROLL = "scroll"
    CLICK = "click"


@dataclass
class SelectorByClass:
    """选择器定义：支持 classes/c s s /id 三种表达，优先级 css > id > classes"""
    classes: List[str] = field(default_factory=list)
    variant: SelectorVariant = SelectorVariant.PRIMARY
    score: float = 1.0
    css: Optional[str] = None
    id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            'variant': self.variant.value,
            'score': self.score
        }
        if self.css:
            data['css'] = self.css
        if self.id:
            data['id'] = self.id
        if self.classes:
            data['classes'] = self.classes
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SelectorByClass':
        return cls(
            classes=data.get('classes', []) or [],
            variant=SelectorVariant(data.get('variant', 'primary')),
            score=data.get('score', 1.0),
            css=data.get('css'),
            id=data.get('id')
        )


@dataclass
class OperationConfig:
    """操作配置"""
    type: OperationType
    config: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.type.value,
            'config': self.config
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'OperationConfig':
        return cls(
            type=OperationType(data['type']),
            config=data.get('config', {})
        )


@dataclass
class PaginationConfig:
    """分页配置"""
    mode: PaginationMode
    target_selector: Optional[SelectorByClass] = None
    max_steps: int = 10
    delay_ms: int = 1000

    def to_dict(self) -> Dict[str, Any]:
        result = {
            'mode': self.mode.value,
            'maxSteps': self.max_steps,
            'delayMs': self.delay_ms
        }
        if self.target_selector:
            result['targetSelector'] = self.target_selector.to_dict()
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PaginationConfig':
        target_selector = None
        if data.get('targetSelector'):
            target_selector = SelectorByClass.from_dict(data['targetSelector'])

        return cls(
            mode=PaginationMode(data['mode']),
            target_selector=target_selector,
            max_steps=data.get('maxSteps', 10),
            delay_ms=data.get('delayMs', 1000)
        )


@dataclass
class ContainerDefV2:
    """容器定义 v2 - 完全符合 ContainerDefV2 schema"""
    id: str
    name: Optional[str] = None
    type: Optional[str] = None
    scope: Optional[str] = None
    page_patterns: List[str] = field(default_factory=list)
    selectors: List[SelectorByClass] = field(default_factory=list)
    children: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)
    run_mode: RunMode = RunMode.SEQUENTIAL
    operations: List[OperationConfig] = field(default_factory=list)
    pagination: Optional[PaginationConfig] = None
    version: Optional[str] = None
    replaced_by: Optional[str] = None
    reliability: float = 1.0

    # 扩展字段（不在schema中，用于运行时）
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典，完全符合schema"""
        result = {
            'id': self.id,
            'selectors': [sel.to_dict() for sel in self.selectors]
        }

        # 只包含非None的字段
        if self.name is not None:
            result['name'] = self.name
        if self.type is not None:
            result['type'] = self.type
        if self.scope is not None:
            result['scope'] = self.scope
        if self.page_patterns:
            result['pagePatterns'] = self.page_patterns
        if self.children:
            result['children'] = self.children
        if self.depends_on:
            result['dependsOn'] = self.depends_on
        if self.capabilities:
            result['capabilities'] = self.capabilities
        if self.run_mode != RunMode.SEQUENTIAL:
            result['runMode'] = self.run_mode.value
        if self.operations:
            result['operations'] = [op.to_dict() for op in self.operations]
        if self.pagination is not None:
            result['pagination'] = self.pagination.to_dict()
        if self.version is not None:
            result['version'] = self.version
        if self.replaced_by is not None:
            result['replacedBy'] = self.replaced_by
        if self.reliability != 1.0:
            result['reliability'] = self.reliability
        if self.metadata:
            result['metadata'] = self.metadata

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ContainerDefV2':
        """从字典创建容器定义"""
        selectors = [SelectorByClass.from_dict(sel) for sel in data.get('selectors', [])]
        operations = [OperationConfig.from_dict(op) for op in data.get('operations', [])]

        pagination = None
        if data.get('pagination'):
            pagination = PaginationConfig.from_dict(data['pagination'])

        return cls(
            id=data['id'],
            name=data.get('name'),
            type=data.get('type'),
            scope=data.get('scope'),
            page_patterns=data.get('pagePatterns', data.get('page_patterns', [])),
            selectors=selectors,
            children=data.get('children', []),
            depends_on=data.get('dependsOn', []),
            capabilities=data.get('capabilities', []),
            run_mode=RunMode(data.get('runMode', 'sequential')),
            operations=operations,
            pagination=pagination,
            version=data.get('version'),
            replaced_by=data.get('replacedBy'),
            reliability=data.get('reliability', 1.0),
            metadata=data.get('metadata', {})
        )

    def add_operation(self, operation_type: OperationType, config: Dict[str, Any] = None):
        """添加操作"""
        if config is None:
            config = {}
        self.operations.append(OperationConfig(operation_type, config))

    def add_selector(self, classes: List[str], variant: SelectorVariant = SelectorVariant.PRIMARY, score: float = 1.0):
        """添加选择器"""
        self.selectors.append(SelectorByClass(classes, variant, score))

    def get_primary_selector(self) -> Optional[SelectorByClass]:
        """获取主选择器"""
        for selector in self.selectors:
            if selector.variant == SelectorVariant.PRIMARY:
                return selector
        return self.selectors[0] if self.selectors else None

    def has_capability(self, capability: str) -> bool:
        """检查是否具有特定能力"""
        return capability in self.capabilities

    def add_capability(self, capability: str):
        """添加能力"""
        if capability not in self.capabilities:
            self.capabilities.append(capability)


@dataclass
class ContainerExecutionResult:
    """容器执行结果"""
    container_id: str
    success: bool
    execution_time: float
    results: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'container_id': self.container_id,
            'success': self.success,
            'execution_time': self.execution_time,
            'results': self.results,
            'errors': self.errors,
            'metadata': self.metadata
        }


@dataclass
class ContainerExecutionContext:
    """容器执行上下文"""
    session_id: str
    browser_session: Any
    page_url: str
    container_library: Dict[str, ContainerDefV2]
    parent_container: Optional[str] = None
    execution_mode: RunMode = RunMode.SEQUENTIAL
    anti_detection_enabled: bool = True
    debug_mode: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


# 为了向后兼容，提供一个从旧格式转换到v2格式的工具函数
def convert_legacy_container_to_v2(legacy_data: Dict[str, Any]) -> ContainerDefV2:
    """将旧版容器数据转换为ContainerDefV2格式"""

    # 生成选择器
    selectors = []
    if 'selector' in legacy_data:
        # 将CSS选择器转换为class选择器
        selector_str = legacy_data['selector']
        classes = []

        # 提取class名称
        import re
        class_matches = re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', selector_str)
        classes = class_matches

        if classes:
            selectors.append(SelectorByClass(classes, SelectorVariant.PRIMARY, 1.0))

    # 生成操作
    operations = []
    if 'actions' in legacy_data:
        actions = legacy_data['actions']
        if isinstance(actions, dict):
            if actions.get('click'):
                operations.append(OperationConfig(OperationType.CLICK))
            if actions.get('type') or actions.get('fill'):
                operations.append(OperationConfig(OperationType.TYPE))

    # 如果没有显式操作但有选择器，默认添加find-child操作
    if not operations and selectors:
        operations.append(OperationConfig(OperationType.FIND_CHILD))

    return ContainerDefV2(
        id=legacy_data.get('name', legacy_data.get('id', str(uuid.uuid4()))),
        name=legacy_data.get('name'),
        type=legacy_data.get('type'),
        selectors=selectors,
        children=legacy_data.get('children', []),
        operations=operations,
        metadata={
            'legacy_data': legacy_data,
            'converted_at': datetime.utcnow().isoformat()
        }
    )
