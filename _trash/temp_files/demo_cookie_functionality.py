#!/usr/bin/env python3
"""
Cookie功能演示 - 展示Cookie自动保存功能
"""

import sys
import os
import time

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def demo_cookie_functionality():
    """演示Cookie功能"""
    print("🍪 WebAuto Cookie自动保存功能演示")
    print("=" * 50)

    # 配置
    config = {
        'headless': False,
        'auto_overlay': False,
        'profile_id': 'demo_profile',
        'cookie_monitoring_enabled': True
    }

    try:
        print("1️⃣ 创建浏览器实例...")
        browser = ChromiumBrowserWrapper(config)

        print("2️⃣ 导航到微博...")
        page = browser.goto("https://weibo.com")

        print("3️⃣ Cookie监控已启动！")
        if hasattr(browser, '_cookie_manager'):
            cookie_info = browser._cookie_manager.get_cookie_info()
            print(f"   📊 Profile: {cookie_info['profile_name']}")
            print(f"   📁 Cookie文件: {cookie_info['cookie_file_path']}")
            print(f"   ✅ 文件存在: {cookie_info['cookie_file_exists']}")

        print("4️⃣ 浏览器已启动，请查看微博页面")
        print("   💡 现在可以登录微博，Cookie会自动监控变化")

        # 等待用户观察
        print("5️⃣ 演示将运行30秒，观察Cookie监控...")
        for i in range(30, 0, -1):
            print(f"   ⏰ 倒计时: {i}秒", end='\r')
            time.sleep(1)

        print("\n6️⃣ 演示完成，关闭浏览器...")

        # 强制保存Cookie
        if hasattr(browser, '_cookie_manager'):
            context = browser._get_context()
            browser._cookie_manager.save_cookies(context, force=True)

        browser.close()

        print("7️⃣ 检查Cookie文件...")
        from pathlib import Path
        cookie_file = Path("profiles/demo_profile_cookies.json")

        if cookie_file.exists():
            print("   ✅ Cookie文件已创建！")
            file_size = cookie_file.stat().st_size
            print(f"   📊 文件大小: {file_size} bytes")

            # 读取并显示基本信息
            import json
            with open(cookie_file, 'r', encoding='utf-8') as f:
                cookie_data = json.load(f)

            print(f"   🍪 Cookie数量: {cookie_data.get('cookie_count', 0)}")
            print(f"   🌐 域名数量: {len(cookie_data.get('domains', []))}")

            if cookie_data.get('domains'):
                print(f"   📍 涉及域名: {', '.join(cookie_data['domains'][:5])}")

        print("\n🎉 Cookie功能演示完成！")
        print("\n📋 功能特性:")
        print("  ✅ 自动监控Cookie变化")
        print("  ✅ Cookie稳定后自动保存")
        print("  ✅ 下次启动时自动恢复")
        print("  ✅ 支持多个profile隔离")

        return True

    except Exception as e:
        print(f"❌ 演示失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    demo_cookie_functionality()