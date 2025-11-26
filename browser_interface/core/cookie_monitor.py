"""
Smart Cookie Monitor - monitors cookie changes and saves when stable
"""

from __future__ import annotations
import json
import os
import time
import hashlib
import threading
from typing import Any, Dict, Optional
from pathlib import Path


class CookieMonitor:
    """
    Monitors cookie changes and saves when cookies stabilize.
    
    Features:
    - Detects cookie changes by comparing hashes
    - Waits for stabilization period before saving
    - Avoids save loops during login flows
    - Thread-safe operation
    """
    
    def __init__(
        self,
        context: Any,
        session_name: str,
        cookie_dir: str = "./cookies",
        check_interval: float = 2.0,
        stabilization_time: float = 5.0,
        min_save_interval: float = 10.0,
        get_storage_state_callback: Optional[callable] = None
    ):
        """
        Initialize cookie monitor
        
        Args:
            context: Playwright browser context
            session_name: Session name for saving
            cookie_dir: Directory to save cookies
            check_interval: How often to check for changes (seconds)
            stabilization_time: How long cookies must be stable before saving (seconds)
            min_save_interval: Minimum time between saves (seconds)
            get_storage_state_callback: Optional callback to get storage state (for thread safety)
        """
        self.context = context
        self.session_name = session_name
        self.cookie_dir = Path(cookie_dir)
        self.cookie_dir.mkdir(parents=True, exist_ok=True)
        
        self.check_interval = check_interval
        self.stabilization_time = stabilization_time
        self.min_save_interval = min_save_interval
        self.get_storage_state_callback = get_storage_state_callback
        
        # State tracking
        self._current_hash: Optional[str] = None
        self._last_change_time: Optional[float] = None
        self._last_save_time: float = 0
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # Statistics
        self.stats = {
            "checks": 0,
            "changes_detected": 0,
            "saves": 0,
            "skipped_saves": 0
        }
    
    def _get_storage_state(self) -> Dict[str, Any]:
        """Get current storage state from context"""
        try:
            # Use callback if provided (thread-safe)
            if self.get_storage_state_callback:
                return self.get_storage_state_callback()
            # Fallback to direct access (may have thread issues)
            return self.context.storage_state()
        except Exception as e:
            # Silently fail - this is expected in background thread
            return {}
    
    def _compute_hash(self, storage_state: Dict[str, Any]) -> str:
        """Compute hash of storage state for change detection"""
        # Extract only cookies for comparison (ignore localStorage which may change frequently)
        cookies = storage_state.get("cookies", [])
        
        # Sort cookies by name and domain for consistent hashing
        sorted_cookies = sorted(
            cookies,
            key=lambda c: (c.get("domain", ""), c.get("name", ""))
        )
        
        # Create a stable string representation
        cookie_str = json.dumps(sorted_cookies, sort_keys=True)
        
        # Compute hash
        return hashlib.sha256(cookie_str.encode()).hexdigest()
    
    def _save_cookies(self, storage_state: Dict[str, Any]) -> bool:
        """Save cookies to disk"""
        try:
            session_file = self.cookie_dir / f"session_{self.session_name}.json"
            
            # Write to temp file first, then rename (atomic operation)
            temp_file = session_file.with_suffix('.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(storage_state, f, indent=2, ensure_ascii=False)
            
            # Atomic rename
            temp_file.replace(session_file)
            
            self._last_save_time = time.time()
            self.stats["saves"] += 1
            
            print(f"💾 Cookie已保存: {session_file.name}")
            return True
            
        except Exception as e:
            print(f"❌ Cookie保存失败: {e}")
            return False
    
    def _monitor_loop(self) -> None:
        """Main monitoring loop (runs in background thread)"""
        print(f"🔍 Cookie监控已启动")
        print(f"   检查间隔: {self.check_interval}秒")
        print(f"   稳定时间: {self.stabilization_time}秒")
        print(f"   最小保存间隔: {self.min_save_interval}秒")
        
        while self._running:
            try:
                with self._lock:
                    self._check_and_save()
            except Exception as e:
                print(f"⚠️ Cookie监控出错: {e}")
            
            # Sleep in small increments to allow quick shutdown
            for _ in range(int(self.check_interval * 10)):
                if not self._running:
                    break
                time.sleep(0.1)
        
        print("🛑 Cookie监控已停止")
    
    def _check_and_save(self) -> None:
        """Check for cookie changes and save if stable"""
        self.stats["checks"] += 1
        
        # Get current state
        storage_state = self._get_storage_state()
        if not storage_state:
            return
        
        # Compute hash
        current_hash = self._compute_hash(storage_state)
        
        # First run - initialize
        if self._current_hash is None:
            self._current_hash = current_hash
            self._last_change_time = time.time()
            print(f"🔐 初始Cookie哈希: {current_hash[:16]}...")
            return
        
        # Check if cookies changed
        if current_hash != self._current_hash:
            # Cookies changed!
            self.stats["changes_detected"] += 1
            self._current_hash = current_hash
            self._last_change_time = time.time()
            
            print(f"🔄 检测到Cookie变化: {current_hash[:16]}...")
            return
        
        # Cookies haven't changed - check if we should save
        if self._last_change_time is None:
            return
        
        time_since_change = time.time() - self._last_change_time
        time_since_save = time.time() - self._last_save_time
        
        # Check if cookies are stable
        if time_since_change < self.stabilization_time:
            # Not stable yet
            return
        
        # Check minimum save interval
        if time_since_save < self.min_save_interval:
            # Too soon since last save
            self.stats["skipped_saves"] += 1
            return
        
        # Cookies are stable and enough time has passed - save!
        print(f"✅ Cookie已稳定 {time_since_change:.1f}秒，准备保存...")
        self._save_cookies(storage_state)
        
        # Reset change time to avoid repeated saves
        self._last_change_time = None
    
    def start(self) -> None:
        """Start monitoring in background thread"""
        if self._running:
            print("⚠️ Cookie监控已在运行")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
    
    def stop(self) -> None:
        """Stop monitoring and save current state"""
        if not self._running:
            return
        
        print("🛑 正在停止Cookie监控...")
        self._running = False
        
        if self._thread:
            self._thread.join(timeout=5.0)
        
        # Final save
        with self._lock:
            storage_state = self._get_storage_state()
            if storage_state:
                print("💾 执行最终Cookie保存...")
                self._save_cookies(storage_state)
    
    def force_save(self) -> bool:
        """Force save current cookies immediately"""
        with self._lock:
            storage_state = self._get_storage_state()
            if storage_state:
                return self._save_cookies(storage_state)
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get monitoring statistics"""
        with self._lock:
            return {
                **self.stats,
                "running": self._running,
                "current_hash": self._current_hash[:16] if self._current_hash else None,
                "time_since_last_change": time.time() - self._last_change_time if self._last_change_time else None,
                "time_since_last_save": time.time() - self._last_save_time if self._last_save_time else None
            }


__all__ = ["CookieMonitor"]
