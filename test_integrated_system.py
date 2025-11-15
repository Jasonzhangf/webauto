#!/usr/bin/env python3
"""
集成系统测试
"""

import time
import sys
import os

# 添加路径
sys.path.append(os.getcwd())

from browser_control.browser_controller import get_controller
from browser_ui.integrated_ui_system import start_integrated_ui

def test_controller():
    print("=== 测试浏览器控制器 ===")
    
    controller = get_controller()
    
    # 测试启动浏览器
    print("1. 启动浏览器...")
    start_result = controller.start_browser({'headless': False})
    print(f"   启动结果: {start_result}")
    
    if not start_result['success']:
        print(f"   启动失败: {start_result['error']}")
        return False
    
    time.sleep(3)
    
    # 测试导航
    print("2. 导航到百度...")
    nav_result = controller.navigate_to('https://www.baidu.com')
    print(f"   导航结果: {nav_result.get('success', False)}")
    
    if nav_result['success']:
        page_info = nav_result['page_info']
        print(f"   页面标题: {page_info.get('title', 'N/A')}")
        print(f"   页面URL: {page_info.get('url', 'N/A')}")
    
    time.sleep(5)
    
    # 测试元素操作
    print("3. 测试元素操作...")
    click_result = controller.click_element('#kw')  # 百度搜索框
    print(f"   点击结果: {click_result.get('success', False)}")
    
    if click_result['success']:
        fill_result = controller.fill_input('#kw', 'WebAuto 测试')
        print(f"   填写结果: {fill_result.get('success', False)}")
    
    time.sleep(2)
    
    # 测试截图
    print("4. 测试截图...")
    screenshot_result = controller.take_screenshot('test_integrated.png')
    print(f"   截图结果: {screenshot_result.get('success', False)}")
    
    if screenshot_result['success']:
        print(f"   截图文件: {screenshot_result.get('filename', 'N/A')}")
    
    # 停止浏览器
    print("5. 停止浏览器...")
    stop_result = controller.stop_browser()
    print(f"   停止结果: {stop_result.get('success', False)}")
    
    return True

def test_ui_integration():
    print("\n=== 测试UI集成 ===")
    
    try:
        system = start_integrated_ui()
        if system:
            print("✅ UI系统启动成功")
            
            # 等待用户操作
            print("\n⏳ 等待用户操作，按 Enter 继续...")
            input()
            
            # 停止系统
            system.stop_system()
            print("✅ UI系统已停止")
            
            return True
        else:
            print("❌ UI系统启动失败")
            return False
            
    except Exception as e:
        print(f"❌ UI测试失败: {e}")
        return False

def main():
    print("🚀 WebAuto 集成系统测试")
    print("=" * 40)
    
    # 选择测试模式
    print("\n请选择测试模式:")
    print("1. 仅测试浏览器控制器")
    print("2. 测试完整UI集成")
    print("3. 运行完整演示")
    
    try:
        choice = input("\n请输入选择 (1/2/3): ").strip()
        
        if choice == '1':
            success = test_controller()
            print(f"\n{'✅' if success else '❌'} 控制器测试: {'成功' if success else '失败'}")
            
        elif choice == '2':
            success = test_ui_integration()
            print(f"\n{'✅' if success else '❌'} UI集成测试: {'成功' if success else '失败'}")
            
        elif choice == '3':
            # 运行完整演示
            from browser_ui.integrated_ui_system import demo_integration
            demo_integration()
            
        else:
            print("❌ 无效选择")
            return
            
    except KeyboardInterrupt:
        print("\n🛑 用户中断测试")
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
