"""
WebAuto Node System
提供浏览器操作的Node抽象层
"""

from .node_interface import NodeInterface, NodeDescription, NodeResult, ExecutionContext
from .nodes import NavigateNode, QueryNode, ClickNode, InputNode, WaitNode

__all__ = [
    'NodeInterface',
    'NodeDescription',
    'NodeResult',
    'ExecutionContext',
    'NavigateNode',
    'QueryNode',
    'ClickNode',
    'InputNode',
    'WaitNode'
]