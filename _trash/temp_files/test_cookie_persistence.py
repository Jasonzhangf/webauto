#!/usr/bin/env python3
"""
验证 Cookie/Profile 持久化功能
测试场景：
1. 用户登录后，cookie 自动保存到 profile
2. 关闭浏览器后，cookie 保存到 session_{name}.json
3. 重新打开浏览器时，自动加载 cookie
4. 验证用户已登录状态
"""
import time
import json
import os
from browser_interface import ChromiumBrowserWrapper


def test_auto_save_on_login():
    """测试登录后自动保存 cookie"""
    print("\n=== 测试 1: 登录后自动保存 Cookie ===")
    
    session_name = "1688_logged_in"
    cookie_file = f"./cookies/session_{session_name}.json"
    
    # 删除旧的 session 文件（如果存在）
    if os.path.exists(cookie_file):
        os.remove(cookie_file)
        print(f"已删除旧的 session 文件: {cookie_file}")
    
    config = {
        "headless": False,
        "session_name": session_name,
        "auto_session": True,  # 启用自动 session 管理
        "auto_save_interval": 10.0,  # 每 10 秒自动保存一次
        "profile_id": "1688-main-v1"  # Profile ID
    }
    
    print(f"1. 启动浏览器（session_name={session_name}, profile_id={config['profile_id']}）...")
    with ChromiumBrowserWrapper(config) as browser:
        page = browser.goto("https://www.1688.com/")
        print("2. 已打开 1688.com")
        
        print("\n请在浏览器中完成登录...")
        print("登录后，脚本将等待 15 秒以便自动保存 cookie")
        print("（自动保存间隔：10秒）\n")
        
        # 等待用户登录
        input("登录完成后，按 Enter 继续...")
        
        # 等待自动保存触发
        print("等待自动保存...")
        time.sleep(15)
        
        # 手动保存一次
        result = browser.save_session(session_name)
        print(f"3. 手动保存 session: {result}")
        
        # 检查 cookie 数量
        state = browser.get_storage_state()
        cookie_count = len(state.get("cookies", []))
        print(f"4. 当前 Cookie 数量: {cookie_count}")
        
        if cookie_count > 0:
            print("✓ Cookie 已保存")
        else:
            print("✗ 警告：没有检测到 Cookie")
    
    # 浏览器关闭后，检查文件
    print(f"\n5. 检查 session 文件: {cookie_file}")
    if os.path.exists(cookie_file):
        with open(cookie_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            saved_cookies = len(data.get("cookies", []))
            print(f"✓ Session 文件已保存")
            print(f"   - 文件路径: {cookie_file}")
            print(f"   - Cookie 数量: {saved_cookies}")
            print(f"   - Origins 数量: {len(data.get('origins', []))}")
    else:
        print(f"✗ Session 文件不存在!")


def test_auto_load_on_restart():
    """测试重启后自动加载 cookie"""
    print("\n\n=== 测试 2: 重启后自动加载 Cookie ===")
    
    session_name = "1688_logged_in"
    cookie_file = f"./cookies/session_{session_name}.json"
    
    if not os.path.exists(cookie_file):
        print(f"✗ Session 文件不存在: {cookie_file}")
        print("   请先运行测试 1 完成登录")
        return
    
    # 读取保存的 cookie 信息
    with open(cookie_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        saved_cookies = len(data.get("cookies", []))
        print(f"1. 检测到已保存的 session: {saved_cookies} 个 Cookie")
    
    config = {
        "headless": False,
        "session_name": session_name,
        "auto_session": True,  # 启用自动加载
        "profile_id": "1688-main-v1"
    }
    
    print(f"2. 重新启动浏览器（自动加载 session）...")
    with ChromiumBrowserWrapper(config) as browser:
        # 检查加载后的 cookie
        state = browser.get_storage_state()
        loaded_cookies = len(state.get("cookies", []))
        print(f"3. 已加载 Cookie 数量: {loaded_cookies}")
        
        if loaded_cookies > 0:
            print("✓ Cookie 已自动加载")
        else:
            print("✗ Cookie 未加载")
        
        # 访问 1688 验证登录状态
        print("4. 访问 1688.com 验证登录状态...")
        page = browser.goto("https://www.1688.com/")
        time.sleep(3)
        
        # 检查是否有用户头像/昵称（登录成功的标志）
        try:
            # 1688 登录后的用户头像元素
            avatar_exists = page._page.locator(".userAvatarLogo").count() > 0
            nickname_exists = page._page.locator(".member-nickname").count() > 0
            
            if avatar_exists or nickname_exists:
                print("✓ 登录状态已恢复（检测到用户头像/昵称）")
                
                # 尝试获取用户昵称
                if nickname_exists:
                    nickname = page._page.locator(".member-nickname").first.text_content()
                    print(f"   用户昵称: {nickname}")
            else:
                print("⚠ 未检测到登录状态（可能需要重新登录或 Cookie 已过期）")
        except Exception as e:
            print(f"⚠ 验证登录状态时出错: {e}")
        
        print("\n保持浏览器打开 10 秒以便手动检查...")
        time.sleep(10)


def test_manual_save_restore():
    """测试手动保存和恢复"""
    print("\n\n=== 测试 3: 手动保存和恢复 ===")
    
    session_name = "1688_manual_test"
    
    config = {
        "headless": False,
        "session_name": session_name,
        "auto_session": False,  # 关闭自动保存，手动控制
        "profile_id": "1688-manual"
    }
    
    print("1. 启动浏览器（手动模式）...")
    with ChromiumBrowserWrapper(config) as browser:
        page = browser.goto("https://www.1688.com/")
        
        print("2. 请在浏览器中登录...")
        input("登录完成后，按 Enter 继续...")
        
        # 手动保存
        print("3. 手动保存 session...")
        result = browser.save_session(session_name)
        print(f"   结果: {result}")
    
    print("\n4. 重新启动浏览器并手动恢复 session...")
    with ChromiumBrowserWrapper({"headless": False}) as browser:
        # 手动恢复
        print("5. 手动恢复 session...")
        result = browser.restore_session(session_name)
        print(f"   结果: {result}")
        
        if result.get("success"):
            print(f"   - Cookie 数量: {result.get('cookies_loaded', 0)}")
            print(f"   - Origins 数量: {result.get('origins_loaded', 0)}")
            
            # 访问验证
            page = browser.goto("https://www.1688.com/")
            time.sleep(5)
            print("✓ Session 已恢复，请在浏览器中验证登录状态")
        else:
            print(f"✗ 恢复失败: {result.get('error')}")
        
        time.sleep(10)


if __name__ == "__main__":
    print("=" * 60)
    print("Cookie/Profile 持久化功能验证")
    print("=" * 60)
    
    print("\n注意事项：")
    print("1. Session 文件保存在 ./cookies/ 目录")
    print("2. 文件名格式: session_{name}.json")
    print("3. auto_session=True 时自动保存和加载")
    print("4. 关闭浏览器时会自动保存最新状态")
    print("=" * 60)
    
    # 运行测试
    test_auto_save_on_login()
    
    print("\n\n按 Enter 继续测试自动加载...")
    input()
    
    test_auto_load_on_restart()
    
    print("\n\n按 Enter 继续测试手动保存/恢复...")
    input()
    
    test_manual_save_restore()
    
    print("\n" + "=" * 60)
    print("所有测试完成!")
    print("=" * 60)
