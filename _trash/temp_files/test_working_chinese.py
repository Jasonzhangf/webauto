from playwright.sync_api import sync_playwright
from camoufox import NewBrowser
import time

def test_working_chinese():
    print('启动 Camoufox 浏览器，基础中文支持...')
    
    with sync_playwright() as p:
        browser = NewBrowser(
            playwright=p,
            headless=False,
            locale='zh-CN',
            args=[
                '--lang=zh-CN',
                '--accept-lang=zh-CN,zh;q=0.9,en;q=0.8'
            ]
        )
        page = browser.new_page()
        
        # 设置 HTTP 头
        page.set_extra_http_headers({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        })
        
        print('正在访问 baidu.com...')
        page.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
        
        # 检查设置
        charset = page.evaluate('document.characterSet')
        language = page.evaluate('navigator.language')
        languages = page.evaluate('navigator.languages')
        
        print(f'页面字符集: {charset}')
        print(f'浏览器语言: {language}')
        print(f'支持的语言: {languages}')
        
        print('保持浏览器打开 5 秒，观察中文显示...')
        time.sleep(5)
        
        print('测试完成')
        browser.close()

test_working_chinese()
