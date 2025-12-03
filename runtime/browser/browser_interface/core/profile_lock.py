"""
Profile Lock Manager - ensures only one browser instance per profile
"""

from __future__ import annotations
import os
import signal
import json
import time
from pathlib import Path
from typing import Optional

from .paths import LOCKS_DIR


class ProfileLockManager:
    """Manages profile locks to prevent duplicate browser instances"""
    
    def __init__(self, lock_dir: str = str(LOCKS_DIR)):
        self.lock_dir = Path(lock_dir).expanduser()
        if not self.lock_dir.is_absolute():
            self.lock_dir = (Path.cwd() / self.lock_dir).resolve()
        self.lock_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_lock_file(self, profile_id: str) -> Path:
        """Get lock file path for a profile"""
        return self.lock_dir / f"{profile_id}.lock"
    
    def _is_process_running(self, pid: int) -> bool:
        """Check if a process is still running"""
        try:
            # Send signal 0 to check if process exists
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    
    def _kill_process(self, pid: int) -> bool:
        """Kill a process by PID"""
        try:
            print(f"🔪 正在终止进程 PID={pid}...")
            os.kill(pid, signal.SIGTERM)
            
            # Wait up to 5 seconds for graceful shutdown
            for _ in range(50):
                if not self._is_process_running(pid):
                    print(f"✅ 进程 {pid} 已终止")
                    return True
                time.sleep(0.1)
            
            # Force kill if still running
            print(f"⚠️ 进程 {pid} 未响应SIGTERM，强制终止...")
            os.kill(pid, signal.SIGKILL)
            time.sleep(0.5)
            
            if not self._is_process_running(pid):
                print(f"✅ 进程 {pid} 已强制终止")
                return True
            else:
                print(f"❌ 无法终止进程 {pid}")
                return False
                
        except Exception as e:
            print(f"⚠️ 终止进程 {pid} 时出错: {e}")
            return False
    
    def acquire_lock(self, profile_id: str, current_pid: Optional[int] = None) -> bool:
        """Acquire lock for a profile, killing existing instance if needed
        
        Args:
            profile_id: Profile identifier
            current_pid: Current process PID (defaults to os.getpid())
            
        Returns:
            True if lock acquired successfully
        """
        if current_pid is None:
            current_pid = os.getpid()
        
        lock_file = self._get_lock_file(profile_id)
        
        # Check if lock file exists
        if lock_file.exists():
            try:
                with open(lock_file, 'r', encoding='utf-8') as f:
                    lock_data = json.load(f)
                
                old_pid = lock_data.get('pid')
                old_profile = lock_data.get('profile_id')
                created_at = lock_data.get('created_at', 0)
                
                if old_pid and old_pid != current_pid:
                    # Check if old process is still running
                    if self._is_process_running(old_pid):
                        print(f"⚠️ 检测到profile '{profile_id}' 的现有实例 (PID={old_pid})")
                        print(f"   创建时间: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(created_at))}")
                        
                        # Kill the old process
                        if self._kill_process(old_pid):
                            print(f"✅ 已终止旧实例，准备启动新实例")
                        else:
                            print(f"❌ 无法终止旧实例，可能需要手动处理")
                            return False
                    else:
                        print(f"🧹 清理过期的锁文件 (进程 {old_pid} 已不存在)")
                
            except Exception as e:
                print(f"⚠️ 读取锁文件失败: {e}，将创建新锁")
        
        # Create new lock file
        try:
            lock_data = {
                'pid': current_pid,
                'profile_id': profile_id,
                'created_at': time.time(),
                'hostname': os.uname().nodename if hasattr(os, 'uname') else 'unknown'
            }
            
            with open(lock_file, 'w', encoding='utf-8') as f:
                json.dump(lock_data, f, indent=2)
            
            print(f"🔒 已为profile '{profile_id}' 创建锁 (PID={current_pid})")
            return True
            
        except Exception as e:
            print(f"❌ 创建锁文件失败: {e}")
            return False
    
    def release_lock(self, profile_id: str, current_pid: Optional[int] = None) -> bool:
        """Release lock for a profile
        
        Args:
            profile_id: Profile identifier
            current_pid: Current process PID (defaults to os.getpid())
            
        Returns:
            True if lock released successfully
        """
        if current_pid is None:
            current_pid = os.getpid()
        
        lock_file = self._get_lock_file(profile_id)
        
        if not lock_file.exists():
            return True
        
        try:
            # Verify this is our lock
            with open(lock_file, 'r', encoding='utf-8') as f:
                lock_data = json.load(f)
            
            if lock_data.get('pid') != current_pid:
                print(f"⚠️ 锁文件不属于当前进程 (PID={current_pid})，跳过释放")
                return False
            
            # Remove lock file
            lock_file.unlink()
            print(f"🔓 已释放profile '{profile_id}' 的锁")
            return True
            
        except Exception as e:
            print(f"⚠️ 释放锁文件失败: {e}")
            return False
    
    def is_locked(self, profile_id: str) -> tuple[bool, Optional[int]]:
        """Check if a profile is locked
        
        Returns:
            Tuple of (is_locked, pid_if_locked)
        """
        lock_file = self._get_lock_file(profile_id)
        
        if not lock_file.exists():
            return False, None
        
        try:
            with open(lock_file, 'r', encoding='utf-8') as f:
                lock_data = json.load(f)
            
            pid = lock_data.get('pid')
            if pid and self._is_process_running(pid):
                return True, pid
            else:
                # Stale lock file
                return False, None
                
        except Exception:
            return False, None
    
    def cleanup_stale_locks(self) -> int:
        """Clean up stale lock files
        
        Returns:
            Number of stale locks cleaned up
        """
        count = 0
        for lock_file in self.lock_dir.glob("*.lock"):
            try:
                with open(lock_file, 'r', encoding='utf-8') as f:
                    lock_data = json.load(f)
                
                pid = lock_data.get('pid')
                if pid and not self._is_process_running(pid):
                    lock_file.unlink()
                    print(f"🧹 清理过期锁: {lock_file.name} (PID={pid})")
                    count += 1
                    
            except Exception as e:
                print(f"⚠️ 清理锁文件 {lock_file.name} 时出错: {e}")
        
        return count


__all__ = ["ProfileLockManager"]
