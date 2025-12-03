"""
基础Node实现
"""

from typing import Any, Dict, List, Optional
from .node_interface import NodeInterface, NodeDescription, NodeResult, ExecutionContext, FieldDescription, ExtractType


class NavigateNode(NodeInterface):
    """导航Node"""

    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.url = parameters.get('url', '')
        self.wait_for = parameters.get('wait_for')
        self.timeout = parameters.get('timeout', 30000)

    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行导航操作"""
        try:
            result = await context.python_executor.execute_navigate(
                context.session_id,
                self.url,
                self.wait_for
            )

            # 将导航结果存储到上下文
            context.set_variable('current_url', self.url)
            context.set_variable('navigation_result', result.data)

            return result

        except Exception as error:
            return NodeResult(
                success=False,
                error=f"Navigation failed: {str(error)}"
            )

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="navigate",
            capabilities=['dom', 'network'],
            parameters={
                'url': FieldDescription(
                    name='url',
                    type='string',
                    required=True,
                    description='目标URL'
                ),
                'wait_for': FieldDescription(
                    name='wait_for',
                    type='string',
                    required=False,
                    description='等待的元素选择器',
                    default_value=None
                )
            },
            timeout=self.timeout
        )


class QueryNode(NodeInterface):
    """查询Node"""

    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.selector = parameters.get('selector', '')
        self.extract_type = parameters.get('extract_type', ExtractType.TEXT)
        self.attribute = parameters.get('attribute')
        self.multiple = parameters.get('multiple', False)

    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行查询操作"""
        try:
            result = await context.python_executor.execute_query(
                context.session_id,
                self.selector,
                self.extract_type,
                self.attribute,
                self.multiple
            )

            # 使用确定性的变量名而不是随机hash
            var_name = f'query_result_{self.selector.replace(".", "_").replace("#", "_")}'
            context.set_variable(var_name, result.data)

            return result

        except Exception as error:
            return NodeResult(
                success=False,
                error=f"Query failed: {str(error)}"
            )

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="query",
            capabilities=['dom'],
            parameters={
                'selector': FieldDescription(
                    name='selector',
                    type='string',
                    required=True,
                    description='CSS选择器'
                ),
                'extract_type': FieldDescription(
                    name='extract_type',
                    type='string',
                    required=False,
                    description='提取类型',
                    default_value='text'
                ),
                'attribute': FieldDescription(
                    name='attribute',
                    type='string',
                    required=False,
                    description='属性名称',
                    default_value=None
                ),
                'multiple': FieldDescription(
                    name='multiple',
                    type='boolean',
                    required=False,
                    description='是否提取多个元素',
                    default_value=False
                )
            }
        )


class ClickNode(NodeInterface):
    """点击Node"""

    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.selector = parameters.get('selector', '')
        self.wait_before = parameters.get('wait_before', 0)
        self.wait_after = parameters.get('wait_after', 0)

    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行点击操作"""
        try:
            result = await context.python_executor.execute_click(
                context.session_id,
                self.selector,
                self.wait_before,
                self.wait_after
            )

            # 使用确定性的变量名
            var_name = f'click_result_{self.selector.replace(".", "_").replace("#", "_")}'
            context.set_variable(var_name, result.data)

            return result

        except Exception as error:
            return NodeResult(
                success=False,
                error=f"Click failed: {str(error)}"
            )

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="click",
            capabilities=['dom'],
            parameters={
                'selector': FieldDescription(
                    name='selector',
                    type='string',
                    required=True,
                    description='CSS选择器'
                ),
                'wait_before': FieldDescription(
                    name='wait_before',
                    type='integer',
                    required=False,
                    description='点击前等待时间(ms)',
                    default_value=0
                ),
                'wait_after': FieldDescription(
                    name='wait_after',
                    type='integer',
                    required=False,
                    description='点击后等待时间(ms)',
                    default_value=0
                )
            }
        )


class InputNode(NodeInterface):
    """输入Node"""

    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.selector = parameters.get('selector', '')
        self.value = parameters.get('value', '')
        self.clear_first = parameters.get('clear_first', True)

    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行输入操作"""
        try:
            result = await context.python_executor.execute_input(
                context.session_id,
                self.selector,
                self.value,
                self.clear_first
            )

            # 使用确定性的变量名
            var_name = f'input_result_{self.selector.replace(".", "_").replace("#", "_")}'
            context.set_variable(var_name, result.data)

            return result

        except Exception as error:
            return NodeResult(
                success=False,
                error=f"Input failed: {str(error)}"
            )

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="input",
            capabilities=['dom', 'form'],
            parameters={
                'selector': FieldDescription(
                    name='selector',
                    type='string',
                    required=True,
                    description='输入框CSS选择器'
                ),
                'value': FieldDescription(
                    name='value',
                    type='string',
                    required=True,
                    description='输入值'
                ),
                'clear_first': FieldDescription(
                    name='clear_first',
                    type='boolean',
                    required=False,
                    description='是否先清空输入框',
                    default_value=True
                )
            }
        )


class WaitNode(NodeInterface):
    """等待Node"""

    def __init__(self, **parameters):
        super().__init__(**parameters)
        self.selector = parameters.get('selector')
        self.timeout = parameters.get('timeout', 30000)
        self.wait_type = parameters.get('wait_type', 'element')  # 'element', 'text', 'network', 'time'

    async def execute(self, context: ExecutionContext) -> NodeResult:
        """执行等待操作"""
        try:
            result = await context.python_executor.execute_wait(
                context.session_id,
                self.selector,
                self.timeout,
                self.wait_type
            )

            return result

        except Exception as error:
            return NodeResult(
                success=False,
                error=f"Wait failed: {str(error)}"
            )

    def get_description(self) -> NodeDescription:
        return NodeDescription(
            name="wait",
            capabilities=['dom'],
            parameters={
                'selector': FieldDescription(
                    name='selector',
                    type='string',
                    required=False,
                    description='等待的元素选择器',
                    default_value=None
                ),
                'timeout': FieldDescription(
                    name='timeout',
                    type='integer',
                    required=False,
                    description='超时时间(ms)',
                    default_value=30000
                ),
                'wait_type': FieldDescription(
                    name='wait_type',
                    type='string',
                    required=False,
                    description='等待类型',
                    default_value='element'
                )
            },
            timeout=self.timeout
        )