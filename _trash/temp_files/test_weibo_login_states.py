#!/usr/bin/env python3
"""
Test Weibo login state containers
Create separate root containers for logged-out and logged-in states
"""

import sys
import os
import time
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_weibo_login_states():
    """Test Weibo with and without cookies to create appropriate containers"""
    
    print("🧪 测试微博登录状态容器\n")
    
    # Check if we have saved cookies
    cookie_file = "./cookies/session_weibo-login.json"
    has_cookies = os.path.exists(cookie_file)
    
    print("=" * 60)
    print("步骤 0: 检查Cookie状态")
    print("=" * 60)
    
    if has_cookies:
        print(f"✅ 找到微博Cookie文件: {cookie_file}")
        with open(cookie_file, 'r') as f:
            data = json.load(f)
        cookies = data.get('cookies', [])
        print(f"   包含 {len(cookies)} 个cookie")
        
        # Check for login cookies
        has_sub = any(c['name'] == 'SUB' for c in cookies)
        has_subp = any(c['name'] == 'SUBP' for c in cookies)
        
        if has_sub and has_subp:
            print(f"   ✅ 检测到登录Cookie (SUB, SUBP)")
        else:
            print(f"   ⚠️ Cookie可能已过期")
    else:
        print(f"❌ 未找到微博Cookie文件")
        print(f"   请先手动登录微博并保存cookie")
        return False
    
    # Test 1: Without cookies (logged out state)
    print("\n" + "=" * 60)
    print("步骤 1: 测试未登录状态（不加载cookie）")
    print("=" * 60)
    
    config_logout = {
        'headless': False,
        'auto_overlay': True,
        'auto_session': False,  # Don't load cookies!
        'profile_id': 'weibo_logout_test',
        'session_name': 'weibo_logout_test',
        'timeout': 30.0
    }
    
    browser_logout = ChromiumBrowserWrapper(config_logout)
    
    try:
        print("🌐 导航到微博首页（未登录）...")
        page = browser_logout.goto("https://weibo.com")
        
        print(f"✅ 页面加载完成")
        print(f"   URL: {page.page.url}")
        
        # Wait for page to load
        time.sleep(3)
        
        # Check for logged-out indicators
        print("\n🔍 检查未登录状态的页面元素...")
        
        # Try to find login button/card
        try:
            login_elements = page.page.query_selector_all("button:has-text('登录'), .LoginCard_wrap, [class*='login']")
            print(f"   找到 {len(login_elements)} 个登录相关元素")
        except:
            print(f"   未找到明显的登录元素")
        
        # Check for visitor/guest indicators
        try:
            visitor_elements = page.page.query_selector_all("[class*='visitor'], [class*='guest']")
            print(f"   找到 {len(visitor_elements)} 个访客相关元素")
        except:
            print(f"   未找到访客元素")
        
        print("\n📋 建议的未登录根容器选择器:")
        print("   方案1: 检查是否存在登录按钮/卡片")
        print("   方案2: 检查URL是否包含 'visitor' 或 'newlogin'")
        print("   方案3: 检查是否缺少用户信息元素")
        
        # Get page HTML for analysis
        print("\n💾 保存未登录状态的页面快照...")
        page.page.screenshot(path="./weibo_logged_out.png")
        print("   截图已保存: weibo_logged_out.png")
        
        # Keep browser open for inspection
        print("\n⏱️  保持浏览器打开10秒，请检查页面结构...")
        print("   你可以打开开发者工具查看DOM结构")
        time.sleep(10)
        
    finally:
        print("\n🔒 关闭未登录测试浏览器...")
        browser_logout.close()
    
    # Test 2: With cookies (logged in state)
    print("\n" + "=" * 60)
    print("步骤 2: 测试已登录状态（加载cookie）")
    print("=" * 60)
    
    config_login = {
        'headless': False,
        'auto_overlay': True,
        'auto_session': True,  # Load cookies!
        'profile_id': 'weibo_login_test',
        'session_name': 'weibo-login',  # Use saved session
        'timeout': 30.0
    }
    
    browser_login = ChromiumBrowserWrapper(config_login)
    
    try:
        print("🌐 导航到微博首页（已登录）...")
        page = browser_login.goto("https://weibo.com")
        
        print(f"✅ 页面加载完成")
        print(f"   URL: {page.page.url}")
        
        # Wait for page to load
        time.sleep(3)
        
        # Check for logged-in indicators
        print("\n🔍 检查已登录状态的页面元素...")
        
        # Try to find user info
        try:
            user_elements = page.page.query_selector_all("[class*='user'], [class*='avatar'], [class*='profile']")
            print(f"   找到 {len(user_elements)} 个用户相关元素")
        except:
            print(f"   未找到用户元素")
        
        # Check for feed/timeline
        try:
            feed_elements = page.page.query_selector_all("[class*='feed'], [class*='timeline'], [class*='card']")
            print(f"   找到 {len(feed_elements)} 个动态/卡片元素")
        except:
            print(f"   未找到动态元素")
        
        print("\n📋 建议的已登录根容器选择器:")
        print("   方案1: 检查是否存在用户头像/昵称")
        print("   方案2: 检查是否存在动态流/时间线")
        print("   方案3: 检查URL是否为正常的weibo.com（不含visitor）")
        
        # Get page HTML for analysis
        print("\n💾 保存已登录状态的页面快照...")
        page.page.screenshot(path="./weibo_logged_in.png")
        print("   截图已保存: weibo_logged_in.png")
        
        # Keep browser open for inspection
        print("\n⏱️  保持浏览器打开10秒，请检查页面结构...")
        print("   你可以打开开发者工具查看DOM结构")
        time.sleep(10)
        
    finally:
        print("\n🔒 关闭已登录测试浏览器...")
        browser_login.close()
    
    # Summary
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    
    print("\n📝 下一步操作:")
    print("   1. 查看两个截图对比页面差异")
    print("   2. 在浏览器开发者工具中找到区分两种状态的唯一选择器")
    print("   3. 创建两个互斥的根容器:")
    print("      - weibo.root.logged_out (未登录)")
    print("      - weibo.root.logged_in (已登录)")
    print("   4. 确保两个选择器互斥（一个存在时另一个不存在）")
    
    print("\n✅ 测试完成！")
    
    return True


if __name__ == "__main__":
    try:
        success = test_weibo_login_states()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
