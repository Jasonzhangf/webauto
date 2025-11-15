#!/usr/bin/env python3
"""
基础浏览器功能测试（空白窗口）

目标：
- 使用统一入口 browser_interface.create_browser
- 弹出一个可见的空白浏览器窗口（非无头）
- 保留“自动加载和保存 Cookie 会话”的能力，但本测试默认不预加载 Cookie
"""

from browser_interface import create_browser


def main() -> None:
    # 基础配置：有界面 + 中文环境
    # 如需启用自动会话保存/加载，可将 auto_session 设置为 True
    config = {
        "headless": False,
        # "auto_session": True,
        # "session_name": "default",
    }

    # 使用上下文管理器，确保退出时浏览器能正确关闭
    with create_browser(config) as browser:
        # 只创建一个新页面，不导航到任何网址 -> about:blank
        browser.new_page()
        print("✅ 已弹出基础空白浏览器窗口（about:blank）")
        input("👀 请在前台确认窗口已弹出，按 Enter 结束测试并关闭浏览器...")


if __name__ == "__main__":
    main()

