#!/usr/bin/env python3
"""
登录调试测试 - 用于追踪循环登录问题
"""

import time
import json
import os
from browser_interface import CamoufoxBrowserWrapper

def test_login_debug():
    """调试登录流程"""
    print("=== 开始登录调试测试 ===")

    # 创建浏览器实例，启用自动session和保存
    config = {
        "headless": False,  # 非headless模式以便观察
        "auto_session": True,
        "session_name": "debug-session",
        "auto_save_interval": 30,  # 30秒自动保存
        "profile_id": "debug-profile"
    }

    browser = CamoufoxBrowserWrapper(config)

    try:
        print("1. 尝试加载已保存的session...")
        restore_result = browser.restore_session("debug-session")
        print(f"   恢复结果: {restore_result}")

        print("2. 创建页面并导航到1688...")
        page = browser.new_page()
        print("3. 导航到1688...")
        page.goto("https://www.1688.com")
        time.sleep(10)  # 等待页面加载

        print("4. 获取当前存储状态...")
        state = browser.get_storage_state()
        print(f"   当前Cookie数量: {len(state.get('cookies', []))}")

        print("5. 等待一段时间观察自动保存行为...")
        time.sleep(40)  # 等待至少一个自动保存周期

        print("6. 再次获取存储状态...")
        state2 = browser.get_storage_state()
        print(f"   当前Cookie数量: {len(state2.get('cookies', []))}")

        print("7. 手动保存session...")
        save_result = browser.save_session("debug-session")
        print(f"   保存结果: {save_result}")

        print("8. 等待更多时间观察...")
        time.sleep(10)

        print("=== 登录调试测试完成 ===")

    except Exception as e:
        print(f"❌ 测试过程中发生错误: {e}")
    finally:
        print("关闭浏览器...")
        browser.close()

if __name__ == "__main__":
    test_login_debug()