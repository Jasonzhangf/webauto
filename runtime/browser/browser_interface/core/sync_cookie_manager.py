"""
同步Cookie管理器 - 兼容Playwright同步API
简单的Cookie监控和保存功能
"""

import json
import time
import hashlib
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional

from .paths import PROFILES_DIR


class SyncCookieManager:
    """同步Cookie管理器"""

    def __init__(self, profile_name: str, profile_dir: Path = None):
        self.profile_name = profile_name
        base_dir = profile_dir or PROFILES_DIR
        self.profile_dir = Path(base_dir).expanduser()
        self.cookie_file = self.profile_dir / f"{profile_name}_cookies.json"

        # 监控配置
        self.monitoring_enabled = True
        self.check_interval = 30  # 30秒检查间隔
        self.last_cookie_count = 0
        self.last_cookie_hash = ""

        # 状态
        self.monitoring_thread: Optional[threading.Thread] = None
        self.stop_monitoring_flag = False

        # 创建目录
        self.profile_dir.mkdir(parents=True, exist_ok=True)

    def start_monitoring(self, browser_context) -> bool:
        """开始Cookie监控"""
        try:
            # 初始加载已有Cookie
            self.load_cookies(browser_context)

            # 启动监控线程
            self.stop_monitoring_flag = False
            self.monitoring_thread = threading.Thread(
                target=self._monitoring_loop,
                args=(browser_context,),
                daemon=True
            )
            self.monitoring_thread.start()

            print(f"🍪 Cookie监控已启动，profile: {self.profile_name}")
            return True

        except Exception as e:
            print(f"启动Cookie监控失败: {e}")
            return False

    def stop_monitoring(self):
        """停止Cookie监控"""
        self.stop_monitoring_flag = True
        if self.monitoring_thread and self.monitoring_thread.is_alive():
            self.monitoring_thread.join(timeout=5)
        print("Cookie监控已停止")

    def load_cookies(self, browser_context) -> bool:
        """加载Cookie到浏览器"""
        try:
            if not self.cookie_file.exists():
                print(f"Cookie文件不存在: {self.cookie_file}")
                return False

            with open(self.cookie_file, 'r', encoding='utf-8') as f:
                cookie_data = json.load(f)

            if not cookie_data.get('cookies'):
                print("Cookie文件为空")
                return False

            # 应用Cookie
            cookies_applied = 0
            for cookie in cookie_data['cookies']:
                try:
                    browser_context.add_cookies([cookie])
                    cookies_applied += 1
                except Exception as e:
                    print(f"应用Cookie失败: {cookie.get('name', 'unknown')} - {e}")

            print(f"已加载 {cookies_applied} 个Cookie")
            return cookies_applied > 0

        except Exception as e:
            print(f"加载Cookie失败: {e}")
            return False

    def save_cookies(self, browser_context, force: bool = False) -> bool:
        """保存Cookie到文件"""
        try:
            # 获取当前所有Cookie
            cookies = browser_context.cookies()

            if not cookies:
                print("当前没有Cookie需要保存")
                return False

            # 计算Cookie数量和哈希值
            cookie_count = len(cookies)
            cookie_hash = self._calculate_cookie_hash(cookies)

            # 检查是否有变化
            if not force and cookie_count == self.last_cookie_count and cookie_hash == self.last_cookie_hash:
                print("Cookie没有变化，跳过保存")
                return False

            # 获取域名信息
            domains = set()
            for cookie in cookies:
                if cookie.get('domain'):
                    domains.add(cookie['domain'])

            # 保存到文件
            save_data = {
                'profile_name': self.profile_name,
                'last_updated': time.time(),
                'cookie_count': cookie_count,
                'domains': list(domains),
                'cookies': cookies
            }

            with open(self.cookie_file, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, indent=2, ensure_ascii=False)

            self.last_cookie_count = cookie_count
            self.last_cookie_hash = cookie_hash
            print(f"Cookie已保存: {cookie_count} 个Cookie到 {len(domains)} 个域名")
            return True

        except Exception as e:
            print(f"保存Cookie失败: {e}")
            return False

    def _monitoring_loop(self, browser_context):
        """Cookie监控循环"""
        print(f"Cookie监控循环启动，检查间隔: {self.check_interval}秒")

        while not self.stop_monitoring_flag:
            try:
                # 等待检查间隔
                for _ in range(self.check_interval):
                    if self.stop_monitoring_flag:
                        break
                    time.sleep(1)

                if self.stop_monitoring_flag:
                    break

                # 获取当前Cookie状态
                cookies = browser_context.cookies()
                current_count = len(cookies)
                current_hash = self._calculate_cookie_hash(cookies)

                # 检查是否有变化
                if current_count != self.last_cookie_count or current_hash != self.last_cookie_hash:
                    print(f"检测到Cookie变化，开始稳定性检查")

                    # Cookie有变化，短间隔再次检查确认变化
                    time.sleep(5)  # 5秒后再检查

                    if self.stop_monitoring_flag:
                        break

                    # 再次获取Cookie
                    new_cookies = browser_context.cookies()
                    new_count = len(new_cookies)
                    new_hash = self._calculate_cookie_hash(new_cookies)

                    # 如果新哈希与之前相同，说明Cookie已稳定
                    if new_count == current_count and new_hash == current_hash:
                        # Cookie已稳定，保存
                        self.save_cookies(browser_context, force=True)
                        print("Cookie变化已稳定并保存")
                    else:
                        # Cookie仍在变化，继续监控
                        print("Cookie仍在变化中，继续监控")
                        self.last_cookie_count = new_count
                        self.last_cookie_hash = new_hash
                        continue

            except Exception as e:
                print(f"Cookie监控循环错误: {e}")
                time.sleep(self.check_interval)

    def _calculate_cookie_hash(self, cookies: List[Dict[str, Any]]) -> str:
        """计算Cookie哈希值"""
        # 创建规范化的Cookie字符串用于哈希
        cookie_items = []
        for cookie in sorted(cookies, key=lambda x: (x.get('name', ''), x.get('domain', ''))):
            key_data = {
                'name': cookie.get('name', ''),
                'value': cookie.get('value', ''),
                'domain': cookie.get('domain', ''),
                'path': cookie.get('path', ''),
                'httpOnly': cookie.get('httpOnly', False),
                'secure': cookie.get('secure', False),
                'sameSite': cookie.get('sameSite', '')
            }
            cookie_items.append(json.dumps(key_data, sort_keys=True))

        cookie_string = '|'.join(cookie_items)
        return hashlib.sha256(cookie_string.encode('utf-8')).hexdigest()

    def get_cookie_info(self) -> Dict[str, Any]:
        """获取Cookie管理信息"""
        return {
            'profile_name': self.profile_name,
            'monitoring_enabled': self.monitoring_enabled,
            'check_interval': self.check_interval,
            'cookie_file_exists': self.cookie_file.exists(),
            'last_cookie_count': self.last_cookie_count,
            'cookie_file_path': str(self.cookie_file)
        }
