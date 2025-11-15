"""
统一浏览器入口使用示例
展示所有推荐的使用方式
"""

# 统一入口导入
from browser import (
    get_browser, start_browser, quick_test,
    stealth_mode, headless_mode,
    close_all, get_manager,
    get_default_config, get_stealth_config
)

def example_basic_usage():
    """示例1: 基础使用"""
    print('=== 示例1: 基础使用 ===')
    
    # 最简单的方式
    with get_browser() as browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
    
    print('✓ 基础使用完成')

def example_quick_test():
    """示例2: 快速测试"""
    print('\n=== 示例2: 快速测试 ===')
    
    # 一行代码测试
    quick_test(headless=False, wait_time=2)
    
    # 自定义URL测试
    quick_test(url='https://weibo.com', wait_time=1)
    
    print('✓ 快速测试完成')

def example_stealth_mode():
    """示例3: 隐匿模式"""
    print('\n=== 示例3: 隐匿模式 ===')
    
    # 使用隐匿配置
    with stealth_mode(headless=False) as browser:
        page = browser.new_page()
        page.goto('https://bot.sannysoft.com/')
        print(f'反检测测试页面: {page.title()}')
        
        # 获取页面信息
        info = browser.get_page_info(page)
        print(f'页面信息: {info}')
    
    print('✓ 隐匿模式完成')

def example_headless_mode():
    """示例4: 无头模式"""
    print('\n=== 示例4: 无头模式 ===')
    
    # 无头模式适合自动化任务
    with headless_mode() as browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        title = page.title()
        print(f'无头模式获取标题: {title}')
    
    print('✓ 无头模式完成')

def example_custom_config():
    """示例5: 自定义配置"""
    print('\n=== 示例5: 自定义配置 ===')
    
    # 获取默认配置并修改
    config = get_default_config()
    config['args'].extend([
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1920,1080'
    ])
    
    with get_browser(config=config, headless=False) as browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(f'自定义配置访问: {page.title()}')
    
    print('✓ 自定义配置完成')

def example_manager_usage():
    """示例6: 管理器使用"""
    print('\n=== 示例6: 管理器使用 ===')
    
    manager = get_manager()
    
    # 获取浏览器实例
    browser = manager.get_browser(headless=False)
    
    # 检查状态
    status = manager.get_status()
    print(f'管理器状态: {status}')
    
    # 使用浏览器
    with browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(f'管理器方式: {page.title()}')
    
    print('✓ 管理器使用完成')

def example_baidu_actions():
    """示例7: 百度操作"""
    print('\n=== 示例7: 百度操作 ===')
    
    from browser import get_browser
    from libs.browser.actions import BaiduActions
    
    with get_browser(headless=False) as browser:
        page = browser.new_page()
        
        # 使用百度操作封装
        baidu = BaiduActions(page)
        baidu.home()
        baidu.search('Python 爬虫')
        
        results = baidu.get_results()
        print(f'搜索结果数量: {len(results)}')
        
        if results:
            print(f'第一个结果: {results[0].get("title", "")}')
    
    print('✓ 百度操作完成')

def example_human_behavior():
    """示例8: 人类行为模拟"""
    print('\n=== 示例8: 人类行为模拟 ===')
    
    from libs.browser.actions import HumanActions
    
    with get_browser(headless=False) as browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        
        # 模拟人类行为
        human = HumanActions(page)
        human.random_move()      # 随机鼠标移动
        human.random_delay()     # 随机延迟
        human.human_like_browse() # 模拟浏览
        
        print(f'人类行为模拟完成: {page.title()}')
    
    print('✓ 人类行为模拟完成')

def run_all_examples():
    """运行所有示例"""
    print('WebAuto 统一浏览器入口示例')
    print('=' * 50)
    
    try:
        example_basic_usage()
        example_quick_test()
        example_stealth_mode()
        example_headless_mode()
        example_custom_config()
        example_manager_usage()
        example_baidu_actions()
        example_human_behavior()
        
        print('\n' + '=' * 50)
        print('✅ 所有示例运行完成！')
        
    except Exception as e:
        print(f'\n❌ 示例运行失败: {e}')
        import traceback
        traceback.print_exc()
    
    finally:
        close_all()
        print('\n浏览器资源已清理')

if __name__ == '__main__':
    run_all_examples()
