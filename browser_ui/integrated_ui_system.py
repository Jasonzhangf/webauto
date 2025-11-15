"""
集成UI系统
结合悬浮UI和页面注入功能
"""

import threading
import time
from typing import Dict, Any, Optional
from browser_control.browser_controller import get_controller, BrowserController
from browser_ui.page_injection import PageInjector

class IntegratedUISystem:
    """集成UI系统管理器"""
    
    def __init__(self):
        self.controller = get_controller()
        self.page_injector = PageInjector(self.controller)
        self.is_running = False
    
    def start_system(self) -> Dict[str, Any]:
        """启动集成UI系统"""
        try:
            if self.is_running:
                return {'success': False, 'error': 'UI系统已在运行'}
            
            # 启动浏览器
            browser_result = self.controller.start_browser({'headless': False})
            if not browser_result['success']:
                return browser_result
            
            self.is_running = True
            
            return {
                'success': True,
                'message': 'UI系统启动成功',
                'browser_id': browser_result['browser_id']
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def stop_system(self) -> Dict[str, Any]:
        """停止集成UI系统"""
        try:
            if not self.is_running:
                return {'success': False, 'error': 'UI系统未运行'}
            
            # 停止浏览器
            self.controller.stop_browser()
            
            self.is_running = False
            
            return {'success': True, 'message': 'UI系统已停止'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def inject_page_ui(self) -> Dict[str, Any]:
        """在当前页面注入UI"""
        try:
            if not self.controller.current_page:
                return {'success': False, 'error': '没有活动页面'}
            
            # 注入UI
            injection_result = self.page_injector.inject_ui(self.controller.current_page)
            
            # 设置元素选择器
            picker_result = self.page_injector.setup_element_picker(self.controller.current_page)
            
            return {
                'success': True,
                'injection_result': injection_result,
                'picker_result': picker_result
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # 已移除独立悬浮UI（tkinter）。推荐使用页面注入悬浮菜单。
    
    def get_system_status(self) -> Dict[str, Any]:
        """获取系统状态"""
        return {
            'ui_system_running': self.is_running,
            'browser_running': self.controller.is_running,
            'has_current_page': self.controller.current_page is not None,
            'ui_connections': len(self.controller.ui_connections)
        }

def start_integrated_ui() -> IntegratedUISystem:
    """启动集成UI系统"""
    system = IntegratedUISystem()
    result = system.start_system()
    
    if result['success']:
        print("✅ 集成UI系统启动成功")
        print("📋 使用说明:")
        print("   - 悬浮窗口: 控制浏览器基础操作")
        print("   - 页面注入: 在网页右上角显示控制面板")
        print("   - 元素选择: 鼠标悬停查看元素，点击获取选择器")
        print("\n⚡ 快捷功能:")
        print("   - 输入URL后点击'前往'导航")
        print("   - 使用选择器定位页面元素")
        print("   - 支持点击、填写、截图等操作")
        print("   - 页面内可直接执行JavaScript")
        
        return system
    else:
        print(f"❌ 集成UI系统启动失败: {result['error']}")
        return None

def demo_integration():
    """演示集成功能"""
    print("🚀 启动WebAuto集成UI系统演示...")
    
    system = start_integrated_ui()
    if not system:
        return
    
    try:
        # 等待UI启动
        time.sleep(3)
        
        # 导航到百度
        print("\n🌐 导航到百度...")
        nav_result = system.controller.navigate_to('https://www.baidu.com')
        if nav_result['success']:
            print("✅ 导航成功")
            time.sleep(3)
            
            # 注入页面UI
            print("\n💉 注入页面UI...")
            injection_result = system.inject_page_ui()
            if injection_result['success']:
                print("✅ 页面UI注入成功")
                print(f"   注入状态: {injection_result['injection_result']}")
                print(f"   选择器状态: {injection_result['picker_result']}")
            else:
                print(f"❌ 页面UI注入失败: {injection_result['error']}")
        
        # 保持运行
        print("\n⏳ 系统运行中，请在悬浮窗口和页面中进行操作...")
        print("   按 Ctrl+C 停止系统")
        
        while system.is_running:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 用户中断，正在停止系统...")
    finally:
        system.stop_system()
        print("✅ 系统已停止")

if __name__ == '__main__':
    demo_integration()
