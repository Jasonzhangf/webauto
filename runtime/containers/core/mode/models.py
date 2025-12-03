"""
Operating Mode Models
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime
from enum import Enum
import uuid


class OperatingMode(Enum):
    """操作模式"""
    DEV = "dev"
    RUN = "run"


@dataclass
class ModeConfig:
    """模式配置"""
    mode: OperatingMode
    ui_overlay_enabled: bool = False
    debug_channel_enabled: bool = False
    interaction_allowed: bool = False
    auto_save_containers: bool = True
    permissions: List[str] = field(default_factory=list)
    timeout: int = 30000
    retry_count: int = 3

    def to_dict(self) -> Dict[str, Any]:
        return {
            'mode': self.mode.value,
            'ui_overlay_enabled': self.ui_overlay_enabled,
            'debug_channel_enabled': self.debug_channel_enabled,
            'interaction_allowed': self.interaction_allowed,
            'auto_save_containers': self.auto_save_containers,
            'permissions': self.permissions,
            'timeout': self.timeout,
            'retry_count': self.retry_count
        }


@dataclass
class OverlayConfig:
    """UI覆盖层配置"""
    inspect_enabled: bool = True
    container_editor: bool = True
    workflow_recorder: bool = True
    element_highlight: bool = True
    console_access: bool = True
    network_monitor: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            'inspect_enabled': self.inspect_enabled,
            'container_editor': self.container_editor,
            'workflow_recorder': self.workflow_recorder,
            'element_highlight': self.element_highlight,
            'console_access': self.console_access,
            'network_monitor': self.network_monitor
        }


@dataclass
class DebugEvent:
    """调试事件"""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    event_type: str = ""  # 'element_click', 'container_match', 'error', etc.
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    stack_trace: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'event_id': self.event_id,
            'session_id': self.session_id,
            'event_type': self.event_type,
            'data': self.data,
            'timestamp': self.timestamp.isoformat(),
            'stack_trace': self.stack_trace
        }


@dataclass
class ModeTransition:
    """模式转换记录"""
    transition_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    from_mode: OperatingMode = OperatingMode.RUN
    to_mode: OperatingMode = OperatingMode.DEV
    timestamp: datetime = field(default_factory=datetime.utcnow)
    reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'transition_id': self.transition_id,
            'session_id': self.session_id,
            'from_mode': self.from_mode.value,
            'to_mode': self.to_mode.value,
            'timestamp': self.timestamp.isoformat(),
            'reason': self.reason,
            'metadata': self.metadata
        }


@dataclass
class DevSession:
    """Dev模式会话"""
    session_id: str
    overlay_config: OverlayConfig = field(default_factory=OverlayConfig)
    debug_events: List[DebugEvent] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    inspector_active: bool = False
    container_editor_active: bool = False

    def add_debug_event(self, event_type: str, data: Dict[str, Any]):
        """添加调试事件"""
        event = DebugEvent(
            session_id=self.session_id,
            event_type=event_type,
            data=data
        )
        self.debug_events.append(event)
        self.last_activity = datetime.utcnow()

    def get_recent_events(self, limit: int = 50) -> List[DebugEvent]:
        """获取最近的调试事件"""
        return self.debug_events[-limit:] if self.debug_events else []

    def to_dict(self) -> Dict[str, Any]:
        return {
            'session_id': self.session_id,
            'overlay_config': self.overlay_config.to_dict(),
            'debug_events_count': len(self.debug_events),
            'created_at': self.created_at.isoformat(),
            'last_activity': self.last_activity.isoformat(),
            'inspector_active': self.inspector_active,
            'container_editor_active': self.container_editor_active
        }