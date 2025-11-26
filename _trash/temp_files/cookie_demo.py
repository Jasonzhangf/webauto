#!/usr/bin/env python3
"""
Cookie自动保存功能演示
展示浏览器CLI如何像普通浏览器一样自动保存登录状态
"""

import subprocess
import time
import sys
import os
from pathlib import Path


def show_banner():
    """显示横幅"""
    print("🌐 WebAuto Cookie自动保存功能演示")
    print("=" * 50)
    print("✨ 功能特性:")
    print("  🍪 自动检测Cookie变化（每30秒）")
    print("  💾 Cookie稳定后自动保存到profile")
    print("  🔄 下次启动时自动恢复登录状态")
    print("  📁 支持多个profile隔离")
    print("  🎯 默认使用default profile")


def show_usage():
    """显示使用说明"""
    print("\n📋 使用步骤:")
    print("\n1️⃣ 启动浏览器（自动使用default profile）:")
    print("   python browser_cli.py launch")
    print("\n2️⃣ 或者指定自定义profile:")
    print("   python browser_cli.py launch --profile myprofile")
    print("\n3️⃣ 访问网站并登录（如微博、淘宝等）")
    print("\n4️⃣ 登录后Cookie会自动检测变化并保存")
    print("\n5️⃣ 关闭浏览器后重新启动，自动恢复登录状态")
    print("\n🔧 高级选项:")
    print("  --cookie-check-interval 30    # Cookie检查间隔（秒）")
    print("  --no-cookie-monitor           # 禁用Cookie自动监控")
    print("  --headless                    # 无头模式")
    print("  --profile <name>              # 指定profile名称")


def show_profiles():
    """显示现有profiles"""
    print("\n📁 当前Profiles:")
    profiles_dir = Path("./profiles")

    if not profiles_dir.exists():
        print("   (暂无profiles目录)")
        return

    profile_files = list(profiles_dir.glob("*.json"))
    cookie_files = list(profiles_dir.glob("*_cookies.json"))

    if profile_files:
        for profile_file in profile_files:
            profile_name = profile_file.stem
            cookie_file = profiles_dir / f"{profile_name}_cookies.json"
            has_cookies = cookie_file.exists()

            print(f"   📂 {profile_name}")
            print(f"      {'✅' if has_cookies else '❌'} Cookie文件: {has_cookies}")

            if has_cookies:
                try:
                    import json
                    with open(cookie_file, 'r', encoding='utf-8') as f:
                        cookie_data = json.load(f)
                    print(f"      🍪 Cookie数量: {cookie_data.get('cookie_count', 0)}")
                    print(f"      🌐 最后访问: {cookie_data.get('last_url', 'N/A')}")
                    print(f"      ⏰ 更新时间: {time.ctime(cookie_data.get('last_updated', 0))}")
                except:
                    print("      ⚠️ Cookie文件读取失败")
    else:
        print("   (暂无profiles)")


def run_demo():
    """运行演示"""
    print("\n🚀 开始演示...")
    print("📍 将启动浏览器访问微博，请观察Cookie自动保存功能")
    print("💡 提示：登录微博后，Cookie会自动检测变化并保存")
    print("\n按Enter键开始演示，或输入'q'退出...")

    user_input = input().strip()
    if user_input.lower() == 'q':
        print("👋 演示取消")
        return

    try:
        print("\n🌐 启动浏览器...")
        # 启动浏览器CLI
        process = subprocess.Popen([
            sys.executable, "browser_cli.py", "launch",
            "--url", "https://weibo.com",
            "--cookie-check-interval", "15"  # 15秒检查间隔便于演示
        ], cwd=os.path.dirname(os.path.abspath(__file__)))

        print("✅ 浏览器已启动")
        print("📍 现在可以:")
        print("  1. 登录微博账号")
        print("  2. 观察Cookie自动检测（每15秒）")
        print("  3. 关闭浏览器后重新启动测试Cookie恢复")
        print("\n按Ctrl+C停止演示...")

        # 等待进程结束
        process.wait()

    except KeyboardInterrupt:
        print("\n👋 演示中断")
        if process.poll() is None:
            process.terminate()
            process.wait()
    except Exception as e:
        print(f"❌ 演示失败: {e}")


def main():
    """主函数"""
    show_banner()
    show_usage()
    show_profiles()

    print("\n" + "=" * 50)
    print("🎯 选择操作:")
    print("  1. 📖 查看使用说明")
    print("  2. 🚀 运行演示")
    print("  3. 📁 查看profiles")
    print("  4. ❌ 退出")

    try:
        choice = input("\n请选择 (1-4): ").strip()

        if choice == '1':
            show_usage()
        elif choice == '2':
            run_demo()
        elif choice == '3':
            show_profiles()
        elif choice == '4':
            print("👋 再见！")
        else:
            print("❌ 无效选择")
            main()

    except KeyboardInterrupt:
        print("\n👋 演示取消")


if __name__ == "__main__":
    main()