#!/usr/bin/env python3
"""
WebAuto Cookie管理使用示例
展示如何使用Cookie功能实现无需多次登录的网页访问
"""

import time
from browser_interface import create_browser, save_cookies, load_cookies, save_session, restore_session

def example_auto_login_1688():
    """1688自动登录示例"""
    print("🎯 1688自动登录示例")
    print("=" * 50)
    
    # 第一次访问：登录并保存状态
    print("\n1️⃣ 第一次访问 - 登录并保存状态")
    browser1 = create_browser(headless=False)
    browser1.start()
    
    # 尝试恢复之前的登录状态
    restore_result = restore_session(browser1, '1688_login')
    
    if restore_result.get('success') and restore_result.get('cookies_loaded', 0) > 0:
        print("✅ 成功恢复之前的登录状态！")
        print(f"   加载了 {restore_result['cookies_loaded']} 个Cookie")
    else:
        print("ℹ️  无保存的登录状态，需要手动登录")
        print("   请在此完成登录操作...")
        
        # 访问1688
        page = browser1.goto('https://login.1688.com')
        
        # 这里可以添加自动登录逻辑
        # 例如：page.fill('#username', 'your_username')
        #      page.fill('#password', 'your_password')
        #      page.click('#login-button')
        
        print("   ⚠️  请手动完成登录，然后按Enter继续...")
        input()
        
        # 保存登录状态
        save_result = save_session(browser1, '1688_login')
        if save_result.get('success'):
            print("✅ 登录状态已保存！")
            print(f"   保存了 {save_result.get('state_summary', {}).get('cookies', 0)} 个Cookie")
    
    # 访问需要登录的页面
    print("\n2️⃣ 访问需要登录的页面")
    page = browser1.goto('https://work.1688.com')
    time.sleep(3)
    print(f"   当前页面标题: {page.title()}")
    print(f"   当前URL: {page.url}")
    
    browser1.stop()
    
    # 第二次访问：自动登录
    print("\n3️⃣ 第二次访问 - 自动登录")
    browser2 = create_browser(headless=False)
    browser2.start()
    
    # 恢复登录状态
    auto_login_result = restore_session(browser2, '1688_login')
    
    if auto_login_result.get('success'):
        print("🎉 自动登录成功！")
        print(f"   恢复了 {auto_login_result.get('cookies_loaded', 0)} 个Cookie")
        
        # 直接访问需要登录的页面
        page = browser2.goto('https://work.1688.com')
        time.sleep(3)
        print(f"   页面标题: {page.title()}")
        print(f"   URL: {page.url}")
        
        if 'login' not in page.url:
            print("✅ 成功进入工作台，无需重新登录！")
        else:
            print("⚠️  仍需要登录，可能Cookie已过期")
    else:
        print("❌ 自动登录失败")
    
    browser2.stop()

def example_multiple_sites_management():
    """多网站Cookie管理示例"""
    print("\n🎯 多网站Cookie管理示例")
    print("=" * 50)
    
    sites = [
        {'name': '百度', 'url': 'https://www.baidu.com', 'domain': 'baidu'},
        {'name': '微博', 'url': 'https://weibo.com', 'domain': 'weibo'},
        {'name': '知乎', 'url': 'https://www.zhihu.com', 'domain': 'zhihu'}
    ]
    
    browser = create_browser(headless=False)
    browser.start()
    
    for site in sites:
        print(f"\n📍 处理 {site['name']}")
        
        # 尝试恢复会话
        restore_result = restore_session(browser, site['domain'])
        
        if restore_result.get('success') and restore_result.get('cookies_loaded', 0) > 0:
            print(f"✅ {site['name']} - 恢复会话成功")
        else:
            print(f"ℹ️  {site['name']} - 无保存会话，访问网站...")
            
            # 访问网站
            page = browser.goto(site['url'])
            time.sleep(3)
            
            # 保存当前状态
            save_result = save_session(browser, site['domain'])
            if save_result.get('success'):
                print(f"✅ {site['name']} - 会话已保存")
    
    browser.stop()
    print("\n✅ 多网站Cookie管理完成")

def example_cookie_inspection():
    """Cookie检查和调试示例"""
    print("\n🔍 Cookie检查和调试示例")
    print("=" * 50)
    
    from libs.browser.cookie_manager import CookieManager
    
    cm = CookieManager()
    
    # 列出所有保存的域名
    domains = cm.list_domains()
    print(f"已保存的域名: {domains}")
    
    for domain in domains:
        print(f"\n📋 {domain} 详情:")
        
        # 获取域名信息
        info = cm.get_domain_info(domain)
        if info:
            print(f"   Cookie数量: {info.get('cookie_count')}")
            print(f"   最后保存: {info.get('saved_at')}")
            print(f"   状态: {'有效' if info.get('is_valid') else '无效'}")
        
        # 加载并检查Cookie
        cookies = cm.load_cookies(domain)
        if cookies:
            print(f"   加载的Cookie数量: {len(cookies)}")
            
            # 分析Cookie类型
            session_cookies = [c for c in cookies if c.get('expires') == -1 or c.get('expires') is None]
            http_only_cookies = [c for c in cookies if c.get('httpOnly')]
            secure_cookies = [c for c in cookies if c.get('secure')]
            
            print(f"   Session Cookie: {len(session_cookies)}")
            print(f"   HttpOnly Cookie: {len(http_only_cookies)}")
            print(f"   Secure Cookie: {len(secure_cookies)}")
            
            # 显示前几个Cookie的名称
            cookie_names = [c.get('name', 'unknown') for c in cookies[:3]]
            print(f"   前几个Cookie: {cookie_names}")
            if len(cookies) > 3:
                print(f"   ... 还有 {len(cookies) - 3} 个")

def example_backup_and_cleanup():
    """备份和清理示例"""
    print("\n🧹 备份和清理示例")
    print("=" * 50)
    
    from libs.browser.cookie_manager import CookieManager
    
    cm = CookieManager()
    
    # 创建一些测试数据
    test_cookies = [{'name': f'test_{i}', 'value': f'value_{i}', 'domain': '.test.com', 'path': '/'} for i in range(5)]
    
    # 多次保存以创建备份
    for i in range(3):
        cm.save_cookies(test_cookies, f'backup_test_{i}')
        time.sleep(1)  # 确保时间戳不同
    
    # 检查备份
    print("创建备份后的状态:")
    domains = cm.list_domains()
    print(f"域名数量: {len(domains)}")
    
    # 清理旧备份（保留最近2个）
    for domain in domains:
        if domain.startswith('backup_test_'):
            deleted = cm.cleanup_old_backups(domain, keep_count=2)
            print(f"{domain}: 清理了 {deleted} 个旧备份")
    
    print("✅ 备份和清理完成")

def main():
    """主函数 - 展示所有示例"""
    print("🚀 WebAuto Cookie管理使用示例")
    print("=" * 60)
    
    examples = [
        ("1688自动登录", example_auto_login_1688),
        ("多网站Cookie管理", example_multiple_sites_management),
        ("Cookie检查和调试", example_cookie_inspection),
        ("备份和清理", example_backup_and_cleanup),
    ]
    
    print("\n📚 可用示例:")
    for i, (name, _) in enumerate(examples, 1):
        print(f"{i}. {name}")
    
    print("\n💡 使用方法:")
    print("   1. 取消注释要运行的示例")
    print("   2. 根据需要修改参数")
    print("   3. 运行脚本")
    
    # 选择要运行的示例（取消注释）
    # example_auto_login_1688()
    # example_multiple_sites_management()
    # example_cookie_inspection()
    # example_backup_and_cleanup()
    
    # 运行所有示例（简化版）
    print("\n🎯 运行Cookie检查示例:")
    example_cookie_inspection()
    
    print("\n🎯 运行自动登录模拟:")
    example_auto_login_1688()
    
    print("\n✅ 所有示例运行完成！")
    print("\n💡 总结:")
    print("   • Cookie管理器已准备就绪")
    print("   • 支持自动登录功能")
    print("   • 可以多网站会话管理")
    print("   • 提供完整的备份和恢复机制")

if __name__ == '__main__':
    main()