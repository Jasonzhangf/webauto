from browser_interface import create_browser, save_cookies

print("=== 测试Cookie保存功能 ===")

browser = create_browser({'headless': False})

try:
    with browser:
        page = browser.goto('https://www.baidu.com')
        print(f"访问成功: {page.title()}")
        
        save_result = save_cookies(browser, 'baidu')
        print(f"Cookie保存: {'成功' if save_result['success'] else '失败'}")
        if save_result['success']:
            print(f"Cookie数量: {save_result['cookie_count']}")
        else:
            print(f"错误: {save_result['error']}")
            
except Exception as e:
    print(f"测试失败: {e}")

print("=== 测试完成 ===")
