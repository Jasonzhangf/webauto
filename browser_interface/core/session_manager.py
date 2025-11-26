"""
Session Manager implementation - handles session storage and retrieval.
"""

from __future__ import annotations
from typing import Dict, Any, Optional
import json
import os
from datetime import datetime
from pathlib import Path
import threading
import time
import uuid

from .interfaces import ISessionManager


class SessionManager(ISessionManager):
    """File-based session management with in-memory caching"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.session_dir = Path(config.get('session_dir', './sessions'))
        self.session_dir.mkdir(exist_ok=True)

        # In-memory cache for active sessions
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_lock = threading.Lock()

        # Auto-save configuration
        self._auto_save_enabled = config.get('auto_save', True)
        self._auto_save_interval = config.get('auto_save_interval', 30.0)
        self._auto_save_thread: Optional[threading.Thread] = None
        self._stop_auto_save = threading.Event()

        print("🔄 会话管理器初始化完成")

    def _get_session_file(self, session_id: str) -> Path:
        """Get session file path"""
        return self.session_dir / f"{session_id}.json"

    def _load_session_from_file(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load session from file"""
        session_file = self._get_session_file(session_id)
        if not session_file.exists():
            return None

        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ 加载会话文件失败 {session_id}: {str(e)}")
            return None

    def _save_session_to_file(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Save session to file"""
        session_file = self._get_session_file(session_id)
        self.session_dir.mkdir(exist_ok=True)

        try:
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"⚠️ 保存会话文件失败 {session_id}: {str(e)}")
            return False

    def create_session(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Create new session"""
        # Add timestamp
        data['created_at'] = datetime.now().isoformat()
        data['updated_at'] = data['created_at']

        # Save to file
        if self._save_session_to_file(session_id, data):
            # Update cache
            with self._cache_lock:
                self._cache[session_id] = data.copy()

            print(f"✅ 会话已创建: {session_id}")
            return True
        else:
            print(f"❌ 会话创建失败: {session_id}")
            return False

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load session with caching"""
        # Check cache first
        with self._cache_lock:
            if session_id in self._cache:
                print(f"📦 从缓存加载会话: {session_id}")
                return self._cache[session_id].copy()

        # Load from file
        data = self._load_session_from_file(session_id)
        if data:
            # Update cache
            with self._cache_lock:
                self._cache[session_id] = data.copy()

            print(f"📂 从文件加载会话: {session_id}")
            return data
        else:
            print(f"❌ 会话不存在: {session_id}")
            return None

    def save_session(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Save session with caching"""
        # Update cache
        with self._cache_lock:
            self._cache[session_id] = data.copy()
            self._cache[session_id]['updated_at'] = datetime.now().isoformat()

        # Save to file
        if self._save_session_to_file(session_id, data):
            print(f"💾 会话已保存: {session_id}")
            return True
        else:
            print(f"❌ 会话保存失败: {session_id}")
            return False

    def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        # Remove from cache
        with self._cache_lock:
            if session_id in self._cache:
                del self._cache[session_id]

        # Delete file
        session_file = self._get_session_file(session_id)
        if session_file.exists():
            try:
                session_file.unlink()
                print(f"🗑️ 会话文件已删除: {session_id}")
                return True
            except Exception as e:
                print(f"⚠️ 删除会话文件失败 {session_id}: {str(e)}")
                return False

        print(f"🗑️ 会话已删除: {session_id}")
        return True

    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session information"""
        data = self.load_session(session_id)
        if data:
            return {
                'id': session_id,
                'created_at': data.get('created_at'),
                'updated_at': data.get('updated_at'),
                'status': data.get('status', 'unknown')
            }
        return None

    def list_sessions(self) -> Dict[str, Dict[str, Any]]:
        """List all sessions"""
        # Get sessions from files
        sessions = {}
        for session_file in self.session_dir.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                    session_id = session_file.stem
                    sessions[session_id] = session_data
            except Exception as e:
                print(f"⚠️ 读取会话文件失败 {session_file.name}: {str(e)}")

        # Update cache with file data
        with self._cache_lock:
            self._cache.update(sessions)

        print(f"📋 已发现 {len(sessions)} 个会话")
        return sessions

    def cleanup(self) -> None:
        """Cleanup all session data"""
        # Stop auto-save
        self._stop_auto_save.set()
        if self._auto_save_thread and self._auto_save_thread.is_alive():
            self._auto_save_thread.join(timeout=5.0)

        # Clear cache
        with self._cache_lock:
            self._cache.clear()

        print("🧹 会话管理器清理完成")


__all__ = ["SessionManager"]