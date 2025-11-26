from browser_interface import create_browser

with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print('基础测试成功:', page.title())
