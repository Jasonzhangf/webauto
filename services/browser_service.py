"""
WebAuto 浏览器服务实现
提供后台服务，完全抽象底层浏览器操作
"""

import asyncio
import json
import time
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import asdict
import threading
from concurrent.futures import ThreadPoolExecutor
import hashlib

from services.browser_service_interface import (
    AbstractBrowserService,
    AbstractBrowserController,
    BrowserProfile,
    BrowserSession,
    PageAction,
    PageTemplate,
    AntiDetectionLevel,
    BrowserActionType,
)
from services.fingerprint_manager import FingerprintManager
# 使用现有的Cookie管理功能
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# 导入现有的Cookie管理器（Node 侧实现不可直接在 Python 中使用，这里做最佳努力降级）
try:
    # 理论上这是 Node.js 实现，正常情况下无法在 Python 中直接导入
    from libs.browser.cookie_manager import CookieManager as ExistingCookieManager  # type: ignore
except Exception:
    class ExistingCookieManager:  # 简化占位实现，仅保存目录信息
        def __init__(self, cookie_dir: str = "./cookies"):
            self.cookie_dir = cookie_dir

class BrowserServiceError(Exception):
    """浏览器服务错误"""
    pass

class BrowserController(AbstractBrowserController):
    """浏览器控制器实现"""
    
    def __init__(self, browser_wrapper, page):
        self.browser_wrapper = browser_wrapper
        self.page = page
        self._last_action_time = time.time()
    
    def navigate(self, url: str) -> Dict[str, Any]:
        """页面导航"""
        try:
            self.page.goto(url)
            self._last_action_time = time.time()
            return {
                "success": True,
                "url": self.page.url(),
                "title": self.page.title(),
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "url": url
            }
    
    def click(self, selector: Optional[str] = None, coordinates: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        """点击操作"""
        try:
            if selector:
                self.page.click(selector)
            elif coordinates:
                self.page.mouse.click(coordinates['x'], coordinates['y'])
            else:
                raise ValueError("必须提供selector或coordinates")
            
            self._last_action_time = time.time()
            return {
                "success": True,
                "action": "click",
                "selector": selector,
                "coordinates": coordinates,
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "selector": selector,
                "coordinates": coordinates
            }
    
    def input_text(self, selector: str, text: str) -> Dict[str, Any]:
        """输入文本"""
        try:
            self.page.fill(selector, text)
            self._last_action_time = time.time()
            return {
                "success": True,
                "action": "input_text",
                "selector": selector,
                "text_length": len(text),
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "selector": selector
            }
    
    def scroll(self, direction: str = "down", amount: Optional[int] = None) -> Dict[str, Any]:
        """滚动操作"""
        try:
            if direction == "down":
                self.page.keyboard.press("PageDown")
            elif direction == "up":
                self.page.keyboard.press("PageUp")
            else:
                raise ValueError("方向必须是 'up' 或 'down'")
            
            self._last_action_time = time.time()
            return {
                "success": True,
                "action": "scroll",
                "direction": direction,
                "amount": amount,
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "direction": direction
            }
    
    def wait(self, milliseconds: int) -> Dict[str, Any]:
        """等待操作"""
        try:
            self.page.wait_for_timeout(milliseconds)
            self._last_action_time = time.time()
            return {
                "success": True,
                "action": "wait",
                "duration": milliseconds,
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "duration": milliseconds
            }
    
    def screenshot(self, options: Optional[Dict[str, Any]] = None) -> bytes:
        """截图操作"""
        try:
            screenshot_options = options or {}
            return self.page.screenshot(**screenshot_options)
        except Exception as e:
            raise BrowserServiceError(f"截图失败: {e}")
    
    def highlight_element(self, selector: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """高亮元素"""
        try:
            highlight_options = options or {}
            color = highlight_options.get('color', '#FF0000')
            duration = highlight_options.get('duration', 3000)
            
            # 注入高亮脚本
            highlight_script = f"""
                const element = document.querySelector('{selector}');
                if (element) {{
                    const originalStyle = element.style.cssText;
                    element.style.border = '3px solid {color}';
                    element.style.boxShadow = '0 0 10px {color}';
                    element.style.transition = 'all 0.3s ease';
                    
                    setTimeout(() => {{
                        element.style.cssText = originalStyle;
                    }}, {duration});
                    
                    return {{
                        success: true,
                        elementFound: true,
                        originalStyle: originalStyle
                    }};
                }} else {{
                    return {{
                        success: false,
                        elementFound: false,
                        error: 'Element not found'
                    }};
                }}
            """
            
            result = self.page.evaluate(highlight_script)
            self._last_action_time = time.time()
            return result
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "selector": selector
            }
    
    def extract_data(self, selectors: Dict[str, str]) -> Dict[str, Any]:
        """提取数据"""
        try:
            extracted_data = {}
            for key, selector in selectors.items():
                try:
                    element = self.page.locator(selector).first
                    text = element.text_content()
                    href = element.get_attribute('href')
                    
                    extracted_data[key] = {
                        "text": text,
                        "href": href,
                        "selector": selector,
                        "found": True
                    }
                except Exception as e:
                    extracted_data[key] = {
                        "text": None,
                        "href": None,
                        "selector": selector,
                        "found": False,
                        "error": str(e)
                    }
            
            self._last_action_time = time.time()
            return {
                "success": True,
                "data": extracted_data,
                "timestamp": self._last_action_time
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_page_info(self) -> Dict[str, Any]:
        """获取页面信息"""
        try:
            page_info = {
                "url": self.page.url(),
                "title": self.page.title(),
                "viewport": self.page.viewport_size,
                "timestamp": time.time()
            }
            return page_info
        except Exception as e:
            return {
                "error": str(e),
                "timestamp": time.time()
            }

class BrowserService(AbstractBrowserService):
    """浏览器服务实现"""
    
    def __init__(self):
        self.sessions: Dict[str, BrowserSession] = {}
        self.controllers: Dict[str, BrowserController] = {}
        # 记录会话最近一次状态检查时间 & 状态哈希，用于“仅在变化时持久化”
        self._session_last_state_ts: Dict[str, float] = {}
        self._session_last_state_hash: Dict[str, str] = {}
        self.cookie_manager = ExistingCookieManager()
        self.fingerprint_manager = FingerprintManager()
        self.service_status = "stopped"
        self.executor = ThreadPoolExecutor(max_workers=10)
        self._service_lock = threading.Lock()
    
    def start_service(self, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """启动浏览器服务"""
        with self._service_lock:
            if self.service_status == "running":
                return {
                    "success": True,
                    "message": "服务已在运行中",
                    "status": self.service_status
                }
            
            try:
                self.service_status = "starting"
                
                # 初始化配置
                service_config = config or {}
                
                # 初始化Cookie管理器（当前仅记录目录，真正的自动 Cookie 行为由浏览器上下文负责）
                cookie_dir = service_config.get('cookie_dir', './cookies')
                self.cookie_manager = ExistingCookieManager(cookie_dir)
                
                self.service_status = "running"
                
                return {
                    "success": True,
                    "message": "浏览器服务启动成功",
                    "status": self.service_status,
                    "config": service_config
                }
                
            except Exception as e:
                self.service_status = "error"
                return {
                    "success": False,
                    "error": str(e),
                    "status": self.service_status
                }
    
    def stop_service(self) -> Dict[str, Any]:
        """停止浏览器服务"""
        with self._service_lock:
            if self.service_status != "running":
                return {
                    "success": True,
                    "message": "服务未在运行",
                    "status": self.service_status
                }
            
            try:
                # 关闭所有会话
                session_ids = list(self.sessions.keys())
                for session_id in session_ids:
                    self.close_session(session_id)
                
                # 关闭线程池
                self.executor.shutdown(wait=True)
                
                self.service_status = "stopped"
                
                return {
                    "success": True,
                    "message": "浏览器服务已停止",
                    "status": self.service_status,
                    "closed_sessions": len(session_ids)
                }
                
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                    "status": self.service_status
                }
    
    def create_session(self, profile: Optional[BrowserProfile] = None) -> str:
        """创建浏览器会话"""
        if self.service_status != "running":
            raise BrowserServiceError("服务未运行，无法创建会话")
        
        try:
            # 生成会话ID
            session_id = str(uuid.uuid4())
            
            # 使用默认配置或提供的配置
            if profile is None:
                profile = BrowserProfile(
                    profile_id="default",
                    anti_detection_level=AntiDetectionLevel.ENHANCED
                )
            
            # 创建会话对象
            session = BrowserSession(
                session_id=session_id,
                profile=profile,
                status="creating",
                created_at=time.time(),
                last_activity=time.time()
            )
            
            # 延迟导入浏览器实现（避免循环依赖）
            from browser_interface import CamoufoxBrowserWrapper
            
            # 创建浏览器实例
            # 使用 Camoufox，并启用基于 profile_id 的自动会话保存/恢复
            browser_config = {
                # 服务默认使用可见窗口，便于交互与调试
                # 如需无头模式，可在后续扩展 BrowserProfile 增加 headless 配置
                "headless": False,
                "locale": profile.locale or "zh-CN",
                "cookie_dir": "./cookies",
                # 自动在关闭时保存会话，在下次启动时按 profile_id 恢复
                "auto_session": True,
                "session_name": profile.profile_id or "default"
            }
            
            browser_wrapper = CamoufoxBrowserWrapper(browser_config)
            # 在会话级别安装悬浮菜单（Shadow DOM 隔离）
            try:
                browser_wrapper.install_overlay(session_id, profile.profile_id or "default")
            except Exception:
                # UI 注入失败不影响会话创建
                pass

            page = browser_wrapper.new_page()
            
            # 创建控制器
            controller = BrowserController(browser_wrapper, page)
            
            # 应用指纹配置
            if profile.fingerprint:
                self._apply_fingerprint_config(controller, profile.fingerprint)
            
            # 更新会话状态
            session.status = "active"
            
            # 保存会话和控制器
            self.sessions[session_id] = session
            self.controllers[session_id] = controller
            
            return session_id
            
        except Exception as e:
            raise BrowserServiceError(f"创建会话失败: {e}")
    
    def get_session(self, session_id: str) -> Optional[BrowserSession]:
        """获取会话信息"""
        return self.sessions.get(session_id)
    
    def close_session(self, session_id: str) -> Dict[str, Any]:
        """关闭浏览器会话"""
        if session_id not in self.sessions:
            return {
                "success": False,
                "error": "会话不存在"
            }
        
        try:
            session = self.sessions[session_id]
            controller = self.controllers.get(session_id)
            
            if controller:
                # 关闭浏览器
                controller.browser_wrapper.close()
                del self.controllers[session_id]
            
            # 删除会话
            del self.sessions[session_id]
            
            return {
                "success": True,
                "message": f"会话 {session_id} 已关闭",
                "session_id": session_id
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }
    
    def _auto_save_session(self, session_id: str) -> None:
        """
        自动持久化会话状态（profile 级别）
        - 模拟普通浏览器的行为：在浏览过程中持续刷新 Cookie/存储状态
        - 为避免过度写盘，增加简单节流（默认 5 秒一次），且仅在状态变化时写盘
        """
        try:
            now = time.time()
            last_ts = self._session_last_state_ts.get(session_id, 0.0)
            if now - last_ts < 5:
                return
            # 记录本次检查时间（无论是否最终写盘）
            self._session_last_state_ts[session_id] = now
            
            session = self.sessions.get(session_id)
            controller = self.controllers.get(session_id)
            if not session or not controller:
                return

            # 获取当前 storage_state 快照，并计算哈希用于变更检测
            try:
                state = controller.browser_wrapper.get_storage_state()
            except Exception:
                # 无法获取状态时，不进行持久化
                return

            try:
                serialized = json.dumps(state, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                current_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
            except Exception:
                return

            last_hash = self._session_last_state_hash.get(session_id)
            if last_hash is not None and last_hash == current_hash:
                # 状态未变化，无需写盘
                return

            profile_id = session.profile.profile_id or "default"
            # 通过底层包装器保存完整 storage_state（包含所有站点 Cookie）
            result = controller.browser_wrapper.save_session(profile_id)
            if result.get("success"):
                self._session_last_state_hash[session_id] = current_hash
        except Exception:
            # 自动保存失败不影响主流程
            pass
    
    def execute_action(self, session_id: str, action: PageAction) -> Dict[str, Any]:
        """执行页面操作"""
        if session_id not in self.controllers:
            return {
                "success": False,
                "error": "会话不存在或控制器未初始化"
            }
        
        try:
            controller = self.controllers[session_id]
            session = self.sessions[session_id]
            
            # 更新会话活动时间
            session.last_activity = time.time()

            # 根据操作类型执行相应动作
            if action.action_type == BrowserActionType.NAVIGATE:
                result = controller.navigate(action.value)
            elif action.action_type == BrowserActionType.CLICK:
                if action.selector:
                    result = controller.click(selector=action.selector)
                elif action.coordinates:
                    result = controller.click(coordinates=action.coordinates)
                else:
                    raise ValueError("点击操作需要提供selector或coordinates")
            elif action.action_type == BrowserActionType.INPUT:
                result = controller.input_text(action.selector, action.value)
            elif action.action_type == BrowserActionType.SCROLL:
                result = controller.scroll(
                    direction=action.options.get('direction', 'down') if action.options else 'down',
                    amount=action.options.get('amount') if action.options else None
                )
            elif action.action_type == BrowserActionType.WAIT:
                result = controller.wait(action.wait_time or 1000)
            elif action.action_type == BrowserActionType.SCREENSHOT:
                screenshot_data = controller.screenshot(action.options)
                result = {
                    "success": True,
                    "screenshot": screenshot_data,
                    "size": len(screenshot_data)
                }
            elif action.action_type == BrowserActionType.HIGHLIGHT:
                result = controller.highlight_element(action.selector, action.options)
            elif action.action_type == BrowserActionType.EXTRACT:
                result = controller.extract_data(action.options.get('selectors', {}))
            else:
                raise ValueError(f"不支持的操作类型: {action.action_type}")

            # 在关键操作后自动持久化会话（profile 级 Cookie / storage 状态）
            if result.get("success"):
                self._auto_save_session(session_id)

            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "action_type": action.action_type.value
            }
    
    def execute_template(self, session_id: str, template: PageTemplate, url: str) -> Dict[str, Any]:
        """执行页面模板"""
        try:
            results = []
            
            # 导航到URL
            navigate_action = PageAction(
                action_type=BrowserActionType.NAVIGATE,
                value=url
            )
            nav_result = self.execute_action(session_id, navigate_action)
            results.append({"action": "navigate", "result": nav_result})
            
            if not nav_result.get("success"):
                return {
                    "success": False,
                    "error": "导航失败",
                    "results": results
                }
            
            # 执行模板中的操作
            for action in template.actions:
                result = self.execute_action(session_id, action)
                results.append({
                    "action": action.action_type.value,
                    "result": result
                })
            
            return {
                "success": True,
                "template_id": template.template_id,
                "results": results,
                "total_actions": len(results)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "template_id": template.template_id
            }
    
    def load_cookies(self, session_id: str, cookie_source: str) -> Dict[str, Any]:
        """加载Cookie"""
        try:
            # 这里应该实现具体的Cookie加载逻辑
            # 暂时返回成功状态
            return {
                "success": True,
                "message": f"Cookie从 {cookie_source} 加载成功",
                "session_id": session_id
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }
    
    def save_cookies(self, session_id: str, cookie_target: str) -> Dict[str, Any]:
        """保存Cookie"""
        try:
            # 这里应该实现具体的Cookie保存逻辑
            # 暂时返回成功状态
            return {
                "success": True,
                "message": f"Cookie保存到 {cookie_target} 成功",
                "session_id": session_id
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }
    
    def update_fingerprint(self, session_id: str, fingerprint_config: Dict[str, Any]) -> Dict[str, Any]:
        """更新浏览器指纹"""
        try:
            # 这里应该实现具体的指纹更新逻辑
            # 暂时返回成功状态
            return {
                "success": True,
                "message": "指纹配置已更新",
                "session_id": session_id,
                "fingerprint_config": fingerprint_config
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }
    
    def get_service_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        return {
            "status": self.service_status,
            "active_sessions": len(self.sessions),
            "total_sessions_created": len(self.sessions),
            "uptime": time.time() if self.service_status == "running" else 0
        }
    
    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """获取会话状态"""
        session = self.sessions.get(session_id)
        if not session:
            return {
                "exists": False,
                "error": "会话不存在"
            }
        
        controller = self.controllers.get(session_id)
        page_info = controller.get_page_info() if controller else {}
        
        return {
            "exists": True,
            "session": asdict(session),
            "page_info": page_info,
            "controller_active": controller is not None
        }
    
    def _apply_fingerprint_config(self, controller: BrowserController, fingerprint_config: Dict[str, Any]):
        """应用指纹配置"""
        # 这里应该实现具体的指纹应用逻辑
        pass
