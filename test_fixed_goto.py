"""
测试修复后的 goto 方法
"""

from browser_interface import create_browser
import time

def test_fixed_goto():
    print("=== 测试修复后的 goto 方法 ===")
    
    with create_browser() as browser:
        print("1. 浏览器启动完成")
        
        # 检查浏览器状态
        status = browser.get_status()
        print(f"2. 浏览器状态: {status}")
        
        # 测试 goto 方法
        print("3. 调用 browser.goto()")
        page = browser.goto('https://www.baidu.com')
        
        print("4. goto 调用完成")
        print(f"   - 页面标题: {page.title()}")
        
        try:
            page_url = page.url()
            print(f"   - 页面URL: {page_url}")
        except Exception as e:
            print(f"   - 获取URL失败: {e}")
        
        # 检查浏览器状态
        status_after = browser.get_status()
        print(f"5. 访问后浏览器状态: {status_after}")
        
        # 测试再次调用
        print("6. 再次调用 browser.goto()")
        page2 = browser.goto('https://weibo.com')
        
        print("7. 第二次 goto 完成")
        try:
            print(f"   - 第二个页面标题: {page2.title()}")
        except Exception as e:
            print(f"   - 第二个页面标题获取失败: {e}")
        
        # 检查页面关系
        is_same = page is page2
        print(f"8. 页面是否相同: {is_same}")
        
        print("9. 测试完成 - 应该只有一个活跃页面")

if __name__ == '__main__':
    test_fixed_goto()
