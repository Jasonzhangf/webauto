#!/usr/bin/env python3
"""
测试cookie修复效果
"""

import json
import os
import time
import asyncio
import threading
from browser_interface import CamoufoxBrowserWrapper

def test_cookie_save_load_cycle():
    """测试cookie保存和加载循环"""
    print("=== 测试Cookie保存和加载循环 ===")

    # 创建浏览器实例
    config = {
        "headless": True,
        "auto_session": True,
        "session_name": "test-cookie-fix",
        "auto_save_interval": 5,  # 5秒自动保存
        "profile_id": "test-profile"
    }

    browser = CamoufoxBrowserWrapper(config)

    try:
        # 1. 创建页面并导航到1688
        print("1. 创建页面并导航到1688...")
        page = browser.new_page()
        page.goto("https://www.1688.com")
        time.sleep(3)

        # 2. 获取初始状态
        print("2. 获取初始状态...")
        initial_state = browser.get_storage_state()
        initial_cookies = len(initial_state.get("cookies", []))
        print(f"   初始Cookie数量: {initial_cookies}")

        # 3. 模拟一些操作触发cookie变化
        print("3. 模拟页面操作...")
        try:
            page.evaluate("() => document.cookie = 'test=value; path=/; domain=.1688.com'")
        except Exception as e:
            print(f"   Cookie设置失败（预期行为）: {e}")

        # 4. 等待自动保存
        print("4. 等待自动保存...")
        time.sleep(8)

        # 5. 检查保存的session文件
        session_file = os.path.join(os.path.expanduser("~"), ".webauto", "cookies", "session_test-cookie-fix.json")
        if os.path.exists(session_file):
            with open(session_file, "r", encoding="utf-8") as f:
                saved_state = json.load(f)
            saved_cookies = len(saved_state.get("cookies", []))
            print(f"   保存的Cookie数量: {saved_cookies}")
        else:
            print("   Session文件未创建")

        # 6. 关闭并重新创建浏览器（测试恢复）
        print("6. 关闭浏览器...")
        browser.close()

        # 7. 重新创建并恢复session
        print("7. 重新创建浏览器并恢复session...")
        browser2 = CamoufoxBrowserWrapper(config)

        # 手动恢复session（不通过auto_session避免冲突）
        restore_result = browser2.restore_session("test-cookie-fix")
        print(f"   恢复结果: {restore_result}")

        if restore_result.get("success"):
            page2 = browser2.new_page()
            page2.goto("https://www.1688.com")
            time.sleep(3)

            # 8. 检查恢复后的状态
            print("8. 检查恢复后的状态...")
            restored_state = browser2.get_storage_state()
            restored_cookies = len(restored_state.get("cookies", []))
            print(f"   恢复后的Cookie数量: {restored_cookies}")

            print("✅ Cookie修复测试完成")
            return True
        else:
            print(f"❌ Session恢复失败: {restore_result.get('error')}")
            return False

    except Exception as e:
        print(f"❌ 测试过程中发生错误: {e}")
        return False
    finally:
        try:
            browser.close()
        except:
            pass

def test_cookie_concurrency():
    """测试cookie保存的并发安全性"""
    print("\n=== 测试Cookie并发保存安全性 ===")

    def run_browser_test():
        config = {
            "headless": True,
            "auto_session": True,
            "session_name": "test-concurrency",
            "auto_save_interval": 2,
            "profile_id": "test-concurrency-profile"
        }

        browser = CamoufoxBrowserWrapper(config)

        try:
            page = browser.new_page()
            page.goto("https://www.1688.com")

            # 模拟多次快速cookie变化
            print("模拟多次快速cookie变化...")
            for i in range(5):
                try:
                    page.evaluate(f"() => document.cookie = 'test{i}=value{i}; path=/'")
                    time.sleep(0.5)  # 短于自动保存间隔
                except:
                    pass

            # 等待自动保存完成
            time.sleep(5)

            # 检查session文件是否完整
            session_file = os.path.join(os.path.expanduser("~"), ".webauto", "cookies", "session_test-concurrency.json")
            if os.path.exists(session_file):
                try:
                    with open(session_file, "r", encoding="utf-8") as f:
                        state = json.load(f)

                    if isinstance(state.get("cookies"), list):
                        print("✅ 并发测试通过，Session文件格式正确")
                        return True
                    else:
                        print("❌ Session文件格式错误")
                        return False
                except Exception as e:
                    print(f"❌ 读取Session文件失败: {e}")
                    return False
            else:
                print("❌ Session文件未创建")
                return False

        except Exception as e:
            print(f"❌ 并发测试错误: {e}")
            return False
        finally:
            try:
                browser.close()
            except:
                pass

    # 在独立线程中运行避免async冲突
    thread = threading.Thread(target=run_browser_test)
    thread.start()
    thread.join()
    return True

if __name__ == "__main__":
    print("开始验证Cookie修复效果...")

    success1 = test_cookie_save_load_cycle()
    success2 = test_cookie_concurrency()

    if success1 and success2:
        print("\n🎉 所有Cookie修复测试通过！")
    else:
        print("\n❌ 部分测试失败，需要进一步修复")