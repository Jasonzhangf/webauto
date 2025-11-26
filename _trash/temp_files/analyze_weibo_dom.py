#!/usr/bin/env python3
"""
Analyze Weibo DOM to find mutually exclusive selectors for logged-in/logged-out states
"""

import sys
import os
import time
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def analyze_dom_structure(page, state_name):
    """Analyze DOM structure and find unique selectors"""
    
    print(f"\n🔍 分析 {state_name} 状态的DOM结构...")
    print("-" * 60)
    
    # Check various selectors
    selectors_to_check = [
        # Logged-out indicators
        ("登录按钮", "button:has-text('登录')"),
        ("登录卡片", ".LoginCard_wrap_18dK4"),
        ("访客模式", "[class*='visitor']"),
        ("新登录页", "[class*='newlogin']"),
        
        # Logged-in indicators  
        ("用户头像", "[class*='avatar']:not([class*='default'])"),
        ("用户菜单", "[class*='UserInfo'], [class*='user-info']"),
        ("发布按钮", "button:has-text('发布'), [class*='publish']"),
        ("侧边栏用户", "#__sidebar [class*='user']"),
        
        # Common elements
        ("主体内容", ".woo-mod-main"),
        ("侧边栏", "#__sidebar"),
        ("顶部导航", "[class*='Nav'], [class*='nav']"),
    ]
    
    results = {}
    
    for name, selector in selectors_to_check:
        try:
            elements = page.page.query_selector_all(selector)
            count = len(elements)
            results[name] = {
                "selector": selector,
                "count": count,
                "exists": count > 0
            }
            
            status = "✅" if count > 0 else "❌"
            print(f"   {status} {name}: {count} 个元素")
            
            # Get first element's class if exists
            if count > 0:
                try:
                    first_elem = elements[0]
                    classes = page.page.evaluate("(el) => el.className", first_elem)
                    if classes:
                        print(f"      类名: {classes[:100]}")
                except:
                    pass
                    
        except Exception as e:
            print(f"   ⚠️ {name}: 查询失败 - {e}")
            results[name] = {"selector": selector, "count": 0, "exists": False, "error": str(e)}
    
    # Check URL
    url = page.page.url
    print(f"\n📍 当前URL: {url}")
    
    is_visitor = "visitor" in url or "newlogin" in url
    print(f"   包含visitor/newlogin: {'是' if is_visitor else '否'}")
    
    results["_url"] = url
    results["_is_visitor_url"] = is_visitor
    
    return results


def find_exclusive_selectors():
    """Find mutually exclusive selectors for logged-in and logged-out states"""
    
    print("🧪 查找微博登录状态的互斥选择器\n")
    
    # Test logged-out state
    print("=" * 60)
    print("步骤 1: 分析未登录状态")
    print("=" * 60)
    
    config_logout = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': 'weibo_analyze_logout',
        'session_name': 'weibo_analyze_logout',
        'timeout': 30.0
    }
    
    browser_logout = ChromiumBrowserWrapper(config_logout)
    
    try:
        page = browser_logout.goto("https://weibo.com")
        time.sleep(5)  # Wait for page to fully load
        
        logout_results = analyze_dom_structure(page, "未登录")
        
        # Save HTML for analysis
        html = page.page.content()
        with open("weibo_logged_out.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"\n💾 HTML已保存: weibo_logged_out.html")
        
    finally:
        browser_logout.close()
    
    # Test logged-in state
    print("\n" + "=" * 60)
    print("步骤 2: 分析已登录状态")
    print("=" * 60)
    
    config_login = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': True,
        'profile_id': 'weibo_analyze_login',
        'session_name': 'weibo-login',
        'timeout': 30.0
    }
    
    browser_login = ChromiumBrowserWrapper(config_login)
    
    try:
        page = browser_login.goto("https://weibo.com")
        time.sleep(5)  # Wait for page to fully load
        
        login_results = analyze_dom_structure(page, "已登录")
        
        # Save HTML for analysis
        html = page.page.content()
        with open("weibo_logged_in.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"\n💾 HTML已保存: weibo_logged_in.html")
        
    finally:
        browser_login.close()
    
    # Compare results
    print("\n" + "=" * 60)
    print("步骤 3: 对比分析")
    print("=" * 60)
    
    print("\n📊 互斥性分析:")
    print("-" * 60)
    
    exclusive_logout = []
    exclusive_login = []
    common = []
    
    all_keys = set(logout_results.keys()) | set(login_results.keys())
    
    for key in sorted(all_keys):
        if key.startswith("_"):
            continue
            
        logout_exists = logout_results.get(key, {}).get("exists", False)
        login_exists = login_results.get(key, {}).get("exists", False)
        
        if logout_exists and not login_exists:
            exclusive_logout.append(key)
            print(f"   🔴 仅未登录: {key}")
        elif login_exists and not logout_exists:
            exclusive_login.append(key)
            print(f"   🟢 仅已登录: {key}")
        elif logout_exists and login_exists:
            common.append(key)
            print(f"   🟡 两者都有: {key}")
    
    # Recommendations
    print("\n" + "=" * 60)
    print("推荐的根容器选择器")
    print("=" * 60)
    
    print("\n✅ 未登录根容器 (weibo.root.logged_out):")
    if exclusive_logout:
        for key in exclusive_logout:
            selector = logout_results[key]["selector"]
            print(f"   方案: {selector}")
            print(f"   说明: 检测到 {key}")
    
    # URL-based detection
    if logout_results.get("_is_visitor_url"):
        print(f"   方案: URL包含 'visitor' 或 'newlogin'")
    
    print("\n✅ 已登录根容器 (weibo.root.logged_in):")
    if exclusive_login:
        for key in exclusive_login:
            selector = login_results[key]["selector"]
            print(f"   方案: {selector}")
            print(f"   说明: 检测到 {key}")
    
    # URL-based detection
    if not login_results.get("_is_visitor_url"):
        print(f"   方案: URL不包含 'visitor' 或 'newlogin'")
    
    print("\n📝 建议:")
    print("   1. 使用互斥的元素选择器")
    print("   2. 结合URL检测作为备用方案")
    print("   3. 在container-library.json中添加两个根容器")
    print("   4. 测试确保互斥性")
    
    # Save analysis results
    analysis = {
        "logged_out": logout_results,
        "logged_in": login_results,
        "exclusive_logout": exclusive_logout,
        "exclusive_login": exclusive_login,
        "common": common
    }
    
    with open("weibo_analysis.json", "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 分析结果已保存: weibo_analysis.json")
    
    print("\n✅ 分析完成！")
    
    return True


if __name__ == "__main__":
    try:
        success = find_exclusive_selectors()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 分析失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
