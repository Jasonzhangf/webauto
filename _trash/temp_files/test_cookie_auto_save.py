#!/usr/bin/env python3
"""
测试Cookie自动保存功能
验证浏览器CLI是否能够自动保存和恢复登录状态
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


async def test_cookie_auto_save():
    """测试Cookie自动保存功能"""
    print("🧪 开始测试Cookie自动保存功能")

    # 测试配置
    test_profile = "test_cookie_profile"
    test_url = "https://weibo.com"

    # 创建测试配置
    browser_config = {
        'headless': False,  # 使用有头模式便于观察
        'auto_overlay': False,  # 禁用overlay避免干扰
        'profile_id': test_profile,
        'cookie_check_interval': 5,  # 5秒检查间隔，便于测试
        'viewport': {'width': 1440, 'height': 900}
    }

    try:
        print(f"📱 启动浏览器，profile: {test_profile}")
        browser = ChromiumBrowserWrapper(browser_config)

        # 第一次导航 - 应该没有登录状态
        print("🌐 第一次导航到微博...")
        page1 = browser.goto(test_url)

        # 等待一段时间让Cookie管理器初始化
        print("⏳ 等待Cookie管理器初始化...")
        await asyncio.sleep(3)

        # 检查Cookie管理器状态
        if hasattr(browser, '_cookie_manager'):
            cookie_info = browser._cookie_manager.get_cookie_info()
            print(f"📊 Cookie管理器状态:")
            print(f"  - 监控启用: {cookie_info['monitoring_enabled']}")
            print(f"  - 检查间隔: {cookie_info['check_interval']}秒")
            print(f"  - Cookie文件存在: {cookie_info['cookie_file_exists']}")
            print(f"  - Cookie文件路径: {cookie_info['cookie_file_path']}")
        else:
            print("❌ Cookie管理器未初始化")
            return False

        print("\n📝 请手动登录微博，测试将在30秒后检查Cookie变化...")
        print("💡 提示：登录完成后，Cookie会自动检测变化并保存")

        # 等待用户登录（30秒）
        for i in range(30, 0, -1):
            print(f"⏰ 倒计时: {i}秒", end='\r')
            await asyncio.sleep(1)

        print("\n🔍 检查Cookie变化...")

        # 检查Cookie是否变化
        initial_cookie_count = len(await page1.page.context.cookies())
        print(f"📈 当前Cookie数量: {initial_cookie_count}")

        # 检查Cookie文件是否已创建
        cookie_file = Path(f"./profiles/{test_profile}_cookies.json")
        if cookie_file.exists():
            print(f"✅ Cookie文件已创建: {cookie_file}")

            # 读取并显示Cookie信息
            with open(cookie_file, 'r', encoding='utf-8') as f:
                cookie_data = json.load(f)

            print(f"📊 Cookie文件信息:")
            print(f"  - Profile名称: {cookie_data.get('profile_name')}")
            print(f"  - 最后更新: {time.ctime(cookie_data.get('last_updated', 0))}")
            print(f"  - Cookie数量: {cookie_data.get('cookie_count', 0)}")
            print(f"  - 域名数量: {len(cookie_data.get('domains', []))}")
            print(f"  - 最后URL: {cookie_data.get('last_url', '')}")

            if cookie_data.get('domains'):
                print(f"  - 涉及域名: {', '.join(cookie_data['domains'])}")
        else:
            print("❌ Cookie文件未创建")
            return False

        print("\n🔄 测试Cookie恢复功能...")
        print("📱 关闭当前浏览器...")

        # 关闭浏览器
        browser.close()

        # 等待一秒
        await asyncio.sleep(1)

        print("📱 重新启动浏览器测试Cookie恢复...")
        browser2 = ChromiumBrowserWrapper(browser_config)

        # 再次导航 - 应该恢复登录状态
        page2 = browser2.goto(test_url)

        # 等待Cookie加载
        print("⏳ 等待Cookie加载...")
        await asyncio.sleep(5)

        # 检查恢复后的Cookie
        restored_cookie_count = len(await page2.page.context.cookies())
        print(f"📈 恢复后Cookie数量: {restored_cookie_count}")

        # 验证结果
        if restored_cookie_count > initial_cookie_count:
            print("✅ Cookie恢复测试成功！")
            success = True
        else:
            print("❌ Cookie恢复测试失败")
            success = False

        # 清理
        print("🧹 清理测试数据...")
        browser2.close()

        # 清理测试文件
        if cookie_file.exists():
            cookie_file.unlink()
            print("🗑️ 测试Cookie文件已删除")

        profile_file = Path(f"./profiles/{test_profile}.json")
        if profile_file.exists():
            profile_file.unlink()
            print("🗑️ 测试Profile文件已删除")

        return success

    except Exception as e:
        print(f"❌ 测试过程中出现错误: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主函数"""
    print("🧪 WebAuto Cookie自动保存功能测试")
    print("=" * 50)

    # 确保必要的目录存在
    os.makedirs("./profiles", exist_ok=True)

    # 运行测试
    success = await test_cookie_auto_save()

    print("\n" + "=" * 50)
    if success:
        print("🎉 所有测试通过！Cookie自动保存功能正常工作")
        print("\n📋 使用说明:")
        print("1. 使用 'python browser_cli.py launch' 启动浏览器")
        print("2. 默认使用 'default' profile，自动保存Cookie")
        print("3. 登录后Cookie会自动检测变化并保存")
        print("4. 下次启动时会自动恢复登录状态")
        print("5. 使用 '--profile <name>' 指定不同的profile")
    else:
        print("❌ 测试失败，请检查错误信息")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())