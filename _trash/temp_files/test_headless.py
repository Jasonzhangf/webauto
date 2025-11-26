from browser_interface import headless_mode

with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print('无头模式测试成功:', page.title())
