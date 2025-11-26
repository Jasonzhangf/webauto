#!/usr/bin/env python3
"""
Test Weibo cookie persistence and restoration
Verify that cookies are properly saved and restored
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_cookie_restoration():
    """Test that Weibo cookies are properly restored"""
    
    print("🧪 测试微博Cookie持久化和恢复\n")
    
    # Check if cookie file exists
    cookie_file = "./cookies/session_weibo-login.json"
    if not os.path.exists(cookie_file):
        print(f"❌ Cookie文件不存在: {cookie_file}")
        print("   请先手动登录微博")
        return False
    
    print(f"✅ 找到Cookie文件: {cookie_file}")
    
    # Get file modification time
    mtime = os.path.getmtime(cookie_file)
    import datetime
    mtime_str = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
    print(f"   最后修改时间: {mtime_str}")
    
    # Test cookie restoration
    print("\n" + "=" * 60)
    print("步骤 1: 使用保存的Cookie启动浏览器")
    print("=" * 60)
    
    config = {
        'headless': False,
        'auto_overlay': True,
        'auto_session': True,  # Load cookies
        'profile_id': 'weibo_test',
        'session_name': 'weibo-login',  # Use saved session
        'cookie_dir': './cookies',
        'timeout': 30.0
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        print("🌐 导航到微博首页...")
        page = browser.goto("https://weibo.com")
        
        # Wait for page to load
        time.sleep(5)
        
        url = page.page.url
        print(f"📍 当前URL: {url}")
        
        # Check if we're logged in
        print("\n🔍 检查登录状态...")
        
        # Check URL
        is_login_url = "newlogin" in url or "visitor" in url
        if is_login_url:
            print(f"   ❌ URL包含newlogin/visitor，可能未登录")
            print(f"   Cookie可能已过期或无效")
        else:
            print(f"   ✅ URL正常，可能已登录")
        
        # Check for logged-in elements
        try:
            # Check for user info
            user_info = page.page.query_selector_all("[class*='UserInfo'], [class*='UserCard']")
            print(f"   用户信息元素: {len(user_info)} 个")
            
            # Check for feed
            feed = page.page.query_selector_all(".woo-mod-main, [class*='Feed']")
            print(f"   动态流元素: {len(feed)} 个")
            
            # Check for login card (should not exist if logged in)
            login_card = page.page.query_selector_all(".LoginCard_wrap_18dK4")
            print(f"   登录卡片: {len(login_card)} 个")
            
            # Determine login status
            if len(feed) > 0 and len(login_card) == 0:
                print("\n✅ 登录成功！Cookie恢复正常工作")
                logged_in = True
            elif len(login_card) > 0:
                print("\n❌ 检测到登录卡片，未登录")
                logged_in = False
            else:
                print("\n⚠️ 无法确定登录状态")
                logged_in = False
                
        except Exception as e:
            print(f"\n❌ 检查登录状态失败: {e}")
            logged_in = False
        
        # Take screenshot
        screenshot_path = "./weibo_cookie_test.png"
        page.page.screenshot(path=screenshot_path)
        print(f"\n📸 截图已保存: {screenshot_path}")
        
        # Keep browser open for inspection
        print("\n⏱️  保持浏览器打开15秒供检查...")
        time.sleep(15)
        
        return logged_in
        
    finally:
        print("\n🔒 关闭浏览器...")
        browser.close()


if __name__ == "__main__":
    try:
        success = test_cookie_restoration()
        
        print("\n" + "=" * 60)
        print("测试结果")
        print("=" * 60)
        
        if success:
            print("✅ Cookie持久化功能正常")
            print("   - Cookie已正确保存")
            print("   - Cookie已成功恢复")
            print("   - 登录状态已保持")
        else:
            print("❌ Cookie持久化可能有问题")
            print("   - Cookie可能已过期")
            print("   - 或者需要重新登录")
        
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
