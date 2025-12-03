"""
Bridge helpers exposing CLI container commands to runtime code.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from cli.commands.container import ContainerCommands  # type: ignore


class _DummyWsClient:
    def is_connected(self) -> bool:
        return False

    def connect(self) -> bool:
        return False


_CLI = ContainerCommands({'ws_client': _DummyWsClient()})


def list_containers(url: str) -> Dict[str, Any]:
    return _CLI.legacy_container_map(url)


def upsert_container(url: str, container_id: str, selector: str,
                     name: Optional[str], parent_id: Optional[str],
                     event_key: Optional[str], actions: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return _CLI.upsert_container_cli(
        url=url,
        container_id=container_id,
        selector=selector,
        description=name,
        parent_id=parent_id,
        event_key=event_key,
        actions=actions
    )


def delete_container(url: str, container_id: str) -> Dict[str, Any]:
    return _CLI.delete_container_cli(url, container_id)


def add_operation(url: str, container_id: str, op_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    return _CLI.add_operation(url, container_id, op_type, config)


def list_operations(url: str, container_id: str) -> Dict[str, Any]:
    return _CLI.list_operations(url, container_id)


def remove_operation(url: str, container_id: str, index: int) -> Dict[str, Any]:
    return _CLI.remove_operation(url, container_id, index)


def update_operation(url: str, container_id: str, index: int, op_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    return _CLI.update_operation(url, container_id, index, op_type, config)
