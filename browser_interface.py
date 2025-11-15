"""
浏览器接口模块
WebAuto 统一浏览器入口 - 使用 Camoufox
包含完整的Cookie管理和JavaScript执行功能
"""

import sys
import os
import time
import json
from typing import Optional, Dict, Any, Union, List
from contextlib import contextmanager
from abstract_browser import AbstractBrowser, AbstractPage

class SecurityError(Exception):
    """安全违规错误"""
    pass

class CamoufoxBrowserWrapper(AbstractBrowser):
    """Camoufox 浏览器包装器"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self._browser = None
        self._playwright = None
        self._context = None
        self._cookie_dir = self.config.get('cookie_dir', './cookies')
        # 会话自动保存/加载配置
        # auto_session: 是否在关闭时自动保存会话、在下次启动时自动恢复
        # session_name: 会话名称（用于区分不同站点/用途）
        self._auto_session: bool = bool(self.config.get('auto_session', False))
        self._session_name: str = self.config.get('session_name', 'default')
    
    def _ensure_browser(self):
        """确保浏览器已初始化"""
        if self._browser is None:
            from playwright.sync_api import sync_playwright
            from camoufox import NewBrowser
            # 禁用 Camoufox 默认扩展下载与路径校验，避免在受限网络环境下因 UBO 安装失败导致启动错误
            try:
                import camoufox.utils as _cf_utils  # type: ignore

                def _no_addons(addons_list, exclude_list=None):  # type: ignore
                    return

                def _no_confirm(paths):  # type: ignore
                    return

                _cf_utils.add_default_addons = _no_addons  # type: ignore
                _cf_utils.confirm_paths = _no_confirm      # type: ignore
            except Exception:
                pass

            self._playwright = sync_playwright().start()
            # 默认中文配置 - 强制使用简体中文环境，解决中文乱码
            locale = self.config.get('locale', 'zh-CN')
            base_args = [
                f'--lang={locale}',
                f'--accept-lang={locale},{locale.split("-")[0]};q=0.9,en;q=0.8',
            ]
            extra_args = self.config.get('args', [])
            merged_args = []
            for arg in base_args + extra_args:
                if arg not in merged_args:
                    merged_args.append(arg)

            # 默认配置 - 强制使用 Camoufox
            launch_config = {
                'headless': self.config.get('headless', False),
                'args': merged_args,
                'locale': locale,
            }
            
            # 强制使用 Camoufox
            self._browser = NewBrowser(
                self._playwright, 
                **launch_config
            )
    
    def _get_context(self):
        """获取或创建浏览器上下文"""
        if self._context is None:
            self._ensure_browser()
            
            # 如启用自动会话恢复，则优先尝试加载上次会话状态
            # 注意：不会在首次运行时预加载任何内置 Cookie，
            # 只有在之前已经保存过会话文件时才会恢复。
            if self._auto_session:
                restore_result = self.restore_session(self._session_name)
                if restore_result.get('success'):
                    return self._context

            locale = self.config.get('locale', 'zh-CN')
            context_options = {
                'viewport': {'width': 1920, 'height': 1080},
                'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
            self._context = self._browser.new_context(**context_options)
            # 统一设置中文 HTTP 头，进一步避免乱码
            try:
                lang_header = f'{locale},{locale.split("-")[0]};q=0.9,en;q=0.8'
                self._context.set_extra_http_headers({
                    'Accept-Language': lang_header
                })
            except Exception:
                pass
        return self._context

    def install_overlay(self, session_id: str, profile_id: Optional[str] = None) -> None:
        """
        在当前浏览器上下文中安装悬浮菜单（Shadow DOM 隔离）
        - 与 Node 侧 libs/browser/ui-overlay.js 保持一致的视觉与结构
        - 通过 add_init_script 确保每次页面加载都会自动注入
        """
        try:
            context = self._get_context()
            sid = json.dumps(session_id)
            pid = json.dumps(profile_id or self._session_name or 'default')
            script = f"""
            (() => {{
              try {{
                const ROOT_ID = '__webauto_overlay_root__';
                if (document.getElementById(ROOT_ID)) return;

                const root = document.createElement('div');
                root.id = ROOT_ID;
                root.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;pointer-events:none;';

                const host = document.createElement('div');
                root.appendChild(host);

                const shadow = host.attachShadow({{ mode: 'open' }});
                const panel = document.createElement('div');
                panel.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.7);color:#fff;padding:6px 10px;border-radius:8px;font:12px -apple-system,system-ui;display:flex;align-items:center;gap:6px;box-shadow:0 0 8px rgba(0,0,0,0.5);';

                const sidLabel = document.createElement('span');
                sidLabel.style.opacity = '0.8';
                sidLabel.textContent = 'SID:';
                const sidVal = document.createElement('span');
                sidVal.id = '__waOverlay_sid';
                sidVal.textContent = {sid};

                const pidLabel = document.createElement('span');
                pidLabel.style.opacity = '0.8';
                pidLabel.textContent = 'Profile:';
                const pidVal = document.createElement('span');
                pidVal.id = '__waOverlay_pid';
                pidVal.textContent = {pid};

                panel.appendChild(sidLabel);
                panel.appendChild(sidVal);
                panel.appendChild(pidLabel);
                panel.appendChild(pidVal);

                shadow.appendChild(panel);
                document.documentElement.appendChild(root);

                window.__webautoOverlay = {{
                  update(info) {{
                    try {{
                      if (!info) return;
                      if (info.sessionId) {{
                        const el = shadow.getElementById('__waOverlay_sid');
                        if (el) el.textContent = String(info.sessionId);
                      }}
                      if (info.profileId) {{
                        const el = shadow.getElementById('__waOverlay_pid');
                        if (el) el.textContent = String(info.profileId);
                      }}
                    }} catch {{}}
                  }}
                }};
              }} catch {{}}
            }})();"""
            context.add_init_script(script)
        except Exception:
            # UI 注入失败不影响主流程
            pass
    
    def new_page(self) -> 'CamoufoxPageWrapper':
        """创建新页面"""
        context = self._get_context()
        page = context.new_page()
        return CamoufoxPageWrapper(page)
    
    def goto(self, url: str) -> 'CamoufoxPageWrapper':
        """导航到URL并返回页面"""
        page = self.new_page()
        page.goto(url)
        return page
    
    def save_cookies(self, domain: str) -> Dict[str, Any]:
        """保存Cookie"""
        try:
            context = self._get_context()
            cookies = context.cookies()
            
            os.makedirs(self._cookie_dir, exist_ok=True)
            cookie_file = os.path.join(self._cookie_dir, f'{domain}.json')
            
            with open(cookie_file, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, indent=2, ensure_ascii=False)
            
            return {
                'success': True,
                'domain': domain,
                'cookie_count': len(cookies),
                'file': cookie_file,
                'cookies': cookies
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def load_cookies(self, domain: str, url: str = None) -> Dict[str, Any]:
        """加载Cookie"""
        try:
            cookie_file = os.path.join(self._cookie_dir, f'{domain}.json')
            
            if not os.path.exists(cookie_file):
                return {
                    'success': False,
                    'error': f'Cookie文件不存在: {cookie_file}'
                }
            
            with open(cookie_file, 'r', encoding='utf-8') as f:
                cookies = json.load(f)
            
            context = self._get_context()
            
            if url:
                context.add_cookies(cookies)
            else:
                # 如果没有URL，只添加没有域名的cookies
                for cookie in cookies:
                    if 'domain' not in cookie:
                        context.add_cookies([cookie])
            
            return {
                'success': True,
                'domain': domain,
                'cookie_count': len(cookies),
                'loaded': len(cookies)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def save_session(self, session_name: str) -> Dict[str, Any]:
        """保存完整会话"""
        try:
            context = self._get_context()
            storage_state = context.storage_state()
            
            os.makedirs(self._cookie_dir, exist_ok=True)
            session_file = os.path.join(self._cookie_dir, f'session_{session_name}.json')
            
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(storage_state, f, indent=2, ensure_ascii=False)
            
            return {
                'success': True,
                'session': session_name,
                'file': session_file,
                'cookies_count': len(storage_state.get('cookies', [])),
                'origins_count': len(storage_state.get('origins', []))
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def restore_session(self, session_name: str) -> Dict[str, Any]:
        """恢复完整会话"""
        try:
            session_file = os.path.join(self._cookie_dir, f'session_{session_name}.json')
            
            if not os.path.exists(session_file):
                return {
                    'success': False,
                    'error': f'会话文件不存在: {session_file}'
                }
            
            with open(session_file, 'r', encoding='utf-8') as f:
                storage_state = json.load(f)
            
            # 关闭当前上下文，创建新的带状态的上下文
            if self._context:
                self._context.close()
            
            self._ensure_browser()
            self._context = self._browser.new_context(storage_state=storage_state)
            
            return {
                'success': True,
                'session': session_name,
                'cookies_loaded': len(storage_state.get('cookies', [])),
                'origins_loaded': len(storage_state.get('origins', []))
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def get_storage_state(self) -> Dict[str, Any]:
        """
        获取当前完整 storage_state 快照（用于上层判断状态是否发生变化）
        不做任何持久化操作。
        """
        context = self._get_context()
        return context.storage_state()
    
    def close(self) -> None:
        """关闭浏览器"""
        try:
            # 如启用自动会话保存且已有上下文，则在关闭前保存一次会话
            if self._auto_session and self._context is not None:
                try:
                    context = self._context
                    storage_state = context.storage_state()
                    
                    os.makedirs(self._cookie_dir, exist_ok=True)
                    session_file = os.path.join(
                        self._cookie_dir,
                        f'session_{self._session_name}.json'
                    )
                    
                    with open(session_file, 'w', encoding='utf-8') as f:
                        json.dump(storage_state, f, indent=2, ensure_ascii=False)
                except Exception:
                    # 自动保存失败不应阻断正常关闭流程
                    pass
            
            if self._context:
                self._context.close()
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
        except Exception:
            pass
        finally:
            self._browser = None
            self._playwright = None
            self._context = None
    
    def get_status(self) -> Dict[str, Any]:
        """获取浏览器状态"""
        return {
            'type': 'camoufox',
            'connected': self._browser is not None,
            'config': self.config,
            'context_active': self._context is not None
        }
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

class CamoufoxPageWrapper(AbstractPage):
    """Camoufox 页面包装器 - 包含JavaScript执行功能"""
    
    def __init__(self, page):
        self._page = page
    
    def goto(self, url: str) -> None:
        """导航到URL"""
        self._page.goto(url)
    
    def title(self) -> str:
        """获取页面标题"""
        return self._page.title()
    
    def url(self) -> str:
        """获取当前URL"""
        return self._page.url
    
    def click(self, selector: str) -> None:
        """点击元素"""
        self._page.click(selector)
    
    def fill(self, selector: str, value: str) -> None:
        """填写输入框"""
        self._page.fill(selector, value)
    
    def text_content(self, selector: str) -> str:
        """获取元素文本"""
        return self._page.text_content(selector)
    
    def screenshot(self, filename: str = None, full_page: bool = False) -> bytes:
        """截图"""
        if filename:
            self._page.screenshot(path=filename, full_page=full_page)
            return b''
        else:
            return self._page.screenshot(full_page=full_page)
    
    def wait_for_selector(self, selector: str, timeout: int = 30000) -> None:
        """等待选择器"""
        self._page.wait_for_selector(selector, timeout=timeout)
    
    def evaluate(self, script: str) -> Any:
        """执行JavaScript"""
        return self._page.evaluate(script)
    
    def query_selector(self, selector: str):
        """查询元素"""
        return self._page.query_selector(selector)
    
    def query_selector_all(self, selector: str):
        """查询所有元素"""
        return self._page.query_selector_all(selector)
    
    def close(self) -> None:
        """关闭页面"""
        self._page.close()

# 便捷函数
def create_browser(config: Optional[Dict[str, Any]] = None) -> CamoufoxBrowserWrapper:
    """创建浏览器实例"""
    return CamoufoxBrowserWrapper(config)

def quick_test(url: str = 'https://www.baidu.com', wait_time: int = 3, headless: bool = False) -> bool:
    """快速测试浏览器功能"""
    try:
        config = {'headless': headless}
        with create_browser(config) as browser:
            page = browser.goto(url)
            title = page.title()
            print(f'访问成功: {title}')
            time.sleep(wait_time)
            return True
    except Exception as e:
        print(f'访问失败: {e}')
        return False

# Cookie 管理便捷函数
def save_cookies(browser: CamoufoxBrowserWrapper, domain: str) -> Dict[str, Any]:
    """保存Cookie便捷函数"""
    return browser.save_cookies(domain)

def load_cookies(browser: CamoufoxBrowserWrapper, domain: str, url: str = None) -> Dict[str, Any]:
    """加载Cookie便捷函数"""
    return browser.load_cookies(domain, url)

def save_session(browser: CamoufoxBrowserWrapper, session_name: str) -> Dict[str, Any]:
    """保存会话便捷函数"""
    return browser.save_session(session_name)

def restore_session(browser: CamoufoxBrowserWrapper, session_name: str) -> Dict[str, Any]:
    """恢复会话便捷函数"""
    return browser.restore_session(session_name)

@contextmanager
def stealth_mode(headless: bool = False):
    """隐匿模式 - 强反检测"""
    config = {
        'headless': headless,
        'args': [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list'
        ],
        'locale': 'zh-CN'
    }
    
    with create_browser(config) as browser:
        yield browser

@contextmanager
def headless_mode():
    """无头模式"""
    config = {'headless': True}
    with create_browser(config) as browser:
        yield browser

# 导出接口
__all__ = [
    'create_browser',
    'quick_test', 
    'stealth_mode',
    'headless_mode',
    'SecurityError',
    'CamoufoxBrowserWrapper',
    'CamoufoxPageWrapper',
    # Cookie 管理函数
    'save_cookies',
    'load_cookies',
    'save_session',
    'restore_session'
]
