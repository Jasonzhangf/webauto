from playwright.sync_api import sync_playwright
from camoufox import NewBrowser, launch_options
import time

def test_with_launch_options():
    print('使用 Camoufox launch_options 测试...')
    
    # 创建自定义启动选项
    custom_launch = launch_options(
        locale='zh-CN',
        timezone_id='Asia/Shanghai',
        args=[
            '--lang=zh-CN',
            '--accept-lang=zh-CN,zh;q=0.9,en;q=0.8',
            '--force-charset=UTF-8'
        ]
    )
    
    with sync_playwright() as p:
        browser = NewBrowser(
            playwright=p,
            headless=False,
            launch_options=custom_launch
        )
        page = browser.new_page()
        
        print('正在访问 baidu.com...')
        page.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
        
        # 检查各种设置
        charset = page.evaluate('document.characterSet')
        language = page.evaluate('navigator.language')
        timezone = page.evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone')
        
        print(f'页面字符集: {charset}')
        print(f'浏览器语言: {language}')
        print(f'时区: {timezone}')
        
        print('保持浏览器打开 5 秒，检查中文显示...')
        time.sleep(5)
        
        print('测试完成')
        browser.close()

test_with_launch_options()
