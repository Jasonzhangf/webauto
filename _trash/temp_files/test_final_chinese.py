from playwright.sync_api import sync_playwright
from camoufox import NewBrowser
import time

def test_final_chinese():
    print('启动 Camoufox 浏览器，完整中文支持...')
    
    with sync_playwright() as p:
        browser = NewBrowser(
            playwright=p,
            headless=False,
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
            args=[
                '--lang=zh-CN',
                '--accept-lang=zh-CN,zh;q=0.9,en;q=0.8',
                '--force-charset=UTF-8',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        )
        page = browser.new_page()
        
        # 设置用户代理和额外配置
        page.set_extra_http_headers({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        })
        
        # 注入脚本来确保语言设置
        page.add_init_script("""
            Object.defineProperty(navigator, 'language', {
                get: function() { return 'zh-CN'; }
            });
            Object.defineProperty(navigator, 'languages', {
                get: function() { return ['zh-CN', 'zh', 'en']; }
            });
        """)
        
        print('正在访问 baidu.com...')
        page.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
        
        # 检查设置
        charset = page.evaluate('document.characterSet')
        language = page.evaluate('navigator.language')
        languages = page.evaluate('navigator.languages')
        timezone = page.evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone')
        
        print(f'页面字符集: {charset}')
        print(f'浏览器语言: {language}')
        print(f'支持的语言: {languages}')
        print(f'时区: {timezone}')
        
        # 尝试输入中文
        print('尝试在搜索框输入中文...')
        search_input = page.locator('#kw')
        search_input.fill('中文测试')
        search_value = search_input.input_value()
        print(f'搜索框内容: {search_value}')
        
        print('保持浏览器打开 8 秒，检查中文显示是否正常...')
        time.sleep(8)
        
        print('测试完成')
        browser.close()

test_final_chinese()
