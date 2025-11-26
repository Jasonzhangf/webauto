from playwright.sync_api import sync_playwright

def test():
    try:
        with sync_playwright() as p:
            # 先测试标准 Playwright Firefox
            print("测试标准 Playwright Firefox...")
            browser = p.firefox.launch(headless=False)
            page = browser.new_page()
            page.goto('https://www.baidu.com')
            title = page.title()
            print(f'标准 Firefox 访问成功: {title}')
            browser.close()
            return True
    except Exception as e:
        print(f'标准 Firefox 测试失败: {e}')
        return False

if __name__ == '__main__':
    test()
