#!/usr/bin/env python3
"""
WebAuto 浏览器CLI工具
提供浏览器接管、控制和检查功能
"""

import argparse
import json
import sys
import time
import asyncio
from typing import Dict, Any, Optional
import requests
from pathlib import Path

class BrowserCLI:
    """浏览器CLI控制器"""

    def __init__(self, api_base: str = "http://localhost:8888"):
        self.api_base = api_base.rstrip('/')
        self.session_id = None

    def _make_request(self, endpoint: str, method: str = "GET", data: Dict = None) -> Dict[str, Any]:
        """发送API请求"""
        url = f"{self.api_base}{endpoint}"
        headers = {"Content-Type": "application/json"}

        try:
            if method == "GET":
                response = requests.get(url, headers=headers)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data or {})
            elif method == "DELETE":
                response = requests.delete(url, headers=headers)
            else:
                raise ValueError(f"不支持的HTTP方法: {method}")

            response.raise_for_status()
            return response.json()

        except requests.exceptions.ConnectionError:
            print(f"❌ 无法连接到浏览器服务: {self.api_base}")
            print("请确保浏览器服务正在运行: python -m services.browser_api")
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f"❌ API请求失败: {e}")
            return {"success": False, "error": str(e)}

    def start_service(self, browser_type: str = "chromium", headless: bool = False):
        """启动浏览器服务"""
        config = {
            "browser_type": browser_type,
            "headless": headless,
            "remote_debugging": True,  # 启用远程调试
            "debug_port": 9222
        }

        print(f"🚀 启动{browser_type}浏览器服务...")
        result = self._make_request("/api/v1/service/start", "POST", config)

        if result.get("success"):
            print("✅ 浏览器服务启动成功")
            print(f"   调试端口: 9222")
            print(f"   DevTools: http://localhost:9222")
        else:
            print(f"❌ 启动失败: {result.get('error')}")

        return result

    def create_session(self, profile_id: str = "default"):
        """创建浏览器会话"""
        profile = {
            "profile_id": profile_id,
            "viewport": {"width": 1440, "height": 900},
            "timezone": "Asia/Shanghai"
        }

        data = {"profile": profile}
        print(f"🔗 创建浏览器会话: {profile_id}")

        result = self._make_request("/api/v1/sessions", "POST", data)

        if result.get("success"):
            self.session_id = result["data"]["session_id"]
            print(f"✅ 会话创建成功: {self.session_id}")
        else:
            print(f"❌ 会话创建失败: {result.get('error')}")

        return result

    def navigate(self, url: str):
        """导航到指定URL"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        action = {
            "type": "navigate",
            "url": url
        }

        print(f"🌐 导航到: {url}")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/actions", "POST", action)

        if result.get("success"):
            print("✅ 导航成功")
        else:
            print(f"❌ 导航失败: {result.get('error')}")

        return result

    def get_page_info(self):
        """获取页面信息"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        print("📊 获取页面信息...")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/info", "GET")

        if result.get("success"):
            info = result["data"]
            print(f"📄 标题: {info.get('title', 'Unknown')}")
            print(f"🌐 URL: {info.get('url', 'Unknown')}")
            print(f"⏱️ 加载时间: {info.get('load_time', 0):.2f}s")
        else:
            print(f"❌ 获取页面信息失败: {result.get('error')}")

        return result

    def execute_script(self, script: str):
        """执行JavaScript脚本"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        action = {
            "type": "execute_script",
            "script": script
        }

        print(f"🔧 执行脚本: {script[:50]}...")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/actions", "POST", action)

        if result.get("success"):
            output = result["data"].get("result", "")
            print(f"✅ 脚本执行结果: {output}")
        else:
            print(f"❌ 脚本执行失败: {result.get('error')}")

        return result

    def inspect_dom(self, selector: str = None):
        """检查DOM元素"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        action = {
            "type": "inspect_dom",
            "selector": selector
        }

        print(f"🔍 检查DOM: {selector or 'document'}")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/actions", "POST", action)

        if result.get("success"):
            elements = result["data"].get("elements", [])
            print(f"✅ 找到 {len(elements)} 个元素:")
            for i, elem in enumerate(elements[:10]):  # 限制显示前10个
                tag = elem.get("tag_name", "")
                text = elem.get("text_content", "")[:50]
                class_list = elem.get("class_list", [])
                classes = f".{'..'.join(class_list)}" if class_list else ""
                print(f"   {i+1}. <{tag}>{classes} - {text}")

            if len(elements) > 10:
                print(f"   ... 还有 {len(elements) - 10} 个元素")
        else:
            print(f"❌ DOM检查失败: {result.get('error')}")

        return result

    def screenshot(self, filename: str = None):
        """页面截图"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        if not filename:
            filename = f"screenshot_{int(time.time())}.png"

        action = {
            "type": "screenshot",
            "filename": filename
        }

        print(f"📸 截图保存到: {filename}")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/actions", "POST", action)

        if result.get("success"):
            print("✅ 截图成功")
        else:
            print(f"❌ 截图失败: {result.get('error')}")

        return result

    def take_screenshot(self, filename: Optional[str] = None):
        """页面截图"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        if not filename:
            filename = f"screenshot_{int(time.time())}.png"

        action = {
            "type": "screenshot",
            "filename": filename
        }

        print(f"📸 截图保存到: {filename}")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/actions", "POST", action)

        if result.get("success"):
            print("✅ 截图成功")
        else:
            print(f"❌ 截图失败: {result.get('error')}")

        return result

    def get_cookies(self):
        """获取Cookies"""
        if not self.session_id:
            print("❌ 请先创建会话")
            return

        print("🍪 获取Cookies...")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}/cookies", "GET")

        if result.get("success"):
            cookies = result["data"].get("cookies", [])
            print(f"✅ 共 {len(cookies)} 个Cookies:")
            for cookie in cookies[:5]:  # 显示前5个
                name = cookie.get("name", "")
                domain = cookie.get("domain", "")
                print(f"   {name} @ {domain}")

            if len(cookies) > 5:
                print(f"   ... 还有 {len(cookies) - 5} 个Cookies")
        else:
            print(f"❌ 获取Cookies失败: {result.get('error')}")

        return result

    def list_sessions(self):
        """列出所有会话"""
        print("📋 列出所有会话...")
        result = self._make_request("/api/v1/sessions", "GET")

        if result.get("success"):
            sessions = result["data"].get("sessions", [])
            if not sessions:
                print("   没有活跃会话")
                return

            print(f"✅ 共 {len(sessions)} 个会话:")
            for session in sessions:
                session_id = session.get("session_id", "")
                profile_id = session.get("profile_id", "")
                status = session.get("status", "unknown")
                current = "👉" if session_id == self.session_id else "  "
                print(f"   {current} {session_id} ({profile_id}) - {status}")
        else:
            print(f"❌ 获取会话列表失败: {result.get('error')}")

        return result

    def close_session(self):
        """关闭当前会话"""
        if not self.session_id:
            print("❌ 没有要关闭的会话")
            return

        print(f"🔒 关闭会话: {self.session_id}")
        result = self._make_request(f"/api/v1/sessions/{self.session_id}", "DELETE")

        if result.get("success"):
            print("✅ 会话已关闭")
            self.session_id = None
        else:
            print(f"❌ 关闭会话失败: {result.get('error')}")

        return result

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="WebAuto 浏览器控制CLI工具")
    parser.add_argument("--api-base", default="http://localhost:8888", help="API服务地址")

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 启动服务
    start_parser = subparsers.add_parser("start", help="启动浏览器服务")
    start_parser.add_argument("--type", choices=["chromium", "camoufox"], default="chromium", help="浏览器类型")
    start_parser.add_argument("--headless", action="store_true", help="无头模式")

    # 创建会话
    session_parser = subparsers.add_parser("session", help="创建浏览器会话")
    session_parser.add_argument("--profile", default="default", help="配置文件ID")

    # 页面操作
    nav_parser = subparsers.add_parser("navigate", help="导航到URL")
    nav_parser.add_argument("url", help="目标URL")

    # 信息获取
    subparsers.add_parser("info", help="获取页面信息")
    subparsers.add_parser("cookies", help="获取Cookies")
    subparsers.add_parser("sessions", help="列出所有会话")

    # DOM操作
    dom_parser = subparsers.add_parser("dom", help="检查DOM元素")
    dom_parser.add_argument("--selector", help="CSS选择器")

    # 脚本执行
    script_parser = subparsers.add_parser("script", help="执行JavaScript")
    script_parser.add_argument("script", help="JavaScript代码")

    # 截图
    shot_parser = subparsers.add_parser("screenshot", help="页面截图")
    shot_parser.add_argument("--filename", help="保存文件名")

    # 关闭会话
    subparsers.add_parser("close", help="关闭当前会话")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    cli = BrowserCLI(args.api_base)

    # 执行命令
    if args.command == "start":
        cli.start_service(args.type, args.headless)

    elif args.command == "session":
        cli.create_session(args.profile)

    elif args.command == "navigate":
        cli.navigate(args.url)

    elif args.command == "info":
        cli.get_page_info()

    elif args.command == "cookies":
        cli.get_cookies()

    elif args.command == "sessions":
        cli.list_sessions()

    elif args.command == "dom":
        cli.inspect_dom(args.selector)

    elif args.command == "script":
        cli.execute_script(args.script)

    elif args.command == "screenshot":
        cli.screenshot(args.filename)

    elif args.command == "close":
        cli.close_session()

if __name__ == "__main__":
    main()