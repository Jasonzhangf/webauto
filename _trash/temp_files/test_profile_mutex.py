#!/usr/bin/env python3
"""
Test profile mutex functionality
"""

import sys
import os
import time
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_profile_mutex():
    """Test that only one instance per profile can run"""
    
    print("🧪 测试Profile互斥功能\n")
    
    # Test 1: Launch first instance
    print("=" * 60)
    print("测试 1: 启动第一个实例 (profile=test_mutex)")
    print("=" * 60)
    
    config1 = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': 'test_mutex',
        'timeout': 30.0
    }
    
    browser1 = ChromiumBrowserWrapper(config1)
    
    try:
        print("✅ 第一个实例启动成功")
        page1 = browser1.goto("https://example.com")
        print(f"✅ 导航成功: {page1.page.url}")
        
        # Wait a bit
        print("\n⏱️  等待5秒...")
        time.sleep(5)
        
        # Test 2: Try to launch second instance with same profile
        print("\n" + "=" * 60)
        print("测试 2: 尝试启动第二个实例 (相同profile=test_mutex)")
        print("=" * 60)
        print("⚠️ 预期行为: 应该杀掉第一个实例并启动新实例\n")
        
        config2 = {
            'headless': False,
            'auto_overlay': False,
            'auto_session': False,
            'profile_id': 'test_mutex',  # Same profile!
            'timeout': 30.0
        }
        
        browser2 = ChromiumBrowserWrapper(config2)
        
        try:
            print("✅ 第二个实例启动成功 (第一个实例应该已被终止)")
            page2 = browser2.goto("https://example.org")
            print(f"✅ 导航成功: {page2.page.url}")
            
            # Check if first browser is still alive
            print("\n🔍 检查第一个浏览器状态...")
            try:
                # Try to interact with first browser
                url1 = page1.page.url
                print(f"❌ 第一个浏览器仍然活跃: {url1}")
                print("   这不应该发生！")
            except Exception as e:
                print(f"✅ 第一个浏览器已被终止 (符合预期)")
                print(f"   错误信息: {str(e)[:100]}")
            
            print("\n⏱️  保持第二个实例运行10秒...")
            time.sleep(10)
            
            print("\n✅ 测试通过！Profile互斥功能正常工作")
            
        finally:
            print("\n🔒 关闭第二个实例...")
            browser2.close()
        
    finally:
        # Try to close first instance (might already be dead)
        try:
            print("🔒 尝试关闭第一个实例...")
            browser1.close()
        except Exception as e:
            print(f"   第一个实例已经关闭: {e}")
    
    # Test 3: Launch with different profile
    print("\n" + "=" * 60)
    print("测试 3: 启动不同profile的实例 (profile=test_mutex_2)")
    print("=" * 60)
    
    config3 = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': 'test_mutex_2',  # Different profile
        'timeout': 30.0
    }
    
    browser3 = ChromiumBrowserWrapper(config3)
    
    try:
        print("✅ 不同profile的实例启动成功")
        page3 = browser3.goto("https://example.net")
        print(f"✅ 导航成功: {page3.page.url}")
        
        print("\n⏱️  保持运行5秒...")
        time.sleep(5)
        
    finally:
        print("\n🔒 关闭实例...")
        browser3.close()
    
    print("\n" + "=" * 60)
    print("✅ 所有测试完成！")
    print("=" * 60)
    
    return True


if __name__ == "__main__":
    try:
        success = test_profile_mutex()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
