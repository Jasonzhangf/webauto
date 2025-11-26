"""
Camoufox 中文浏览器使用演示
展示如何正确启动和使用支持中文的 Camoufox 浏览器
"""

from camoufox_browser import CamoufoxChineseBrowser
import time

def demo_basic_usage():
    """基本使用演示"""
    print('=== 基本使用演示 ===')
    
    # 使用上下文管理器，自动处理启动和关闭
    with CamoufoxChineseBrowser(headless=False) as browser:
        page = browser.new_page()
        
        # 访问百度
        page.goto('https://www.baidu.com')
        print(f'百度标题: {page.title()}')
        
        # 测试中文输入
        search_input = page.locator('#kw')
        search_input.fill('Camoufox 中文测试')
        print('已输入中文搜索词')
        
        time.sleep(3)
    
    print('浏览器已自动关闭')

def demo_multiple_pages():
    """多页面演示"""
    print('\n=== 多页面演示 ===')
    
    with CamoufoxChineseBrowser(headless=False) as browser:
        # 第一个页面 - 百度
        page1 = browser.new_page()
        page1.goto('https://www.baidu.com')
        print(f'页面1: {page1.title()}')
        
        # 第二个页面 - 知乎
        page2 = browser.new_page()
        page2.goto('https://www.zhihu.com')
        print(f'页面2: {page2.title()}')
        
        time.sleep(2)
        
        # 切换回第一个页面
        page1.bring_to_front()
        time.sleep(2)

def demo_quick_test():
    """快速测试演示"""
    print('\n=== 快速测试演示 ===')
    
    browser = CamoufoxChineseBrowser(headless=False)
    browser.start()
    
    try:
        # 测试多个网站
        sites = [
            'https://www.baidu.com',
            'https://weibo.com',
            'https://www.zhihu.com'
        ]
        
        for site in sites:
            browser.quick_test(site, wait_time=1)
            print(f'✓ {site} 测试完成')
    
    finally:
        browser.stop()

if __name__ == '__main__':
    print('Camoufox 中文浏览器演示开始...')
    
    demo_basic_usage()
    demo_multiple_pages()
    demo_quick_test()
    
    print('\n所有演示完成！')
