#!/usr/bin/env python3
"""
Manual Weibo login and DOM analysis
User will manually login, then we analyze both states
"""

import sys
import os
import time
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def manual_login_and_analyze():
    """Manual login and analyze DOM for both states"""
    
    print("🧪 微博手动登录并分析DOM\n")
    
    print("=" * 60)
    print("说明")
    print("=" * 60)
    print("本脚本将:")
    print("  1. 打开微博首页（未登录状态）")
    print("  2. 分析未登录状态的DOM")
    print("  3. 等待你手动登录")
    print("  4. 分析已登录状态的DOM")
    print("  5. 对比两种状态，找出互斥选择器")
    print()
    
    input("按回车键继续...")
    
    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': True,  # Will save cookies after login
        'profile_id': 'weibo_manual',
        'session_name': 'weibo_manual',
        'cookie_dir': './cookies',
        'timeout': 30.0
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        # Step 1: Load page (logged out)
        print("\n" + "=" * 60)
        print("步骤 1: 加载微博首页（未登录状态）")
        print("=" * 60)
        
        page = browser.goto("https://weibo.com")
        time.sleep(3)
        
        url_logout = page.page.url
        print(f"📍 URL: {url_logout}")
        
        # Analyze logged-out state
        print("\n🔍 分析未登录状态...")
        
        # Take screenshot
        page.page.screenshot(path="./weibo_manual_logout.png")
        print("   截图: weibo_manual_logout.png")
        
        # Check for login elements
        login_card = page.page.query_selector_all(".LoginCard_wrap_18dK4")
        login_btn = page.page.query_selector_all("button:has-text('登录')")
        
        print(f"   登录卡片: {len(login_card)} 个")
        print(f"   登录按钮: {len(login_btn)} 个")
        
        # Save HTML
        html_logout = page.page.content()
        with open("weibo_manual_logout.html", "w", encoding="utf-8") as f:
            f.write(html_logout)
        print("   HTML: weibo_manual_logout.html")
        
        logout_state = {
            "url": url_logout,
            "has_login_card": len(login_card) > 0,
            "has_login_btn": len(login_btn) > 0,
            "is_newlogin_url": "newlogin" in url_logout or "visitor" in url_logout
        }
        
        # Step 2: Wait for manual login
        print("\n" + "=" * 60)
        print("步骤 2: 请手动登录")
        print("=" * 60)
        print("⚠️ 请在浏览器中手动登录微博")
        print("   1. 点击登录按钮")
        print("   2. 输入用户名和密码")
        print("   3. 完成登录")
        print("   4. 等待跳转到首页")
        print()
        
        input("登录完成后，按回车键继续...")
        
        # Step 3: Analyze logged-in state
        print("\n" + "=" * 60)
        print("步骤 3: 分析已登录状态")
        print("=" * 60)
        
        # Navigate to home to ensure we're on the right page
        page.page.goto("https://weibo.com")
        time.sleep(5)
        
        url_login = page.page.url
        print(f"📍 URL: {url_login}")
        
        # Take screenshot
        page.page.screenshot(path="./weibo_manual_login.png")
        print("   截图: weibo_manual_login.png")
        
        # Check for logged-in elements
        user_info = page.page.query_selector_all("[class*='UserInfo'], [class*='user-info'], [class*='UserCard']")
        feed = page.page.query_selector_all("[class*='Feed'], [class*='feed'], .woo-mod-main")
        publish_btn = page.page.query_selector_all("button:has-text('发布'), [class*='publish']")
        
        # Check if login elements are gone
        login_card_after = page.page.query_selector_all(".LoginCard_wrap_18dK4")
        login_btn_after = page.page.query_selector_all("button:has-text('登录')")
        
        print(f"   用户信息: {len(user_info)} 个")
        print(f"   动态流: {len(feed)} 个")
        print(f"   发布按钮: {len(publish_btn)} 个")
        print(f"   登录卡片: {len(login_card_after)} 个")
        print(f"   登录按钮: {len(login_btn_after)} 个")
        
        # Save HTML
        html_login = page.page.content()
        with open("weibo_manual_login.html", "w", encoding="utf-8") as f:
            f.write(html_login)
        print("   HTML: weibo_manual_login.html")
        
        login_state = {
            "url": url_login,
            "has_user_info": len(user_info) > 0,
            "has_feed": len(feed) > 0,
            "has_publish_btn": len(publish_btn) > 0,
            "has_login_card": len(login_card_after) > 0,
            "has_login_btn": len(login_btn_after) > 0,
            "is_newlogin_url": "newlogin" in url_login or "visitor" in url_login
        }
        
        # Step 4: Compare and recommend
        print("\n" + "=" * 60)
        print("步骤 4: 对比分析")
        print("=" * 60)
        
        print("\n📊 状态对比:")
        print(f"   未登录URL: {logout_state['url']}")
        print(f"   已登录URL: {login_state['url']}")
        print()
        
        print("   未登录特征:")
        print(f"      - 有登录卡片: {logout_state['has_login_card']}")
        print(f"      - 有登录按钮: {logout_state['has_login_btn']}")
        print(f"      - URL包含newlogin/visitor: {logout_state['is_newlogin_url']}")
        print()
        
        print("   已登录特征:")
        print(f"      - 有用户信息: {login_state['has_user_info']}")
        print(f"      - 有动态流: {login_state['has_feed']}")
        print(f"      - 有发布按钮: {login_state['has_publish_btn']}")
        print(f"      - 有登录卡片: {login_state['has_login_card']}")
        print(f"      - URL包含newlogin/visitor: {login_state['is_newlogin_url']}")
        
        # Recommendations
        print("\n" + "=" * 60)
        print("推荐的容器定义")
        print("=" * 60)
        
        print("\n✅ 未登录根容器 (weibo.root.logged_out):")
        if logout_state['has_login_card'] and not login_state['has_login_card']:
            print("   selector: \".LoginCard_wrap_18dK4\"")
            print("   说明: 登录卡片仅在未登录时存在")
        elif logout_state['is_newlogin_url'] and not login_state['is_newlogin_url']:
            print("   selector: \"body\" (配合URL检测)")
            print("   说明: URL包含newlogin/visitor时为未登录")
        
        print("\n✅ 已登录根容器 (weibo.root.logged_in):")
        if login_state['has_feed'] and not logout_state.get('has_feed', False):
            print("   selector: \".woo-mod-main\"")
            print("   说明: 主内容区域仅在已登录时存在")
        elif login_state['has_user_info']:
            print("   selector: \"[class*='UserInfo'], [class*='UserCard']\"")
            print("   说明: 用户信息卡片仅在已登录时存在")
        elif not login_state['is_newlogin_url'] and logout_state['is_newlogin_url']:
            print("   selector: \"body\" (配合URL检测)")
            print("   说明: URL不包含newlogin/visitor时为已登录")
        
        # Save analysis
        analysis = {
            "logged_out": logout_state,
            "logged_in": login_state,
            "timestamp": time.time()
        }
        
        with open("weibo_manual_analysis.json", "w", encoding="utf-8") as f:
            json.dump(analysis, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 分析结果已保存: weibo_manual_analysis.json")
        
        # Keep browser open
        print("\n⏱️  保持浏览器打开30秒供检查...")
        time.sleep(30)
        
        print("\n✅ 分析完成！")
        
    finally:
        print("\n🔒 关闭浏览器...")
        browser.close()
    
    return True


if __name__ == "__main__":
    try:
        success = manual_login_and_analyze()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
