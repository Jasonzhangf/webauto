"""
Chromium browser wrapper (standard Playwright).
"""

from __future__ import annotations

import json
import os
import random
import threading
import time
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from abstract_browser import AbstractBrowser, AbstractPage
from .errors import SecurityError
from .overlay import build_overlay_script
from .scripts import dom_select_script
from .core.page_wrapper import PageWrapper
from .core.overlay_manager import OverlayManager
from .core.config_manager import ConfigManager
from .core.session_manager import SessionManager
from .core.profile_lock import ProfileLockManager
from .core.cookie_monitor import CookieMonitor
from .core.cookie_manager import CookieManager
from .core.sync_cookie_manager import SyncCookieManager

class AntiBotError(Exception):
    """Raised when risk control/anti-bot page is detected."""
    pass


class ChromiumBrowserWrapper(AbstractBrowser):
    """
    Chromium wrapper with overlay injection, cookie/session helpers, and auto-save.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self._browser = None
        self._playwright = None
        self._context = None
        self._cookie_dir = self.config.get("cookie_dir", "./cookies")
        self._auto_session: bool = bool(self.config.get("auto_session", True))  # Default to True for Chromium
        self._session_name: str = self.config.get("session_name", "default")
        
        # Cookie monitoring settings
        self._cookie_monitor: Optional[CookieMonitor] = None
        self._cookie_check_interval = self.config.get("cookie_check_interval", 2.0)
        self._cookie_stabilization_time = self.config.get("cookie_stabilization_time", 5.0)
        self._cookie_min_save_interval = self.config.get("cookie_min_save_interval", 10.0)
        self._profile_id: str = self.config.get("profile_id", "default")
        self._risk_control_keywords = [
            "验证码", "滑块", "security-check", "sec.1688.com", "login.taobao.com/member/login.jhtml",
            "baxia-dialog-content", "nc_1_n1z", "err-404", "deny"
        ]
        self._risk_control_enabled = self.config.get("anti_bot_detection", True)
        self._human_delay_range = self.config.get("human_delay_range", (0.5, 2.0))  # Random delay range in seconds
        self._on_risk_control: Optional[Callable] = self.config.get("on_risk_control", None)

        # 实例检查 - 确保只有一个浏览器实例
        self._instance_id = f"chromium_{self._profile_id}_{os.getpid()}"

        # Initialize new modular managers
        self._config_manager = ConfigManager(self.config)
        self._session_manager = SessionManager(self.config)
        self._overlay_manager = OverlayManager(self.config)
        self._profile_lock_manager = ProfileLockManager(lock_dir="./locks")

        # Initialize Sync Cookie Manager (compatible with Playwright sync API)
        self._cookie_manager = SyncCookieManager(
            profile_name=self._profile_id,
            profile_dir=Path("./profiles")
        )

        # Acquire profile lock (will kill existing instance if any)
        if not self._profile_lock_manager.acquire_lock(self._profile_id):
            raise RuntimeError(f"无法获取profile '{self._profile_id}' 的锁")

    # --- Browser/context lifecycle -------------------------------------------------

    def _ensure_browser(self):
        if self._browser is not None:
            return

        from playwright.sync_api import sync_playwright

        self._playwright = sync_playwright().start()
        
        headless = self.config.get("headless", False)
        args = self.config.get("args", [])
        
        # 添加远程调试端口支持
        debug_args = []
        if self.config.get("remote_debugging", False):
            debug_port = self.config.get("debug_port", 9222)
            debug_args = [
                f"--remote-debugging-port={debug_port}",
                "--remote-debugging-address=0.0.0.0",
                "--no-sandbox",
                "--disable-web-security",
                "--disable-features=VizDisplayCompositor"
            ]

        # Standard Chromium launch options
        launch_kwargs = {
            "headless": headless,
            "args": args + debug_args,
        }

        self._browser = self._playwright.chromium.launch(**launch_kwargs)

        # 保存调试端口信息
        if self.config.get("remote_debugging", False):
            self._debug_port = debug_port
            print(f"🔧 Chromium远程调试已启用: http://localhost:{debug_port}")

    def _get_context(self):
        if self._context is not None:
            return self._context

        self._ensure_browser()

        # Try to load existing session if auto_session is enabled
        storage_state = None
        if self._auto_session:
            try:
                session_file = os.path.join(self._cookie_dir, f"session_{self._session_name}.json")
                if os.path.exists(session_file):
                    with open(session_file, "r", encoding="utf-8") as f:
                        storage_state = json.load(f)
            except Exception:
                pass

        if self._context is None:
            default_viewport = {"width": 1440, "height": 900}
            viewport = self.config.get("viewport", default_viewport)
            
            ctx_opts = {
                "viewport": viewport,
                "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            if storage_state:
                ctx_opts["storage_state"] = storage_state

            self._context = self._browser.new_context(**ctx_opts)

        # Inject DOM selection script
        try:
            self._context.add_init_script(dom_select_script())
        except Exception:
            pass

        # Auto-inject overlay if enabled
        if self.config.get("auto_overlay", True):
            try:
                self.install_overlay(self._session_name, self._profile_id)
                print("🎛 自动注入开发工具菜单")
            except Exception as e:
                print(f"⚠️ 自动注入overlay失败: {str(e)}")

        # Start cookie monitor if enabled explicitly (avoid thread issues with Playwright sync)
        if self._auto_session and bool(self.config.get("cookie_monitoring_enabled", False)):
            try:
                # Create thread-safe callback for storage state access
                def get_storage_state_safe():
                    try:
                        if self._context:
                            return self._context.storage_state()
                    except:
                        pass
                    return {}
                
                self._cookie_monitor = CookieMonitor(
                    context=self._context,
                    session_name=self._session_name,
                    cookie_dir=self._cookie_dir,
                    check_interval=self._cookie_check_interval,
                    stabilization_time=self._cookie_stabilization_time,
                    min_save_interval=self._cookie_min_save_interval,
                    get_storage_state_callback=get_storage_state_safe
                )
                self._cookie_monitor.start()
            except Exception as e:
                print(f"⚠️ Cookie监控启动失败: {str(e)}")

        return self._context

    # --- Cookie Monitor ----------------------------------------------------------

    def get_cookie_stats(self) -> Dict[str, Any]:
        """Get cookie monitor statistics"""
        if self._cookie_monitor:
            return self._cookie_monitor.get_stats()
        return {"error": "Cookie monitor not running"}
    
    def force_save_cookies(self) -> bool:
        """Force save cookies immediately"""
        if self._cookie_monitor:
            return self._cookie_monitor.force_save()
        return False

    # --- Overlay -----------------------------------------------------------------
    def _load_container_registry_module(self):
        if hasattr(self, "_container_registry_module"):
            return getattr(self, "_container_registry_module")

        module = None
        try:
            import importlib.util
            module_path = Path(__file__).resolve().parent.parent / "services" / "container_registry.py"
            spec = importlib.util.spec_from_file_location(
                "webauto_runtime_container_registry",
                module_path
            )
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module  # type: ignore[index]
                spec.loader.exec_module(module)  # type: ignore[attr-defined]
        except Exception as exc:
            print(f"⚠️ 容器注册表加载失败: {exc}")
            module = None

        self._container_registry_module = module
        return module

    def _emit_overlay_container_data(self, page: Any, url: Optional[str] = None) -> None:
        """Share container definitions with the injected overlay without relying on HTTP APIs."""
        if not self.config.get("auto_overlay", True):
            return

        playwright_page = getattr(page, "page", page)
        resolved_url = url
        if not resolved_url:
            try:
                resolved_url = playwright_page.url
            except Exception:
                resolved_url = None
        if not resolved_url:
            return

        try:
            registry_module = self._load_container_registry_module()
            if not registry_module:
                return
            containers = registry_module.get_containers_for_url(resolved_url)
        except Exception as exc:
            print(f"⚠️ Overlay容器加载失败: {exc}")
            return

        payload = {
            "url": resolved_url,
            "containers": containers,
        }

        try:
            playwright_page.evaluate(
                """payload => {
                    try {
                        window.__webautoBootstrapContainers = payload;
                        const emit = () => window.dispatchEvent(new CustomEvent('webauto:containers', { detail: payload }));
                        emit();
                        window.setTimeout(emit, 600);
                        window.setTimeout(emit, 1600);
                    } catch (error) {
                        console.warn('[overlay] bootstrap dispatch failed', error);
                    }
                }""",
                payload,
            )
        except Exception as exc:
            print(f"⚠️ Overlay容器注入失败: {exc}")

    def install_overlay(self, session_id: str, profile_id: Optional[str] = None) -> None:
        try:
            context = self._get_context()
            script = build_overlay_script(session_id, profile_id or self._profile_id)
            try:
                context.add_init_script(script)
            except Exception:
                pass

            try:
                pages = list(getattr(context, "pages", []) or [])
            except Exception:
                pages = []

            def _ensure_overlay_on_page(page) -> None:
                try:
                    page.evaluate(script)
                    self._emit_overlay_container_data(page)
                except Exception:
                    return
                try:
                    def _on_nav(_frame):
                        try:
                            page.evaluate(script)
                        except Exception:
                            pass
                        try:
                            self._emit_overlay_container_data(page)
                        except Exception:
                            pass
                    page.on("framenavigated", _on_nav)
                except Exception:
                    pass

            for p in pages:
                _ensure_overlay_on_page(p)

            try:
                def _on_new_page(page):
                    _ensure_overlay_on_page(page)
                context.on("page", _on_new_page)
            except Exception:
                pass
        except Exception:
            pass

    # --- Public API --------------------------------------------------------------

    def new_page(self) -> AbstractPage:
        context = self._get_context()
        try:
            pages = list(getattr(context, "pages", []) or [])
        except Exception:
            pages = []

        # 复用已存在的第一页，避免不断新开标签/窗口
        if pages:
            wrapper = PageWrapper(pages[0], self.config)
            self._active_page = wrapper
            return wrapper

        page = context.new_page()
        wrapper = PageWrapper(page, self.config)
        self._active_page = wrapper
        return wrapper

    def goto(self, url: str) -> AbstractPage:
        # 优先复用已存在的活动页面
        context = self._get_context()
        page: Optional[PageWrapper] = getattr(self, "_active_page", None)
        try:
            if page is None:
                pages = list(getattr(context, "pages", []) or [])
                if pages:
                    page = PageWrapper(pages[0], self.config)
        except Exception:
            page = None

        if page is None:
            page = self.new_page()

        page.navigate(url)

        # 启动同步Cookie监控
        try:
            # 获取browser context
            context = self._get_context()
            self._cookie_manager.start_monitoring(context)

        except Exception as e:
            print(f"Cookie监控启动失败: {e}")

        self._active_page = page
        try:
            self._emit_overlay_container_data(page, url)
        except Exception:
            pass
        self._check_risk_control(page.page if hasattr(page, 'page') else page) # Access internal playwright page
        return page

    def _check_risk_control(self, page) -> None:
        """
        Checks if the current page is a risk control page.
        If detected, calls the callback (if provided) or raises AntiBotError.
        """
        if not self._risk_control_enabled:
            return

        try:
            url = page.url
            title = page.title()
            
            # 1. Check URL patterns (most efficient)
            if any(k in url for k in ["sec.1688.com", "login.taobao.com/member/login.jhtml", "baxia", "captcha"]):
                self._handle_risk_control(f"Risk control URL detected: {url}", page)
                return

            # 2. Check Title
            if "验证码" in title or "安全检测" in title or "安全验证" in title:
                self._handle_risk_control(f"Risk control Title detected: {title}", page)
                return

            # 3. Check specific elements (efficient locator checks)
            # 1688/Taobao specific
            risk_selectors = ["#nc_1_n1z", ".baxia-dialog-content", ".slide-to-unlock", "[id*='captcha']"]
            for sel in risk_selectors:
                if page.locator(sel).count() > 0:
                    self._handle_risk_control(f"Risk control element detected: {sel}", page)
                    return
                 
        except AntiBotError:
            raise
        except Exception:
            # Ignore other errors during check (e.g. page closed)
            pass
    
    def _handle_risk_control(self, message: str, page) -> None:
        """Handle risk control detection."""
        if self._on_risk_control:
            try:
                self._on_risk_control(message, page)
            except Exception:
                pass
        raise AntiBotError(message)
    
    def _human_delay(self, min_delay: Optional[float] = None, max_delay: Optional[float] = None) -> None:
        """Simulate human-like random delay."""
        min_d, max_d = min_delay or self._human_delay_range[0], max_delay or self._human_delay_range[1]
        delay = random.uniform(min_d, max_d)
        time.sleep(delay)
    
    def safe_wait(self, page, timeout: float = 5.0) -> None:
        """
        Safe wait that checks for risk control during the wait.
        """
        start = time.time()
        while time.time() - start < timeout:
            self._check_risk_control(page.page if hasattr(page, 'page') else page)
            time.sleep(0.5)
    
    def safe_click(self, page, selector: str, delay_before: bool = True, delay_after: bool = True) -> None:
        """
        Safe click that checks for risk control and simulates human delay.
        """
        pw_page = page.page if hasattr(page, 'page') else page
        
        if delay_before:
            self._human_delay()
        
        self._check_risk_control(pw_page.page if hasattr(pw_page, 'page') else pw_page)
        
        # Simulate mouse movement (optional)
        try:
            # Get element position and move mouse to it
            elem = pw_page.locator(selector).first
            box = elem.bounding_box()
            if box:
                # Move to a random point within the element
                x = box['x'] + random.uniform(5, box['width'] - 5)
                y = box['y'] + random.uniform(5, box['height'] - 5)
                pw_page.mouse.move(x, y)
                time.sleep(random.uniform(0.1, 0.3))
        except Exception:
            pass
        
        pw_page.click(selector)
        
        if delay_after:
            self._human_delay()
        
        self._check_risk_control(pw_page.page if hasattr(pw_page, 'page') else pw_page)
    
    def safe_fill(self, page, selector: str, text: str, delay_before: bool = True, delay_after: bool = True, typing_delay: Optional[float] = None) -> None:
        """
        Safe fill that checks for risk control and simulates human typing.
        """
        pw_page = page.page if hasattr(page, 'page') else page
        
        if delay_before:
            self._human_delay()
        
        self._check_risk_control(pw_page.page if hasattr(pw_page, 'page') else pw_page)
        
        # Type with delay between characters
        if typing_delay is None:
            typing_delay = random.uniform(0.05, 0.15)
        
        pw_page.fill(selector, "")
        for char in text:
            pw_page.type(selector, char, delay=typing_delay * 1000)  # Playwright expects ms
            time.sleep(random.uniform(0.01, 0.05))
        
        if delay_after:
            self._human_delay()
        
        self._check_risk_control(pw_page.page if hasattr(pw_page, 'page') else pw_page)

    def save_cookies(self, domain: str) -> Dict[str, Any]:
        context = self._get_context()
        cookies = context.cookies(domain)
        os.makedirs(self._cookie_dir, exist_ok=True)
        path = os.path.join(self._cookie_dir, f"cookies_{domain.replace(':','_')}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=2, ensure_ascii=False)
        return {"success": True, "path": path, "count": len(cookies)}

    def load_cookies(self, domain: str, url: str = None) -> Dict[str, Any]:
        try:
            context = self._get_context()
            path = os.path.join(self._cookie_dir, f"cookies_{domain.replace(':','_')}.json")
            if not os.path.exists(path):
                return {"success": False, "error": f"cookie 文件不存在: {path}"}
            with open(path, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            context.add_cookies(cookies)
            if url:
                self.goto(url)
            return {"success": True, "count": len(cookies)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def save_session(self, session_name: str) -> Dict[str, Any]:
        try:
            context = self._get_context()
            state = context.storage_state()
            os.makedirs(self._cookie_dir, exist_ok=True)
            path = os.path.join(self._cookie_dir, f"session_{session_name}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            return {"success": True, "session": session_name}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def restore_session(self, session_name: str) -> Dict[str, Any]:
        try:
            path = os.path.join(self._cookie_dir, f"session_{session_name}.json")
            if not os.path.exists(path):
                return {"success": False, "error": f"会话文件不存在: {path}"}
            with open(path, "r", encoding="utf-8") as f:
                state = json.load(f)
            if self._context:
                self._context.close()
            self._ensure_browser()
            self._context = self._browser.new_context(storage_state=state)
            return {
                "success": True,
                "session": session_name,
                "cookies_loaded": len(state.get("cookies", [])),
                "origins_loaded": len(state.get("origins", [])),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_storage_state(self) -> Dict[str, Any]:
        context = self._get_context()
        return context.storage_state()

    def close(self) -> None:
        try:
            # Stop sync cookie manager
            if self._cookie_manager:
                try:
                    self._cookie_manager.stop_monitoring()
                except Exception as e:
                    print(f"⚠️ 停止Cookie管理器失败: {e}")

            # 兼容旧的cookie monitor
            if self._cookie_monitor:
                try:
                    self._cookie_monitor.stop()
                except Exception as e:
                    print(f"⚠️ 停止Cookie监控失败: {e}")

            if self._context:
                self._context.close()
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
        except Exception:
            pass
        finally:
            # Release profile lock
            try:
                self._profile_lock_manager.release_lock(self._profile_id)
            except Exception:
                pass
            
            self._browser = None
            self._playwright = None
            self._context = None

    def get_status(self) -> Dict[str, Any]:
        return {
            "type": "chromium",
            "connected": self._browser is not None,
            "config": self.config,
            "context_active": self._context is not None,
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


__all__ = ["ChromiumBrowserWrapper"]
