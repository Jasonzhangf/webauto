# Browser CLI Tool
# 高层浏览器CLI工具，提供profile管理、指纹生成、cookie管理等功能

import argparse
import asyncio
import json
import os
import sys
import uuid
import time
from pathlib import Path
from typing import Dict, Any, Optional

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper
from browser_interface.core.config_manager import ConfigManager
from browser_interface.core.session_manager import SessionManager
from browser_interface.core.overlay_manager import OverlayManager


def create_profile(profile_name: str, base_config: Dict[str, Any]) -> Dict[str, Any]:
    """创建新的浏览器配置文件"""
    profile_dir = Path("./profiles")
    profile_dir.mkdir(exist_ok=True)

    profile_file = profile_dir / f"{profile_name}.json"

    # 生成基础指纹
    profile_config = {
        "profile_id": str(uuid.uuid4()),
        "created_at": time.time(),
        "base_config": base_config,
        "fingerprint": {
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "screen": {"width": 1920, "height": 1080},
            "timezone": "Asia/Shanghai",
            "language": "zh-CN,zh;q=0.9,en;q=0.8",
            "webgl": True,
            "plugins": False,
            "cookies_enabled": True
        }
    }

    with open(profile_file, 'w', encoding='utf-8') as f:
        json.dump(profile_config, f, indent=2, ensure_ascii=False)

    print(f"✅ Profile创建成功: {profile_name}")
    return profile_config


def list_profiles() -> None:
    """列出所有profiles"""
    profile_dir = Path("./profiles")
    if not profile_dir.exists():
        profile_dir.mkdir(exist_ok=True)
        print("📁 创建profiles目录")
        return

    profiles = []
    for profile_file in profile_dir.glob("*.json"):
        try:
            with open(profile_file, 'r', encoding='utf-8') as f:
                profile_data = json.load(f)
                profiles.append({
                    "name": profile_file.stem,
                    "profile_id": profile_data.get("profile_id"),
                    "created_at": profile_data.get("created_at"),
                    "fingerprint": profile_data.get("fingerprint", {})
                })
        except Exception as e:
            print(f"⚠️ 读取profile失败 {profile_file.name}: {str(e)}")

    if profiles:
        print("📋 可用profiles:")
        for profile in profiles:
            print(f"  - {profile['name']} ({profile['profile_id'][:8]}...)")
    else:
        print("📭 暂无profiles")


def reset_profile(profile_name: str) -> None:
    """重置profile为默认状态"""
    profile_file = Path("./profiles") / f"{profile_name}.json"
    if not profile_file.exists():
        print(f"❌ Profile不存在: {profile_name}")
        return

    try:
        with open(profile_file, 'r+', encoding='utf-8') as f:
            profile_data = json.load(f)
            profile_data["fingerprint"] = profile_data.get("fingerprint", {})
            profile_data["reset_count"] = profile_data.get("reset_count", 0) + 1
            profile_data["last_reset"] = time.time()

            # 重置为默认指纹
            profile_data["fingerprint"] = {
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "screen": {"width": 1920, "height": 1080},
                "timezone": "Asia/Shanghai",
                "language": "zh-CN,zh;q=0.9,en;q=0.8",
                "webgl": True,
                "plugins": False,
                "cookies_enabled": True
            }

            f.seek(0)
            json.dump(profile_data, f, indent=2, ensure_ascii=False)

        print(f"🔄 Profile已重置: {profile_name}")
    except Exception as e:
        print(f"❌ 重置profile失败: {str(e)}")


def main():
    parser = argparse.ArgumentParser(description='Browser CLI Tool - 高级浏览器管理工具')
    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    # create命令
    create_parser = subparsers.add_parser('create', help='创建新profile')
    create_parser.add_argument('name', help='Profile名称')

    # list命令
    list_parser = subparsers.add_parser('list', help='列出所有profiles')

    # reset命令
    reset_parser = subparsers.add_parser('reset', help='重置profile')
    reset_parser.add_argument('name', help='Profile名称')

    # launch命令
    launch_parser = subparsers.add_parser('launch', help='启动浏览器')
    launch_parser.add_argument('--profile', default='default', help='使用的profile (默认: default)')
    launch_parser.add_argument('--url', default='https://weibo.com', help='目标URL')
    launch_parser.add_argument('--headless', action='store_true', help='无头模式')
    launch_parser.add_argument('--no-overlay', action='store_true', help='禁用overlay')
    launch_parser.add_argument('--no-cookie-monitor', action='store_true', help='禁用Cookie自动监控')
    launch_parser.add_argument('--cookie-check-interval', type=int, default=30, help='Cookie检查间隔(秒)')

    args = parser.parse_args()

    if args.command == 'create':
        base_config = {
            'headless': False,
            'remote_debugging': False,
            'viewport': {'width': 1440, 'height': 900}
        }
        create_profile(args.name, base_config)

    elif args.command == 'list':
        list_profiles()

    elif args.command == 'reset':
        reset_profile(args.name)

    elif args.command == 'launch':
        # 确保default profile存在
        if args.profile == 'default':
            default_profile_file = Path("./profiles") / "default.json"
            if not default_profile_file.exists():
                print("🔄 创建默认default profile...")
                base_config = {
                    'headless': False,
                    'remote_debugging': False,
                    'viewport': {'width': 1440, 'height': 900}
                }
                create_profile('default', base_config)

        # 读取profile配置
        profile_file = Path("./profiles") / f"{args.profile}.json"
        if not profile_file.exists():
            print(f"❌ Profile不存在: {args.profile}")
            return

        with open(profile_file, 'r', encoding='utf-8') as f:
            profile_config = json.load(f)

        # 合并配置
        browser_config = profile_config.get("base_config", {})
        browser_config.update({
            'headless': args.headless,
            'remote_debugging': not args.headless,
            'auto_overlay': not args.no_overlay,
            'auto_session': True,
            'session_name': f"profile_{args.profile}",
            'cookie_dir': './cookies',
            'profile_id': args.profile,
            'cookie_check_interval': args.cookie_check_interval,
            'cookie_monitoring_enabled': not args.no_cookie_monitor
        })

        # 启动浏览器
        browser = ChromiumBrowserWrapper(browser_config)

        print(f"🌐 浏览器已启动，使用profile: {args.profile}")
        print(f"🔧 目标URL: {args.url}")
        print(f"🍪 Cookie监控: {'启用' if not args.no_cookie_monitor else '禁用'} (检查间隔: {args.cookie_check_interval}秒)")

        try:
            page = browser.goto(args.url)

            # 显示Cookie管理信息
            if hasattr(browser, '_cookie_manager') and not args.no_cookie_monitor:
                cookie_info = browser._cookie_manager.get_cookie_info()
                print(f"📊 Cookie状态: {cookie_info['cookie_file_exists'] and '已有Cookie文件' or '新建Cookie文件'}")

            # 保持浏览器开启
            print("📍 浏览器正在运行，按 Ctrl+C 停止...")
            while True:
                time.sleep(1)

        except KeyboardInterrupt:
            print("\n👋 用户中断，正在关闭浏览器...")
            try:
                # 强制保存Cookie
                if hasattr(browser, '_cookie_manager') and not args.no_cookie_monitor:
                    print("💾 正在保存Cookie...")
                    # 这里需要获取当前的page对象来保存Cookie
                    # 由于页面可能在导航中，我们直接调用cleanup
                    asyncio.run(browser._cookie_manager.cleanup())

                browser.close()
                print("✅ 浏览器已关闭")
            except Exception as e:
                print(f"⚠️ 关闭时出现错误: {e}")
                browser.close()
        except Exception as e:
            print(f"❌ 浏览器运行时错误: {e}")
            browser.close()

    else:
        parser.print_help()


if __name__ == "__main__":
    main()