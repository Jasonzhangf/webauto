#!/usr/bin/env python3
"""
Browser CLI - WebAuto命令行接口主程序
"""

import asyncio
import click
import json
import sys
from typing import Optional
from pathlib import Path

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.config import load_config, save_config
from commands.session import SessionCommands
from commands.node import NodeCommands
from commands.container import ContainerCommands
from commands.dev import DevCommands
from commands.workflow import WorkflowCommands

class LazyWebSocketClient:
    """Lazy loader to avoid importing websockets when未使用"""
    def __init__(self, url: str):
        self.url = url
        self._client = None

    def _ensure_client(self):
        if self._client is None:
            from utils.websocket_client import WebSocketClient
            self._client = WebSocketClient(self.url)
        return self._client

    def __getattr__(self, item):
        client = self._ensure_client()
        return getattr(client, item)


@click.group()
@click.option('--websocket-url', default='ws://localhost:8765', help='WebSocket服务器地址')
@click.option('--session', help='默认会话ID')
@click.option('--format', type=click.Choice(['json', 'table', 'yaml']), default='table', help='输出格式')
@click.option('--verbose', '-v', is_flag=True, help='详细输出')
@click.pass_context
def cli(ctx, websocket_url: str, session: Optional[str], format: str, verbose: bool):
    """WebAuto Browser CLI - 浏览器自动化命令行工具"""
    ctx.ensure_object(dict)
    ctx.obj['websocket_url'] = websocket_url
    ctx.obj['default_session'] = session
    ctx.obj['output_format'] = format
    ctx.obj['verbose'] = verbose

    # 初始化WebSocket客户端
    ctx.obj['ws_client'] = LazyWebSocketClient(websocket_url)

    # 初始化命令处理器
    ctx.obj['session_commands'] = SessionCommands(ctx.obj)
    ctx.obj['node_commands'] = NodeCommands(ctx.obj)
    ctx.obj['container_commands'] = ContainerCommands(ctx.obj)
    ctx.obj['dev_commands'] = DevCommands(ctx.obj)
    ctx.obj['workflow_commands'] = WorkflowCommands(ctx.obj)


@cli.group()
def session():
    """会话管理命令"""
    pass

@session.command()
@click.option('--capabilities', help='会话能力列表，逗号分隔')
@click.pass_context
def create(ctx, capabilities: str):
    """创建新的浏览器会话"""
    commands = ctx.obj['session_commands']
    cap_list = capabilities.split(',') if capabilities else ['dom', 'screenshot']
    result = commands.create(cap_list)
    _output_result(ctx, result)

@session.command()
@click.pass_context
def list(ctx):
    """列出所有活跃会话"""
    commands = ctx.obj['session_commands']
    result = commands.list()
    _output_result(ctx, result)

@session.command()
@click.argument('session_id')
@click.pass_context
def info(ctx, session_id: str):
    """获取会话详细信息"""
    commands = ctx.obj['session_commands']
    result = commands.info(session_id)
    _output_result(ctx, result)

@session.command()
@click.argument('session_id')
@click.option('--force', is_flag=True, help='强制删除')
@click.pass_context
def delete(ctx, session_id: str, force: bool):
    """删除会话"""
    commands = ctx.obj['session_commands']
    result = commands.delete(session_id, force)
    _output_result(ctx, result)

@session.command()
@click.argument('session_id')
@click.argument('mode', type=click.Choice(['dev', 'run']))
@click.pass_context
def mode(ctx, session_id: str, mode: str):
    """设置会话模式"""
    commands = ctx.obj['session_commands']
    result = commands.set_mode(session_id, mode)
    _output_result(ctx, result)


# Node执行子命令
@click.command()
@click.argument('session_id')
@click.argument('node_type')
@click.option('--params', help='Node参数JSON字符串')
@click.pass_context
def node_exec(ctx, session_id: str, node_type: str, params: Optional[str]):
    """执行单个Node"""
    commands = ctx.obj['node_commands']
    parameters = json.loads(params) if params else {}
    result = commands.execute(session_id, node_type, parameters)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.argument('workflow_file', type=click.Path(exists=True))
@click.pass_context
def node_batch(ctx, session_id: str, workflow_file: str):
    """批量执行Node（从文件）"""
    commands = ctx.obj['node_commands']
    result = commands.batch(session_id, workflow_file)
    _output_result(ctx, result)

@cli.group()
@click.pass_context
def node(ctx):
    """Node执行命令"""
    pass

# 绑定子命令到node组
node.add_command(node_exec, name='exec')
node.add_command(node_batch, name='batch')


# 容器操作子命令
@click.command()
@click.argument('session_id')
@click.argument('url')
@click.pass_context
def match(ctx, session_id: str, url: str):
    """匹配根容器"""
    commands = ctx.obj['container_commands']
    result = commands.match_root(session_id, url)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.option('--root-selector', help='根容器选择器')
@click.pass_context
def discover(ctx, session_id: str, root_selector: Optional[str]):
    """发现子容器"""
    commands = ctx.obj['container_commands']
    result = commands.discover_children(session_id, root_selector)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.argument('container_name')
@click.argument('selector')
@click.pass_context
def save(ctx, session_id: str, container_name: str, selector: str):
    """保存容器到库"""
    commands = ctx.obj['container_commands']
    result = commands.save_container(session_id, container_name, selector)
    _output_result(ctx, result)

@click.command()
@click.argument('container_file', type=click.Path(exists=True))
@click.pass_context
def test_container(ctx, container_file: str):
    """测试容器定义"""
    commands = ctx.obj['container_commands']
    result = commands.test_container(container_file)
    _output_result(ctx, result)


@cli.group()
@click.pass_context
def container(ctx):
    """容器操作命令"""
    pass

# 绑定子命令到容器组
@click.command('list')
@click.option('--url', required=True, help='页面URL')
@click.pass_context
def container_list(ctx, url: str):
    commands = ctx.obj['container_commands']
    result = commands.list_by_url(url)
    _output_result(ctx, result)

@click.command('show')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.pass_context
def container_show(ctx, url: str, container_id: str):
    commands = ctx.obj['container_commands']
    result = commands.show_container(url, container_id)
    _output_result(ctx, result)

@click.command('upsert')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.option('--selector', required=True)
@click.option('--name')
@click.option('--parent')
@click.option('--event-key')
@click.option('--actions', help='JSON字符串形式的actions')
@click.pass_context
def container_upsert(ctx, url: str, container_id: str, selector: str,
                     name: str = None, parent: str = None,
                     event_key: str = None, actions: str = None):
    commands = ctx.obj['container_commands']
    actions_payload = json.loads(actions) if actions else None
    result = commands.upsert_container_cli(url, container_id, selector, name, parent, event_key, actions_payload)
    _output_result(ctx, result)

@click.command('delete')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.pass_context
def container_delete(ctx, url: str, container_id: str):
    commands = ctx.obj['container_commands']
    result = commands.delete_container_cli(url, container_id)
    _output_result(ctx, result)

@container.group()
def ops():
    """容器Operation管理"""
    pass

@ops.command('list')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.pass_context
def ops_list(ctx, url: str, container_id: str):
    commands = ctx.obj['container_commands']
    result = commands.list_operations(url, container_id)
    _output_result(ctx, result)

@ops.command('add')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.option('--type', 'op_type', required=True)
@click.option('--config', 'config_json', help='JSON字符串形式的配置')
@click.option('--selector')
@click.option('--target')
@click.option('--attribute')
@click.option('--include-text/--no-include-text', default=False)
@click.option('--max-items', type=int)
@click.pass_context
def ops_add(ctx, url: str, container_id: str, op_type: str, config_json: str,
            selector: str = None, target: str = None, attribute: str = None,
            include_text: bool = False, max_items: int = None):
    commands = ctx.obj['container_commands']
    result = commands.add_operation_cli(
        url=url,
        container_id=container_id,
        op_type=op_type,
        config_json=config_json,
        selector=selector,
        target=target,
        attribute=attribute,
        include_text=include_text,
        max_items=max_items
    )
    _output_result(ctx, result)

@ops.command('remove')
@click.option('--url', required=True)
@click.option('--id', 'container_id', required=True)
@click.argument('index', type=int)
@click.pass_context
def ops_remove(ctx, url: str, container_id: str, index: int):
    commands = ctx.obj['container_commands']
    result = commands.remove_operation(url, container_id, index)
    _output_result(ctx, result)

container.add_command(match)
container.add_command(discover)
container.add_command(save)
container.add_command(test_container)
container.add_command(container_list)
container.add_command(container_show)
container.add_command(container_upsert)
container.add_command(container_delete)
container.add_command(ops)


# Dev模式调试子命令
@click.command()
@click.argument('session_id')
@click.pass_context
def dev_overlay(ctx, session_id: str):
    """启用Dev覆盖层"""
    commands = ctx.obj['dev_commands']
    result = commands.enable_overlay(session_id)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.argument('selector')
@click.pass_context
def dev_inspect(ctx, session_id: str, selector: str):
    """检查页面元素"""
    commands = ctx.obj['dev_commands']
    result = commands.inspect_element(session_id, selector)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.option('--limit', default=50, help='事件数量限制')
@click.pass_context
def dev_events(ctx, session_id: str, limit: int):
    """获取调试事件"""
    commands = ctx.obj['dev_commands']
    result = commands.get_debug_events(session_id, limit)
    _output_result(ctx, result)

@click.command()
@click.argument('session_id')
@click.pass_context
def dev_status(ctx, session_id: str):
    """获取Dev模式状态"""
    commands = ctx.obj['dev_commands']
    result = commands.get_status(session_id)
    _output_result(ctx, result)

@cli.group()
@click.pass_context
def dev(ctx):
    """Dev模式调试命令"""
    pass

# 绑定子命令到dev组
dev.add_command(dev_overlay, name='overlay')
dev.add_command(dev_inspect, name='inspect')
dev.add_command(dev_events, name='events')
dev.add_command(dev_status, name='status')


@cli.group()
@click.pass_context
def workflow(ctx):
    """工作流管理命令"""
    commands = ctx.obj['workflow_commands']

    @click.command()
    @click.argument('session_id')
    @click.argument('workflow_file', type=click.Path(exists=True))
    @click.pass_context
    def run(ctx, session_id: str, workflow_file: str):
        """运行工作流"""
        result = commands.run(session_id, workflow_file)
        _output_result(ctx, result)

    @click.command()
    @click.argument('session_id')
    @click.argument('output_file', type=click.Path())
    @click.pass_context
    def record(ctx, session_id: str, output_file: str):
        """录制用户操作为工作流"""
        result = commands.record(session_id, output_file)
        _output_result(ctx, result)

    @click.command()
    @click.argument('workflow_file', type=click.Path(exists=True))
    @click.pass_context
    def validate(ctx, workflow_file: str):
        """验证工作流定义"""
        result = commands.validate(workflow_file)
        _output_result(ctx, result)

    # 绑定子命令
    run(workflow)
    record(workflow)
    validate(workflow)


@cli.command()
@click.pass_context
def version(ctx):
    """显示版本信息"""
    click.echo("WebAuto Browser CLI v1.0.0")


def _output_result(ctx, result: dict):
    """输出结果"""
    format_type = ctx.obj.get('output_format', 'table')
    verbose = ctx.obj.get('verbose', False)

    if format_type == 'json':
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    elif format_type == 'yaml':
        try:
            import yaml
            click.echo(yaml.dump(result, default_flow_style=False))
        except ImportError:
            click.echo("Error: PyYAML not installed", err=True)
            sys.exit(1)
    else:
        # 表格格式输出
        _output_table(result, verbose)


def _output_table(result: dict, verbose: bool = False):
    """表格格式输出"""
    if 'error' in result:
        click.echo(f"❌ Error: {result['error']}", err=True)
        return

    if 'success' in result:
        status = "✅ Success" if result['success'] else "❌ Failed"
        click.echo(f"Status: {status}")

    if 'data' in result:
        data = result['data']
        if isinstance(data, list):
            for i, item in enumerate(data, 1):
                click.echo(f"\n[{i}]")
                _print_dict_item(item, verbose)
        elif isinstance(data, dict):
            _print_dict_item(data, verbose)
        else:
            click.echo(f"Data: {data}")

    if verbose and 'metadata' in result:
        click.echo(f"\nMetadata:")
        _print_dict_item(result['metadata'], verbose)


def _print_dict_item(item: dict, verbose: bool = False):
    """打印字典项"""
    for key, value in item.items():
        if verbose or not key.startswith('_'):
            if isinstance(value, (dict, list)):
                click.echo(f"  {key}:")
                if isinstance(value, dict):
                    for sub_key, sub_value in value.items():
                        click.echo(f"    {sub_key}: {sub_value}")
                else:
                    for i, sub_item in enumerate(value, 1):
                        click.echo(f"    [{i}] {sub_item}")
            else:
                click.echo(f"  {key}: {value}")


def main():
    """CLI主入口"""
    try:
        cli()
    except KeyboardInterrupt:
        click.echo("\n👋 Goodbye!", err=True)
        sys.exit(0)
    except Exception as e:
        click.echo(f"❌ Unexpected error: {e}", err=True)
        if '--verbose' in sys.argv or '-v' in sys.argv:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
