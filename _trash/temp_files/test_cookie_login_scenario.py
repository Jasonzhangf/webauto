#!/usr/bin/env python3
"""
Test cookie monitoring with real login scenario
Simulates a login flow where cookies change multiple times
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_login_scenario():
    """Test cookie monitoring during simulated login"""
    
    print("🧪 测试登录场景下的Cookie监控\n")
    print("=" * 60)
    print("场景说明:")
    print("  1. 访问首页 (设置初始cookie)")
    print("  2. 点击登录 (cookie开始变化)")
    print("  3. 输入凭证 (cookie继续变化)")
    print("  4. 登录成功 (cookie稳定)")
    print("  5. 等待稳定期后自动保存")
    print("=" * 60)
    print()
    
    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': True,
        'profile_id': 'login_test',
        'session_name': 'login_test',
        'cookie_dir': './test_cookies',
        'cookie_check_interval': 1.0,  # Check every 1 second (faster for demo)
        'cookie_stabilization_time': 3.0,  # Wait 3 seconds for stability
        'cookie_min_save_interval': 5.0,  # Min 5 seconds between saves
        'timeout': 30.0
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        print("步骤 1: 访问首页")
        print("-" * 60)
        page = browser.goto("https://httpbin.org/cookies/set?visitor=anonymous")
        print(f"✅ 首页加载完成")
        print(f"   URL: {page.page.url}")
        time.sleep(2)
        
        stats = browser.get_cookie_stats()
        print(f"📊 检查次数: {stats['checks']}, 变化: {stats['changes_detected']}, 保存: {stats['saves']}")
        
        print("\n步骤 2: 模拟点击登录 (cookie开始变化)")
        print("-" * 60)
        page.page.goto("https://httpbin.org/cookies/set?session_id=temp123&csrf=abc")
        print("✅ 登录页面加载")
        time.sleep(1)
        
        stats = browser.get_cookie_stats()
        print(f"📊 检查次数: {stats['checks']}, 变化: {stats['changes_detected']}, 保存: {stats['saves']}")
        
        print("\n步骤 3: 模拟输入凭证 (cookie继续变化)")
        print("-" * 60)
        page.page.goto("https://httpbin.org/cookies/set?session_id=temp456&csrf=def&auth_step=1")
        print("✅ 认证步骤1")
        time.sleep(0.5)
        
        page.page.goto("https://httpbin.org/cookies/set?session_id=temp789&csrf=ghi&auth_step=2")
        print("✅ 认证步骤2")
        time.sleep(0.5)
        
        stats = browser.get_cookie_stats()
        print(f"📊 检查次数: {stats['checks']}, 变化: {stats['changes_detected']}, 保存: {stats['saves']}")
        
        print("\n步骤 4: 模拟登录成功 (设置最终cookie)")
        print("-" * 60)
        page.page.goto("https://httpbin.org/cookies/set?session_id=final_abc123&user_id=12345&username=testuser&logged_in=true")
        print("✅ 登录成功！")
        print("   Cookie已设置为最终状态")
        
        stats = browser.get_cookie_stats()
        print(f"📊 检查次数: {stats['checks']}, 变化: {stats['changes_detected']}, 保存: {stats['saves']}")
        
        print("\n步骤 5: 等待Cookie稳定...")
        print("-" * 60)
        print("⏱️  等待稳定期 (3秒)...")
        
        for i in range(6):
            time.sleep(1)
            stats = browser.get_cookie_stats()
            print(f"   {i+1}秒: 检查={stats['checks']}, 变化={stats['changes_detected']}, 保存={stats['saves']}")
        
        print("\n✅ Cookie应该已经自动保存！")
        
        print("\n" + "=" * 60)
        print("最终统计")
        print("=" * 60)
        stats = browser.get_cookie_stats()
        for key, value in stats.items():
            if key not in ['current_hash']:
                print(f"   {key}: {value}")
        
        print("\n📁 检查保存的cookie文件...")
        cookie_file = f"./test_cookies/session_login_test.json"
        if os.path.exists(cookie_file):
            import json
            with open(cookie_file, 'r') as f:
                data = json.load(f)
            print(f"✅ Cookie文件已保存: {cookie_file}")
            print(f"   包含 {len(data.get('cookies', []))} 个cookie:")
            for cookie in data.get('cookies', []):
                print(f"     - {cookie['name']} = {cookie['value']}")
        else:
            print(f"⚠️ Cookie文件未找到: {cookie_file}")
        
        print("\n" + "=" * 60)
        print("✅ 测试完成！")
        print("=" * 60)
        
        return True
        
    finally:
        print("\n🔒 关闭浏览器...")
        browser.close()


if __name__ == "__main__":
    try:
        success = test_login_scenario()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
