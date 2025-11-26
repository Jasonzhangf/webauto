from browser_interface import stealth_mode

with stealth_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print('隐匿模式测试成功:', page.title())
