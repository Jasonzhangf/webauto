from browser_interface import create_browser, load_cookies

print("=== 测试Cookie加载功能 ===")

browser = create_browser({'headless': False})

try:
    with browser:
        # 先访问百度
        page = browser.goto('https://www.baidu.com')
        print(f"访问成功: {page.title()}")
        
        # 加载Cookie
        load_result = load_cookies(browser, 'baidu', 'https://www.baidu.com')
        print(f"Cookie加载: {'成功' if load_result['success'] else '失败'}")
        if load_result['success']:
            print(f"加载数量: {load_result['loaded']}")
        else:
            print(f"错误: {load_result['error']}")
            
except Exception as e:
    print(f"测试失败: {e}")

print("=== 测试完成 ===")
