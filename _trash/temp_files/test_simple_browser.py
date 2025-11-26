#!/usr/bin/env python3
"""
简单浏览器测试 - 测试基本功能
"""

import sys
import os

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def test_simple_browser():
    """测试简单浏览器功能"""
    print("🧪 开始测试简单浏览器功能")

    # 简单配置
    config = {
        'headless': False,
        'auto_overlay': False,
        'profile_id': 'test_simple',
        'cookie_monitoring_enabled': False  # 禁用Cookie监控先测试基本功能
    }

    try:
        print("🌐 创建浏览器实例...")
        browser = ChromiumBrowserWrapper(config)

        print("📍 导航到微博...")
        page = browser.goto("https://weibo.com")

        print("✅ 浏览器启动成功！")
        print("📝 现在可以看到微博页面了")

        # 等待用户查看
        input("按Enter键关闭浏览器...")

        print("🔚 关闭浏览器...")
        browser.close()

        print("🎉 测试完成！")
        return True

    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    test_simple_browser()