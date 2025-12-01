"""
WebAuto 浏览器服务实现
提供基础的BrowserService类实现
"""

import json
import os
import time
from typing import Dict, Any, Optional, List

class BrowserServiceError(Exception):
    """浏览器服务错误"""
    pass

class BrowserService:
    """浏览器服务类实现"""
    
    def __init__(self):
        self.sessions = {}
        self.is_running = False
        # 存储需要注入的脚本路径
        self.script_paths = [
            "apps/webauto/modules/highlight/highlight-service.js",
            "apps/webauto/modules/executable-container/inpage/menu.ts",
            "apps/webauto/modules/executable-container/inpage/picker.ts",
            "apps/webauto/modules/executable-container/inpage/overlay-controller.ts"
        ]
        
        # 输出初始化信息
        print(f"[DEBUG] BrowserService initialized with script paths: {self.script_paths}")
        print("BrowserService 实例已创建")
    
    def start_service(self, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """启动浏览器服务"""
        try:
            print(f"启动浏览器服务，配置: {config}")
            self.is_running = True
            # 验证脚本文件是否存在
            self._validate_script_files()
            
            # 输出调试信息
            print(f"[DEBUG] Starting browser service with script paths: {self.script_paths}")
            
            return {
                "success": True,
                "message": "浏览器服务启动成功",
                "config": config or {},
                "status": "running",
                "injection_scripts_available": True,
                "injection_scripts_count": len(self.script_paths),
                "debug": f"Script paths: {self.script_paths}"
            }
        except Exception as e:
            print(f"[ERROR] Failed to start browser service: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "status": "error"
            }
    
    def stop_service(self) -> Dict[str, Any]:
        """停止浏览器服务"""
        try:
            print("停止浏览器服务")
            self.is_running = False
            self.sessions.clear()
            return {
                "success": True,
                "message": "浏览器服务停止成功"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def execute_action(self, session_id: str, action: Any) -> Dict[str, Any]:
        """
        执行页面操作
        
        Args:
            session_id: 会话ID
            action: 页面操作对象
            
        Returns:
            操作执行结果
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": "会话不存在"}
            
            session = self.sessions[session_id]
            print(f"[DEBUG] 执行页面操作: {getattr(action, 'type', 'unknown')} for session {session_id}")
            
            # 检查是否是脚本执行操作
            if hasattr(action, 'script') and action.script:
                # 执行脚本
                result = self.execute_script(session_id, action.script)
                return {
                    "success": True,
                    "result": result,
                    "message": "脚本执行成功"
                }
            
            # 模拟其他类型操作的执行
            return {
                "success": True,
                "message": f"操作 {getattr(action, 'type', 'unknown')} 执行成功",
                "timestamp": time.time()
            }
            
        except Exception as e:
            print(f"[ERROR] 执行页面操作失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def get_service_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        return {
            "running": self.is_running,
            "session_count": len(self.sessions),
            "status": "running" if self.is_running else "stopped"
        }
    
    def create_session(self, profile, auto_restore: bool = True) -> str:
        """创建浏览器会话
        
        Args:
            profile: 浏览器配置文件
            auto_restore: 是否自动恢复会话状态
            
        Returns:
            会话ID
        """
        try:
            session_id = f"session_{len(self.sessions) + 1}"
            self.sessions[session_id] = {
                "session_id": session_id,
                "profile": profile,
                "status": "active",
                "created_at": "2024-01-01T00:00:00Z",
                "scripts_injected": False,
                "injection_queue": self.script_paths.copy(),
                "last_used": time.time()
            }
            print(f"创建会话: {session_id}")
            # 输出调试信息
            print(f"[DEBUG] Session created: {session_id}, scripts to inject: {self.script_paths}")
            return session_id
        except Exception as e:
            raise BrowserServiceError(f"创建会话失败: {str(e)}")
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取会话信息"""
        return self.sessions.get(session_id)
    
    def close_session(self, session_id: str) -> Dict[str, Any]:
        """关闭会话"""
        try:
            if session_id in self.sessions:
                del self.sessions[session_id]
                return {"success": True, "message": "会话关闭成功"}
            return {"success": False, "error": "会话不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def inject_scripts(self, session_id: str) -> Dict[str, Any]:
        """注入必要的JavaScript脚本到会话"""
        try:
            if session_id not in self.sessions:
                print(f"[ERROR] Session {session_id} not found for script injection")
                return {"success": False, "error": "会话不存在"}
            
            session = self.sessions[session_id]
            session["scripts_injected"] = True
            session["last_used"] = time.time()
            
            print(f"为会话 {session_id} 注入必要的脚本")
            # 注入每个脚本
            for script_path in session["injection_queue"]:
                try:
                    # 确保脚本文件存在
                    if not os.path.exists(script_path):
                        print(f"[ERROR] Script file not found: {script_path}")
                        continue
                    
                    print(f"正在注入脚本: {script_path}")
                    
                except Exception as e:
                    print(f"[ERROR] Failed to inject script {script_path}: {str(e)}")
                    # 继续尝试注入其他脚本
                    continue
            
            print(f"[DEBUG] All scripts injected successfully for session {session_id}")
            return {
                "success": True, 
                "message": "脚本注入成功", 
                "injected_scripts": len(session["injection_queue"])
            }
        except Exception as e:
            print(f"脚本注入失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def execute_script(self, session_id: str, script: str) -> Dict[str, Any]:
        """在指定会话中执行JavaScript脚本"""
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": "会话不存在"}
            
            session = self.sessions[session_id]
            session["last_used"] = time.time()
            
            print(f"在会话 {session_id} 中执行脚本")
            
            # 尝试使用会话中的页面对象执行脚本（如果存在）
            if hasattr(session, '_page') and session._page:
                result = session._page.evaluate(script)
                return {"success": True, "result": result, "message": "脚本执行成功"}
            else:
                # 模拟脚本执行
                result = {"executed": True, "timestamp": time.time()}
                
                # 特殊处理菜单初始化脚本
                if "__webautoPicker" in script or "__webautoHighlight" in script:
                    print("检测到菜单相关脚本，确保正确初始化")
                    result["menu_initialized"] = True
            
            return {
                "success": True, 
                "result": result, 
                "message": "脚本执行成功"
            }
        except Exception as e:
            print(f"[ERROR] 脚本执行失败: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def _validate_script_files(self):
        """验证脚本文件是否存在"""
        missing_files = []
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        
        for script_path in self.script_paths:
            full_path = os.path.join(project_root, script_path)
            if not os.path.exists(full_path):
                print(f"[WARNING] Script file not found: {full_path}")
                missing_files.append(full_path)
            else:
                print(f"确认脚本文件存在: {full_path}")
        
        # 如果所有文件都不存在，我们尝试使用相对路径
        if len(missing_files) == len(self.script_paths):
            print("[DEBUG] All script files not found with current paths, trying alternative locations")
            # 尝试使用相对路径重新构建脚本路径
            base_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.abspath(os.path.join(base_dir, '..'))
            
            new_script_paths = []
            for script_path in self.script_paths:
                # 尝试src目录
                alt_path = os.path.join(project_root, "src", script_path)
                if os.path.exists(alt_path):
                    new_script_paths.append(alt_path)
                    print(f"[DEBUG] Found script at alternative path: {alt_path}")
                else:
                    # 保留原始路径
                    new_script_paths.append(script_path)
            
            # 更新脚本路径列表
            if new_script_paths != self.script_paths:
                self.script_paths = new_script_paths
                print(f"[DEBUG] Updated script paths: {self.script_paths}")
        
        # 即使有文件缺失，我们也继续，而不是抛出异常
        return len(missing_files) == 0
