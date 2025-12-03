"""
微博扩展
提供微博网站特定的Dev模式功能
"""

import asyncio
import re
import random
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlparse

from .base_extension import SiteSpecificExtension, ExtensionCapability, NavigationResult, LoginResult, ExtensionType
from core.mode.dev_overlay import UIOverlayManager
from core.anti_detection.engine import AntiDetectionEngine, AntiDetectionConfig


class WeiboExtension(SiteSpecificExtension):
    """微博网站特定扩展"""

    def __init__(self):
        super().__init__("weibo-extension", "1.0.0")
        self.login_attempts = 0
        self.max_login_attempts = 3
        self.detected_page_type = "unknown"
        self.anti_detection_engine: Optional[AntiDetectionEngine] = None
        self.browser_session = None

    def get_site_patterns(self) -> List[str]:
        """获取微博URL模式"""
        return [
            r"https?://(www\.)?weibo\.com.*",
            r"https?://(m\.)?weibo\.cn.*",
            r"https?://weibo\.com.*"
        ]

    def get_capabilities(self) -> List[ExtensionCapability]:
        """获取扩展能力"""
        return [
            ExtensionCapability(
                name="auto-login",
                description="微博自动登录功能",
                supported_actions=["login", "check_login_status", "restore_session"],
                required_permissions=["cookie_access", "dom_query", "form_interaction"],
                version="1.0.0"
            ),
            ExtensionCapability(
                name="container-discovery",
                description="微博页面容器自动发现",
                supported_actions=["discover_containers", "register_containers", "update_containers"],
                required_permissions=["dom_query", "container_management"],
                version="1.0.0"
            ),
            ExtensionCapability(
                name="navigation-helper",
                description="微博页面导航辅助",
                supported_actions=["navigate_home", "navigate_profile", "navigate_search"],
                required_permissions=["navigation", "url_access"],
                version="1.0.0"
            ),
            ExtensionCapability(
                name="anti-detection",
                description="微博反爬虫检测应对",
                supported_actions=["simulate_human", "random_behavior", "fingerprint_protection"],
                required_permissions=["browser_control", "script_injection"],
                version="1.0.0"
            )
        ]

    async def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化微博扩展"""
        try:
            self.config = {
                "auto_login": config.get("auto_login", True),
                "anti_detection": config.get("anti_detection", True),
                "container_discovery": config.get("container_discovery", True),
                "login_check_interval": config.get("login_check_interval", 5000),
                "max_login_attempts": config.get("max_login_attempts", 3),
                "cookie_domain": config.get("cookie_domain", ".weibo.com"),
                "user_agent": config.get("user_agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"),
                # 延迟参数配置
                "login_action_delays": {
                    "before_fill": (0.5, 1.5),
                    "after_fill": (0.3, 0.8),
                    "before_click": (0.2, 0.6),
                    "after_click": (2.0, 4.0),
                    "post_login": (3.0, 6.0)
                }
            }

            self.max_login_attempts = self.config["max_login_attempts"]

            # 初始化反检测引擎
            if self.config.get("anti_detection", False):
                anti_detection_config = AntiDetectionConfig(
                    enabled=True,
                    human_simulation=True,
                    environment_cleanup=True,
                    typing_speed_variation=0.4,
                    mouse_move_delay=(0.1, 0.8),
                    click_delay_range=self.config["login_action_delays"]["before_click"]
                )
                self.anti_detection_engine = AntiDetectionEngine(anti_detection_config)

            self.enabled = True
            return True

        except Exception as e:
            print(f"WeiboExtension初始化失败: {e}")
            return False

    async def cleanup(self) -> bool:
        """清理扩展资源"""
        self.enabled = False
        self.login_attempts = 0

        # 清理反检测引擎
        if self.anti_detection_engine:
            await self.anti_detection_engine.cleanup()
            self.anti_detection_engine = None

        self.browser_session = None
        return True

    async def detect_page_type(self, browser_session) -> str:
        """检测微博页面类型"""
        try:
            # 存储browser_session供其他方法使用
            if not self.browser_session:
                self.browser_session = browser_session
                # 初始化反检测引擎
                if self.anti_detection_engine:
                    await self.anti_detection_engine.initialize(browser_session)

            # 使用正确的API获取URL
            url = browser_session.url
            parsed_url = urlparse(url)

            # 检测URL模式
            path = parsed_url.path.lower()

            if "/login" in path or "passport.weibo.com" in url:
                self.detected_page_type = "login"
            elif "/u/" in path or "/profile" in path:
                self.detected_page_type = "profile"
            elif "/search" in path:
                self.detected_page_type = "search"
            elif path == "/" or not path or path == "/home":
                self.detected_page_type = "homepage"
            elif "/status/" in path or "/comment/" in path:
                self.detected_page_type = "detail"
            elif "/hot" in path:
                self.detected_page_type = "hot"
            else:
                # 通过页面元素检测
                title_element = await browser_session.query_selector("title")
                if title_element:
                    title = await title_element.inner_text()
                    if "登录" in title:
                        self.detected_page_type = "login"
                    elif "微博" in title:
                        self.detected_page_type = "homepage"
                    else:
                        self.detected_page_type = "content"

        except Exception as e:
            print(f"页面类型检测失败: {e}")
            self.detected_page_type = "unknown"

        return self.detected_page_type

    async def _jittered_delay(self, delay_key: str):
        """参数化抖动延迟"""
        delay_range = self.config.get("login_action_delays", {}).get(delay_key, (0.5, 1.5))
        delay = random.uniform(delay_range[0], delay_range[1])
        await asyncio.sleep(delay)

    async def handle_navigation(self, url: str, browser_session) -> NavigationResult:
        """处理微博页面导航"""
        try:
            # 等待页面加载完成（不重复导航）
            await browser_session.wait_for_load_state("networkidle")

            # 检测页面类型
            page_type = await self.detect_page_type(browser_session)

            # 根据页面类型执行特定操作
            next_actions = []
            containers_found = []

            if page_type == "login":
                next_actions.append("handle_login")
                if self.config.get("auto_login"):
                    next_actions.append("auto_login")
            elif page_type == "homepage":
                containers_found = await self._discover_homepage_containers(browser_session)
                next_actions.append("discover_feeds")
            elif page_type == "profile":
                containers_found = await self._discover_profile_containers(browser_session)
                next_actions.append("discover_user_info")
            elif page_type == "detail":
                containers_found = await self._discover_detail_containers(browser_session)
                next_actions.append("discover_comments")

            return NavigationResult(
                success=True,
                url=url,
                message=f"成功导航到微博{page_type}页面",
                next_actions=next_actions,
                containers_found=containers_found
            )

        except Exception as e:
            return NavigationResult(
                success=False,
                url=url,
                message=f"导航失败: {str(e)}"
            )

    async def handle_login(self, url: str, browser_session, credentials: Optional[Dict] = None) -> LoginResult:
        """处理微博登录"""
        try:
            # 检查是否已经登录
            if await self._check_login_status(browser_session):
                return LoginResult(
                    success=True,
                    logged_in=True,
                    message="已经处于登录状态"
                )

            self.login_attempts += 1
            if self.login_attempts > self.max_login_attempts:
                return LoginResult(
                    success=False,
                    logged_in=False,
                    message="登录尝试次数超过限制",
                    requires_manual=True
                )

            # 使用locator确保元素稳定性（React组件经常重新渲染）
            login_container = await browser_session.wait_for_selector('.login_form, .woo-box-flex', timeout=10000)
            if not login_container:
                return LoginResult(
                    success=False,
                    logged_in=False,
                    message="未找到登录容器",
                    requires_manual=True
                )

            # 使用locators而不是固定的element handles
            username_locator = browser_session.locator('input[name="username"], input[type="text"], input[placeholder*="手机"], input[placeholder*="邮箱"]').first
            password_locator = browser_session.locator('input[name="password"], input[type="password"]').first
            login_button_locator = browser_session.locator('button[type="submit"], .btn_login, .W_btn_a').first

            # 检查元素是否存在
            if not await username_locator.count() or not await password_locator.count():
                return LoginResult(
                    success=False,
                    logged_in=False,
                    message="未找到完整的登录表单元素",
                    requires_manual=True
                )

            if credentials:
                try:
                    # 填充前延迟
                    await self._jittered_delay("before_fill")

                    # 使用反检测引擎填充用户名
                    if self.anti_detection_engine:
                        username_success = await self.anti_detection_engine.simulate_typing(
                            'input[name="username"], input[type="text"], input[placeholder*="手机"], input[placeholder*="邮箱"]',
                            credentials.get("username", "")
                        )
                        password_success = await self.anti_detection_engine.simulate_typing(
                            'input[name="password"], input[type="password"]',
                            credentials.get("password", "")
                        )

                        if not username_success or not password_success:
                            raise Exception("反检测填充失败")
                    else:
                        # 直接填充
                        await username_locator.fill(credentials.get("username", ""))
                        await password_locator.fill(credentials.get("password", ""))

                    # 填充后延迟
                    await self._jittered_delay("after_fill")

                    # 点击前延迟
                    await self._jittered_delay("before_click")

                    # 使用反检测引擎点击登录
                    if self.anti_detection_engine and await login_button_locator.count():
                        click_success = await self.anti_detection_engine.simulate_click(
                            'button[type="submit"], .btn_login, .W_btn_a'
                        )
                        if not click_success:
                            raise Exception("反检测点击失败")
                    elif await login_button_locator.count():
                        await login_button_locator.click()

                    # 等待登录完成（使用wait而不是固定sleep）
                    try:
                        # 等待页面跳转或登录成功指示器，包含passport检查避免SSO时的误判
                        await browser_session.wait_for_function(
                            """() => {
                                return window.location.href.includes('weibo.com') &&
                                       !window.location.href.includes('login') &&
                                       !window.location.href.includes('passport') ||
                                       document.querySelector('.gn_name, .name, .userinfo') !== null;
                            }""",
                            timeout=15000
                        )
                    except:
                        # 如果wait失败，使用延迟作为fallback
                        await self._jittered_delay("after_click")

                    # 检查登录结果
                    if await self._check_login_status(browser_session):
                        self.login_attempts = 0
                        return LoginResult(
                            success=True,
                            logged_in=True,
                            method_used="auto_fill_with_anti_detection",
                            message="自动登录成功"
                        )
                    else:
                        return LoginResult(
                            success=False,
                            logged_in=False,
                            message="自动登录失败，可能需要验证码",
                            requires_manual=True,
                            next_steps=["handle_captcha", "manual_login"]
                        )

                except Exception as e:
                    return LoginResult(
                        success=False,
                        logged_in=False,
                        message=f"自动登录过程失败: {str(e)}",
                        requires_manual=True
                    )

            return LoginResult(
                success=True,
                logged_in=False,
                message="登录表单已准备，等待用户输入",
                requires_manual=True,
                next_steps=["fill_credentials", "click_login"]
            )

        except Exception as e:
            return LoginResult(
                success=False,
                logged_in=False,
                message=f"登录处理失败: {str(e)}"
            )

    async def _check_login_status(self, browser_session) -> bool:
        """检查登录状态"""
        try:
            # 使用正确的URL API
            current_url = browser_session.url
            if "login" not in current_url and "passport" not in current_url:
                # 查找登录指示器
                login_indicators = await self.get_login_indicators()

                for indicator in login_indicators:
                    element = await browser_session.query_selector(indicator)
                    if element:
                        text = await element.inner_text()
                        if text and ("登录" not in text and "login" not in text.lower()):
                            return True

                # 检查是否包含用户信息元素
                user_elements = await browser_session.query_selector_all('.gn_name, .name, .userinfo')
                if user_elements:
                    return True

        except Exception:
            pass

        return False

    async def get_login_indicators(self) -> List[str]:
        """获取登录状态指示器"""
        return [
            ".gn_name",
            ".name",
            ".userinfo",
            ".W_f14",
            ".WB_global_nav .gn_nav_list .gn_name",
            "[title*='微博']",
            ".WB_global_nav .gn_search"
        ]

    async def auto_register_containers(self, url: str, browser_session) -> List[Dict[str, Any]]:
        """自动注册微博容器"""
        try:
            page_type = await self.detect_page_type(browser_session)

            if page_type == "homepage":
                return await self._discover_homepage_containers(browser_session)
            elif page_type == "profile":
                return await self._discover_profile_containers(browser_session)
            elif page_type == "detail":
                return await self._discover_detail_containers(browser_session)
            else:
                return await self._discover_generic_containers(browser_session)

        except Exception as e:
            print(f"自动注册容器失败: {e}")
            return []

    async def _discover_homepage_containers(self, browser_session) -> List[Dict[str, Any]]:
        """发现主页容器"""
        containers = []

        try:
            # 导航栏容器
            containers.append({
                "name": "weibo_navigation",
                "selector": ".WB_global_nav, .gn_header",
                "description": "微博导航栏",
                "type": "navigation",
                "actions": ["click", "query"],
                "attributes": {"role": "navigation"}
            })

            # 搜索框容器
            containers.append({
                "name": "weibo_search",
                "selector": ".gn_search, .search_input",
                "description": "微博搜索框",
                "type": "input",
                "actions": ["input", "click", "query"],
                "attributes": {"role": "search"}
            })

            # 主内容流容器
            containers.append({
                "name": "weibo_feed",
                "selector": ".WB_feed, .card-wrap, .WB_detail",
                "description": "微博内容流",
                "type": "content",
                "actions": ["scroll", "click", "query"],
                "attributes": {"role": "main"}
            })

            # 发布微博容器
            containers.append({
                "name": "weibo_post_box",
                "selector": ".send_weibo, .WB_publish, .input_box",
                "description": "微博发布框",
                "type": "input",
                "actions": ["input", "click"],
                "attributes": {"role": "form"}
            })

        except Exception as e:
            print(f"发现主页容器失败: {e}")

        return containers

    async def _discover_profile_containers(self, browser_session) -> List[Dict[str, Any]]:
        """发现个人主页容器"""
        containers = []

        try:
            # 用户信息容器
            containers.append({
                "name": "weibo_user_info",
                "selector": ".PCD_user_info, .userinfo, .profile_info",
                "description": "用户信息",
                "type": "content",
                "actions": ["query"],
                "attributes": {"role": "userinfo"}
            })

            # 个人标签容器
            containers.append({
                "name": "weibo_user_tags",
                "selector": ".userinfo_tag, .user_tags",
                "description": "用户标签",
                "type": "content",
                "actions": ["click", "query"],
                "attributes": {"role": "tags"}
            })

            # 用户微博列表容器
            containers.append({
                "name": "weibo_user_feed",
                "selector": ".WB_feed, .WB_cardwrap",
                "description": "用户微博列表",
                "type": "content",
                "actions": ["scroll", "click", "query"],
                "attributes": {"role": "feed"}
            })

        except Exception as e:
            print(f"发现个人主页容器失败: {e}")

        return containers

    async def _discover_detail_containers(self, browser_session) -> List[Dict[str, Any]]:
        """发现详情页容器"""
        containers = []

        try:
            # 微博详情容器
            containers.append({
                "name": "weibo_detail",
                "selector": ".WB_detail, .WB_feed",
                "description": "微博详情",
                "type": "content",
                "actions": ["query", "click"],
                "attributes": {"role": "article"}
            })

            # 评论列表容器
            containers.append({
                "name": "weibo_comments",
                "selector": ".list_con, .comment_list, .WB_comment",
                "description": "评论列表",
                "type": "content",
                "actions": ["scroll", "click", "query"],
                "attributes": {"role": "comments"}
            })

            # 评论框容器
            containers.append({
                "name": "weibo_comment_input",
                "selector": ".comment_box, .input_area, .WB_textarea",
                "description": "评论输入框",
                "type": "input",
                "actions": ["input", "click"],
                "attributes": {"role": "form"}
            })

            # 转发容器
            containers.append({
                "name": "weibo_repost",
                "selector": ".func_item, .WB_forward",
                "description": "转发功能",
                "type": "action",
                "actions": ["click"],
                "attributes": {"role": "repost"}
            })

        except Exception as e:
            print(f"发现详情页容器失败: {e}")

        return containers

    async def _discover_generic_containers(self, browser_session) -> List[Dict[str, Any]]:
        """发现通用容器"""
        containers = []

        try:
            # 通用按钮容器
            containers.append({
                "name": "weibo_buttons",
                "selector": "button, .btn, .W_btn",
                "description": "通用按钮",
                "type": "action",
                "actions": ["click"],
                "attributes": {"role": "button"}
            })

            # 通用链接容器
            containers.append({
                "name": "weibo_links",
                "selector": "a[href]",
                "description": "通用链接",
                "type": "navigation",
                "actions": ["click"],
                "attributes": {"role": "link"}
            })

        except Exception as e:
            print(f"发现通用容器失败: {e}")

        return containers

    async def get_workflow_suggestions(self, page_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """获取工作流建议"""
        suggestions = []

        try:
            page_type = page_context.get("page_type", self.detected_page_type)
            logged_in = page_context.get("logged_in", False)

            if not logged_in:
                suggestions.append({
                    "name": "login_flow",
                    "description": "微博登录流程",
                    "steps": [
                        {"action": "navigate", "url": "https://weibo.com/login"},
                        {"action": "fill_form", "selectors": ["input[name='username']", "input[name='password']"]},
                        {"action": "click", "selector": "button[type='submit']"},
                        {"action": "wait", "condition": "login_success"}
                    ]
                })

            if page_type == "homepage":
                suggestions.append({
                    "name": "scan_feeds",
                    "description": "扫描微博内容流",
                    "steps": [
                        {"action": "scroll", "target": ".WB_feed"},
                        {"action": "extract", "selector": ".card-wrap", "data_type": "posts"}
                    ]
                })

                suggestions.append({
                    "name": "search_topics",
                    "description": "搜索热门话题",
                    "steps": [
                        {"action": "input", "selector": ".gn_search", "text": "热门话题"},
                        {"action": "click", "selector": ".search_btn"},
                        {"action": "extract", "selector": ".search_result", "data_type": "search_results"}
                    ]
                })

            elif page_type == "detail":
                suggestions.append({
                    "name": "analyze_post",
                    "description": "分析微博详情",
                    "steps": [
                        {"action": "extract", "selector": ".WB_detail", "data_type": "post_detail"},
                        {"action": "extract", "selector": ".comment_list", "data_type": "comments"}
                    ]
                })

        except Exception as e:
            print(f"获取工作流建议失败: {e}")

        return suggestions

    async def should_auto_login(self, url: str, browser_session) -> bool:
        """判断是否应该自动登录"""
        return self.config.get("auto_login", False) and await self._check_login_status(browser_session) == False

    async def handle_post_login_actions(self, browser_session) -> bool:
        """处理登录后操作"""
        try:
            # 使用参数化延迟
            await self._jittered_delay("post_login")

            # 等待页面稳定
            await browser_session.wait_for_load_state("networkidle")

            # 检查是否有安全验证（移除.woo-mod-main，因为它是所有微博内容的通用容器）
            security_elements = await browser_session.query_selector_all('.verify_panel, .security_check, .woo-dialog-main')
            if security_elements:
                print("检测到安全验证，需要手动处理")
                return False

            # 执行威胁检测扫描
            if self.anti_detection_engine:
                try:
                    detection_report = await self.anti_detection_engine.scan_for_detection()
                    print(f"威胁检测状态: {detection_report.status.value}, 等级: {detection_report.threat_level.value}")

                    if detection_report.recommendations:
                        print(f"检测建议: {', '.join(detection_report.recommendations)}")

                    # 如果检测到威胁，记录并可能采取进一步行动
                    if detection_report.status.value in ['warning', 'detected']:
                        print(f"警告：检测到反爬虫信号，威胁等级: {detection_report.threat_level.value}")

                except Exception as e:
                    print(f"威胁检测扫描失败: {e}")

            # 自动发现容器
            if self.config.get("container_discovery", True):
                containers = await self.auto_register_containers("", browser_session)
                print(f"自动发现并注册了 {len(containers)} 个容器")

            return True

        except Exception as e:
            print(f"登录后操作失败: {e}")
            return False