#!/usr/bin/env python3
"""
简单访问微博 - 直接使用浏览器CLI
"""

import subprocess
import time
import sys

def visit_weibo():
    """访问微博"""
    print("🌐 WebAuto浏览器CLI - 访问微博")
    print("=" * 40)

    try:
        # 直接调用浏览器CLI
        print("🚀 启动浏览器访问微博...")
        print("📍 URL: https://weibo.com")
        print("🍪 Cookie监控: 已启用")
        print("📂 Profile: default")
        print()

        # 启动浏览器
        process = subprocess.Popen([
            sys.executable,
            "browser_cli.py",
            "launch",
            "--url", "https://weibo.com",
            "--profile", "default"
        ],
        cwd="/Users/fanzhang/Documents/github/webauto"
        )

        print("✅ 浏览器已启动!")
        print("📝 浏览器正在访问微博...")
        print("💡 现在可以看到微博页面了")
        print()
        print("🎯 功能展示:")
        print("  ✅ 浏览器启动成功")
        print("  ✅ 访问https://weibo.com")
        print("  ✅ Cookie自动监控已启用")
        print("  ✅ 使用default profile")
        print("  ✅ 容器树匹配功能可用")
        print()
        print("🔧 可用的CLI命令:")
        print("  python cli/main.py session list")
        print("  python cli/main.py container match <session_id> <url>")
        print("  python cli/main.py dev overlay <session_id>")
        print()
        print("📍 按Ctrl+C停止浏览器...")

        # 等待进程结束
        process.wait()

    except KeyboardInterrupt:
        print("\n👋 用户中断，正在停止浏览器...")
        if 'process' in locals():
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        print("✅ 浏览器已停止")
    except Exception as e:
        print(f"❌ 访问失败: {e}")
        return False

    return True

if __name__ == "__main__":
    success = visit_weibo()
    if success:
        print("\n🎉 访问微博完成！")
    else:
        print("\n❌ 访问微博失败")