"""
Node Registry - Node注册和管理系统
"""

from typing import Dict, Type, Any, List
from .node_interface import NodeInterface
from .nodes import NavigateNode, QueryNode, ClickNode, InputNode, WaitNode


class NodeRegistry:
    """Node注册表，用于管理所有可用的Node类型"""

    def __init__(self):
        self._nodes: Dict[str, Type[NodeInterface]] = {}
        self._register_default_nodes()

    def _register_default_nodes(self):
        """注册默认的Node类型"""
        self.register("navigate", NavigateNode)
        self.register("query", QueryNode)
        self.register("click", ClickNode)
        self.register("input", InputNode)
        self.register("wait", WaitNode)

    def register(self, name: str, node_class: Type[NodeInterface]):
        """注册Node类型"""
        if not issubclass(node_class, NodeInterface):
            raise ValueError(f"Node class {node_class} must inherit from NodeInterface")

        self._nodes[name] = node_class

    def create_node(self, node_type: str, parameters: Dict[str, Any]) -> NodeInterface:
        """创建Node实例"""
        if node_type not in self._nodes:
            raise ValueError(f"Unknown node type: {node_type}")

        node_class = self._nodes[node_type]
        return node_class(**parameters)

    def get_node_class(self, node_type: str) -> Type[NodeInterface]:
        """获取Node类"""
        if node_type not in self._nodes:
            raise ValueError(f"Unknown node type: {node_type}")

        return self._nodes[node_type]

    def list_node_types(self) -> List[str]:
        """列出所有可用的Node类型"""
        return list(self._nodes.keys())

    def validate_node_parameters(self, node_type: str, parameters: Dict[str, Any]) -> List[str]:
        """验证Node参数"""
        try:
            node = self.create_node(node_type, parameters)
            return node.validate_parameters(parameters)
        except Exception as error:
            return [f"Node creation failed: {str(error)}"]

    def get_node_description(self, node_type: str) -> Dict[str, Any]:
        """获取Node描述"""
        try:
            node = self.create_node(node_type, {})
            description = node.get_description()
            return {
                'name': description.name,
                'capabilities': description.capabilities,
                'parameters': {
                    name: {
                        'type': param.type,
                        'required': param.required,
                        'description': param.description,
                        'default_value': param.default_value
                    }
                    for name, param in description.parameters.items()
                },
                'async_mode': description.async_mode,
                'timeout': description.timeout,
                'retry_count': description.retry_count
            }
        except Exception as error:
            return {'error': str(error)}


# 全局Node注册表实例
node_registry = NodeRegistry()