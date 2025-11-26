#!/usr/bin/env python3
"""
Test smart cookie auto-save functionality
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_cookie_monitoring():
    """Test intelligent cookie monitoring and saving"""
    
    print("🧪 测试智能Cookie自动保存\n")
    
    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': True,  # Enable cookie monitoring
        'profile_id': 'cookie_test',
        'session_name': 'cookie_test',
        'cookie_dir': './test_cookies',
        'cookie_check_interval': 2.0,  # Check every 2 seconds
        'cookie_stabilization_time': 5.0,  # Wait 5 seconds for stability
        'cookie_min_save_interval': 10.0,  # Min 10 seconds between saves
        'timeout': 30.0
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        print("=" * 60)
        print("步骤 1: 导航到测试页面")
        print("=" * 60)
        
        # Navigate to a page that sets cookies
        page = browser.goto("https://httpbin.org/cookies/set?test=initial")
        print(f"✅ 导航成功: {page.page.url}")
        
        # Check initial stats
        print("\n📊 Cookie监控统计:")
        stats = browser.get_cookie_stats()
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        print("\n⏱️  等待10秒，观察cookie监控...")
        time.sleep(10)
        
        # Check stats after waiting
        print("\n📊 10秒后的统计:")
        stats = browser.get_cookie_stats()
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        print("\n" + "=" * 60)
        print("步骤 2: 修改cookie (模拟登录过程)")
        print("=" * 60)
        
        # Set new cookies (simulating login)
        print("🔄 设置新cookie...")
        page.page.goto("https://httpbin.org/cookies/set?session=abc123&user=test")
        print("✅ Cookie已更新")
        
        print("\n⏱️  等待5秒，观察cookie变化检测...")
        time.sleep(5)
        
        stats = browser.get_cookie_stats()
        print("\n📊 Cookie变化后的统计:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        print("\n" + "=" * 60)
        print("步骤 3: 再次修改cookie (测试稳定性等待)")
        print("=" * 60)
        
        # Change cookies again
        print("🔄 再次修改cookie...")
        page.page.goto("https://httpbin.org/cookies/set?session=xyz789&user=admin")
        print("✅ Cookie已更新")
        
        print("\n⏱️  等待8秒，让cookie稳定...")
        time.sleep(8)
        
        stats = browser.get_cookie_stats()
        print("\n📊 稳定后的统计:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        print("\n" + "=" * 60)
        print("步骤 4: 强制保存cookie")
        print("=" * 60)
        
        if browser.force_save_cookies():
            print("✅ 强制保存成功")
        else:
            print("❌ 强制保存失败")
        
        print("\n⏱️  最后等待5秒...")
        time.sleep(5)
        
        # Final stats
        print("\n📊 最终统计:")
        stats = browser.get_cookie_stats()
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        print("\n" + "=" * 60)
        print("✅ 测试完成！")
        print("=" * 60)
        
        print("\n📝 总结:")
        print(f"   检查次数: {stats.get('checks', 0)}")
        print(f"   检测到变化: {stats.get('changes_detected', 0)}")
        print(f"   保存次数: {stats.get('saves', 0)}")
        print(f"   跳过保存: {stats.get('skipped_saves', 0)}")
        
        return True
        
    finally:
        print("\n🔒 关闭浏览器...")
        browser.close()


if __name__ == "__main__":
    try:
        success = test_cookie_monitoring()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
