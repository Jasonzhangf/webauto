"""
Session相关数据模型
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from enum import Enum
import uuid


class SessionState(Enum):
    """会话状态"""
    INIT = "init"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"


class CommandType(Enum):
    """命令类型"""
    NODE_EXECUTE = "node_execute"
    SESSION_CONTROL = "session_control"
    MODE_SWITCH = "mode_switch"
    PING = "ping"


@dataclass
class BrowserInstance:
    """浏览器实例"""
    session_id: str
    browser_type: str = "chromium"
    launch_args: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'session_id': self.session_id,
            'browser_type': self.browser_type,
            'launch_args': self.launch_args,
            'created_at': self.created_at.isoformat()
        }


@dataclass
class Session:
    """会话模型"""
    session_id: str
    state: SessionState
    browser_instance: BrowserInstance
    lease_holder: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    timeout: int = 3600  # 1小时超时
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_expired(self) -> bool:
        """检查会话是否过期"""
        now = datetime.utcnow()
        return (now - self.last_activity).total_seconds() > self.timeout

    def is_accessible(self) -> bool:
        """检查会话是否可访问"""
        return self.state in [SessionState.INIT, SessionState.ACTIVE]

    def update_activity(self):
        """更新最后活动时间"""
        self.last_activity = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            'session_id': self.session_id,
            'state': self.state.value,
            'browser_instance': self.browser_instance.to_dict(),
            'lease_holder': self.lease_holder,
            'capabilities': self.capabilities,
            'created_at': self.created_at.isoformat(),
            'last_activity': self.last_activity.isoformat(),
            'timeout': self.timeout,
            'metadata': self.metadata
        }


@dataclass
class BrowserCommand:
    """浏览器命令"""
    command_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    client_id: str = ""
    command_type: CommandType = CommandType.NODE_EXECUTE
    node_type: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    seq_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'command_id': self.command_id,
            'session_id': self.session_id,
            'client_id': self.client_id,
            'command_type': self.command_type.value,
            'node_type': self.node_type,
            'parameters': self.parameters,
            'seq_id': self.seq_id,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class WebSocketMessage:
    """WebSocket消息"""
    message_type: str  # "command", "result", "error", "event"
    data: Dict[str, Any]
    session_id: Optional[str] = None
    client_id: Optional[str] = None
    seq_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'message_type': self.message_type,
            'data': self.data,
            'session_id': self.session_id,
            'client_id': self.client_id,
            'seq_id': self.seq_id,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class LeaseInfo:
    """租约信息"""
    lease_id: str
    client_id: str
    session_id: str
    acquired_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    priority: int = 1  # 优先级，数字越小优先级越高

    def is_expired(self) -> bool:
        """检查租约是否过期"""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def to_dict(self) -> Dict[str, Any]:
        return {
            'lease_id': self.lease_id,
            'client_id': self.client_id,
            'session_id': self.session_id,
            'acquired_at': self.acquired_at.isoformat(),
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'priority': self.priority
        }