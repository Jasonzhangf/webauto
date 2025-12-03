"""
Cookie管理器 - 自动监控、保存和恢复Cookie
"""

import asyncio
import json
import time
import hashlib
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, asdict
import logging

from .paths import PROFILES_DIR


@dataclass
class CookieSnapshot:
    """Cookie快照"""
    timestamp: float
    cookie_hash: str
    cookie_data: List[Dict[str, Any]]
    domains: Set[str]
    url: str


class CookieManager:
    """Cookie自动管理器"""

    def __init__(self, profile_name: str, profile_dir: Path = None):
        self.profile_name = profile_name
        base_dir = profile_dir or PROFILES_DIR
        self.profile_dir = Path(base_dir).expanduser()
        self.cookie_file = self.profile_dir / f"{profile_name}_cookies.json"
        self.logger = logging.getLogger(__name__)

        # 监控配置
        self.monitoring_enabled = True
        self.check_interval = 30  # 30秒检查间隔
        self.stability_threshold = 2  # Cookie需要稳定2次检查才保存
        self.max_history = 10  # 保留最近10次快照

        # 状态
        self.current_cookies: Dict[str, Any] = {}
        self.last_hash: str = ""
        self.stable_count = 0
        self.cookie_history: List[CookieSnapshot] = []
        self.monitoring_task: Optional[asyncio.Task] = None

        # 创建目录
        self.profile_dir.mkdir(parents=True, exist_ok=True)

    async def start_monitoring(self, browser_session) -> bool:
        """开始Cookie监控"""
        try:
            # 初始加载已有Cookie
            await self.load_cookies(browser_session)

            # 启动监控任务
            self.monitoring_task = asyncio.create_task(self._monitoring_loop(browser_session))

            self.logger.info(f"Cookie监控已启动，profile: {self.profile_name}")
            return True

        except Exception as e:
            self.logger.error(f"启动Cookie监控失败: {e}")
            return False

    async def stop_monitoring(self):
        """停止Cookie监控"""
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
            self.monitoring_task = None

        self.logger.info("Cookie监控已停止")

    async def load_cookies(self, browser_session) -> bool:
        """加载Cookie到浏览器"""
        try:
            if not self.cookie_file.exists():
                self.logger.info(f"Cookie文件不存在: {self.cookie_file}")
                return False

            with open(self.cookie_file, 'r', encoding='utf-8') as f:
                cookie_data = json.load(f)

            if not cookie_data.get('cookies'):
                self.logger.info("Cookie文件为空")
                return False

            # 获取当前页面URL以确定域名
            current_url = browser_session.url
            current_domain = self._extract_domain(current_url)

            # 过滤并应用相关的Cookie
            cookies_applied = 0
            for cookie in cookie_data['cookies']:
                if self._is_cookie_for_domain(cookie, current_domain):
                    try:
                        await browser_session.context.add_cookies([cookie])
                        cookies_applied += 1
                    except Exception as e:
                        self.logger.warning(f"应用Cookie失败: {cookie.get('name', 'unknown')} - {e}")

            self.logger.info(f"已加载 {cookies_applied} 个Cookie到 {current_domain}")
            return cookies_applied > 0

        except Exception as e:
            self.logger.error(f"加载Cookie失败: {e}")
            return False

    async def save_cookies(self, browser_session, force: bool = False) -> bool:
        """保存Cookie到文件"""
        try:
            # 获取当前所有Cookie
            cookies = await browser_session.context.cookies()
            current_url = browser_session.url

            if not cookies:
                self.logger.debug("当前没有Cookie需要保存")
                return False

            # 计算Cookie哈希值
            cookie_hash = self._calculate_cookie_hash(cookies)

            # 检查是否有变化
            if not force and cookie_hash == self.last_hash:
                self.logger.debug("Cookie没有变化，跳过保存")
                return False

            # 获取域名信息
            domains = set()
            for cookie in cookies:
                if cookie.get('domain'):
                    domains.add(cookie['domain'])

            # 创建Cookie快照
            snapshot = CookieSnapshot(
                timestamp=time.time(),
                cookie_hash=cookie_hash,
                cookie_data=cookies,
                domains=domains,
                url=current_url
            )

            # 更新历史记录
            self.cookie_history.append(snapshot)
            if len(self.cookie_history) > self.max_history:
                self.cookie_history.pop(0)

            # 保存到文件
            save_data = {
                'profile_name': self.profile_name,
                'last_updated': time.time(),
                'last_url': current_url,
                'cookie_count': len(cookies),
                'domains': list(domains),
                'cookies': cookies,
                'history': [
                    {
                        'timestamp': snap.timestamp,
                        'cookie_hash': snap.cookie_hash,
                        'url': snap.url,
                        'cookie_count': len(snap.cookie_data)
                    }
                    for snap in self.cookie_history
                ]
            }

            with open(self.cookie_file, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, indent=2, ensure_ascii=False)

            self.last_hash = cookie_hash
            self.logger.info(f"Cookie已保存: {len(cookies)} 个Cookie到 {len(domains)} 个域名")
            return True

        except Exception as e:
            self.logger.error(f"保存Cookie失败: {e}")
            return False

    async def _monitoring_loop(self, browser_session):
        """Cookie监控循环"""
        self.logger.info(f"Cookie监控循环启动，检查间隔: {self.check_interval}秒")

        while self.monitoring_enabled:
            try:
                # 等待检查间隔
                await asyncio.sleep(self.check_interval)

                if not self.monitoring_enabled:
                    break

                # 获取当前Cookie状态
                cookies = await browser_session.context.cookies()
                current_hash = self._calculate_cookie_hash(cookies)

                # 检查是否有变化
                if current_hash != self.last_hash:
                    self.logger.debug(f"检测到Cookie变化，开始稳定性检查")

                    # Cookie有变化，重置稳定计数
                    self.stable_count = 0

                    # 短间隔再次检查确认变化
                    await asyncio.sleep(5)  # 5秒后再检查

                    if not self.monitoring_enabled:
                        break

                    # 再次获取Cookie
                    new_cookies = await browser_session.context.cookies()
                    new_hash = self._calculate_cookie_hash(new_cookies)

                    # 如果新哈希与之前相同，说明Cookie已稳定
                    if new_hash == current_hash:
                        self.stable_count += 1
                        self.logger.debug(f"Cookie稳定性检查: {self.stable_count}/{self.stability_threshold}")

                        if self.stable_count >= self.stability_threshold:
                            # Cookie已稳定，保存
                            self.last_hash = new_hash
                            await self.save_cookies(browser_session, force=True)
                            self.stable_count = 0
                    else:
                        # Cookie仍在变化，继续监控
                        self.logger.debug("Cookie仍在变化中，继续监控")
                        continue
                else:
                    # Cookie无变化，增加稳定计数
                    self.stable_count = max(0, self.stable_count - 1)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Cookie监控循环错误: {e}")
                await asyncio.sleep(self.check_interval)

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

    def _extract_domain(self, url: str) -> str:
        """从URL提取域名"""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc

    def _is_cookie_for_domain(self, cookie: Dict[str, Any], target_domain: str) -> bool:
        """判断Cookie是否适用于目标域名"""
        cookie_domain = cookie.get('domain', '')
        if not cookie_domain:
            return True

        # 处理域名匹配逻辑
        if cookie_domain.startswith('.'):
            # .example.com 匹配 example.com 和 sub.example.com
            return target_domain == cookie_domain[1:] or target_domain.endswith(cookie_domain)
        else:
            # example.com 只匹配 example.com
            return target_domain == cookie_domain

    def get_cookie_info(self) -> Dict[str, Any]:
        """获取Cookie管理信息"""
        return {
            'profile_name': self.profile_name,
            'monitoring_enabled': self.monitoring_enabled,
            'check_interval': self.check_interval,
            'cookie_file_exists': self.cookie_file.exists(),
            'last_hash': self.last_hash,
            'stable_count': self.stable_count,
            'history_count': len(self.cookie_history),
            'cookie_file_path': str(self.cookie_file)
        }

    async def cleanup(self):
        """清理资源"""
        await self.stop_monitoring()
        self.cookie_history.clear()
