#!/usr/bin/env python3
"""
Test profile mutex functionality - Single instance test
Run this script multiple times with the same profile to test mutex
"""

import sys
import os
import time
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def main():
    parser = argparse.ArgumentParser(description='Test profile mutex')
    parser.add_argument('--profile', default='test_mutex', help='Profile ID to use')
    parser.add_argument('--url', default='https://example.com', help='URL to navigate to')
    parser.add_argument('--duration', type=int, default=30, help='How long to keep browser open (seconds)')
    args = parser.parse_args()
    
    print(f"🚀 启动浏览器实例")
    print(f"   Profile: {args.profile}")
    print(f"   URL: {args.url}")
    print(f"   PID: {os.getpid()}")
    print()
    
    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': args.profile,
        'timeout': 30.0
    }
    
    try:
        browser = ChromiumBrowserWrapper(config)
        
        print(f"✅ 浏览器实例启动成功")
        
        page = browser.goto(args.url)
        print(f"✅ 导航成功: {page.page.url}")
        
        print(f"\n⏱️  保持浏览器运行 {args.duration} 秒...")
        print(f"   在此期间，你可以在另一个终端运行相同命令来测试互斥功能")
        print(f"   命令: python3 test_profile_mutex_single.py --profile {args.profile}")
        print()
        
        for i in range(args.duration):
            time.sleep(1)
            if (i + 1) % 10 == 0:
                print(f"   已运行 {i + 1}/{args.duration} 秒...")
        
        print(f"\n✅ 测试完成，关闭浏览器...")
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        try:
            browser.close()
        except:
            pass
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
