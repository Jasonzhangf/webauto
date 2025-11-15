"""
浏览器控制器
Python核心控制部分
"""

import asyncio
import json
import threading
import time
from typing import Dict, Any, Optional, Callable
from browser_interface import create_browser, CamoufoxBrowserWrapper

class BrowserController:
    """浏览器控制器 - Python核心控制逻辑"""
    
    def __init__(self):
        self.browser: Optional[CamoufoxBrowserWrapper] = None
        self.current_page = None
        self.is_running = False
        self.callbacks = {}
        self.lock = threading.Lock()
        
        # UI连接
        self.ui_connections = []
        self.command_queue = asyncio.Queue()
        
    def start_browser(self, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """启动浏览器"""
        try:
            with self.lock:
                if self.browser is not None:
                    return {'success': False, 'error': '浏览器已运行'}
                
                self.browser = create_browser(config or {'headless': False})
                self.is_running = True
                
                # 启动命令处理循环
                threading.Thread(target=self._command_loop, daemon=True).start()
                
                return {
                    'success': True,
                    'browser_id': id(self.browser),
                    'status': 'started'
                }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def stop_browser(self) -> Dict[str, Any]:
        """停止浏览器"""
        try:
            with self.lock:
                if self.browser is None:
                    return {'success': False, 'error': '浏览器未运行'}
                
                self.browser.close()
                self.browser = None
                self.current_page = None
                self.is_running = False
                
                return {'success': True, 'status': 'stopped'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def navigate_to(self, url: str) -> Dict[str, Any]:
        """导航到URL"""
        try:
            if not self.browser:
                return {'success': False, 'error': '浏览器未启动'}
            
            page = self.browser.goto(url)
            self.current_page = page
            
            # 等待页面加载
            time.sleep(2)
            
            page_info = {
                'title': page.title(),
                'url': page.url(),
                'timestamp': time.time()
            }
            
            # 通知UI更新
            self._notify_ui('page_loaded', page_info)
            
            return {
                'success': True,
                'page_info': page_info
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def click_element(self, selector: str) -> Dict[str, Any]:
        """点击元素"""
        try:
            if not self.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            # 获取元素信息
            element_info = self._get_element_info(selector)
            if not element_info['exists']:
                return {'success': False, 'error': f'元素不存在: {selector}'}
            
            self.current_page.click(selector)
            time.sleep(0.5)  # 等待响应
            
            return {
                'success': True,
                'element': element_info
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def fill_input(self, selector: str, value: str) -> Dict[str, Any]:
        """填写输入框"""
        try:
            if not self.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            self.current_page.fill(selector, value)
            time.sleep(0.3)
            
            return {
                'success': True,
                'selector': selector,
                'value': value
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_page_info(self) -> Dict[str, Any]:
        """获取页面信息"""
        try:
            if not self.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            return {
                'success': True,
                'title': self.current_page.title(),
                'url': self.current_page.url(),
                'timestamp': time.time()
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def take_screenshot(self, filename: str = None) -> Dict[str, Any]:
        """截图"""
        try:
            if not self.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            if not filename:
                filename = f'screenshot_{int(time.time())}.png'
            
            self.current_page.screenshot(filename, full_page=True)
            
            return {
                'success': True,
                'filename': filename
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _get_element_info(self, selector: str) -> Dict[str, Any]:
        """获取元素信息"""
        try:
            if not self.current_page:
                return {'exists': False}
            
            # 简化的元素检查
            text = self.current_page.text_content(selector)
            return {
                'exists': True,
                'selector': selector,
                'text': text[:100] if text else '',
                'timestamp': time.time()
            }
        except Exception:
            return {'exists': False, 'selector': selector}
    
    def _command_loop(self):
        """命令处理循环"""
        while self.is_running:
            try:
                # 这里可以添加异步命令处理
                time.sleep(0.1)
            except Exception as e:
                print(f"命令循环错误: {e}")
    
    def _notify_ui(self, event_type: str, data: Dict[str, Any]):
        """通知UI更新"""
        for conn in self.ui_connections:
            try:
                conn.send_event(event_type, data)
            except Exception as e:
                print(f"UI通知失败: {e}")
    
    def register_ui_connection(self, connection):
        """注册UI连接"""
        self.ui_connections.append(connection)
    
    def unregister_ui_connection(self, connection):
        """取消注册UI连接"""
        if connection in self.ui_connections:
            self.ui_connections.remove(connection)
    
    def execute_script(self, script: str) -> Dict[str, Any]:
        """执行JavaScript"""
        try:
            if not self.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            # 这里需要扩展CamoufoxPageWrapper以支持JavaScript执行
            # 暂时返回基本信息
            return {
                'success': True,
                'script': script,
                'note': 'JavaScript执行需要在CamoufoxPageWrapper中实现evaluate方法'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

# 全局控制器实例
global_controller = BrowserController()

def get_controller() -> BrowserController:
    """获取全局浏览器控制器"""
    return global_controller
