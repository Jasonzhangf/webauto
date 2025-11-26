from camoufox_chinese_setup import launch_camoufox_chinese, setup_chinese_page
import time

def test_setup():
    print('测试标准化中文配置...')
    
    # 启动浏览器
    playwright, browser = launch_camoufox_chinese(headless=False)
    
    try:
        page = browser.new_page()
        setup_chinese_page(page)
        
        page.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
        
        # 快速检查
        charset = page.evaluate('document.characterSet')
        language = page.evaluate('navigator.language')
        print(f'字符集: {charset}, 语言: {language}')
        
        time.sleep(3)
        
    finally:
        browser.close()
        playwright.stop()
    
    print('测试完成')

test_setup()
