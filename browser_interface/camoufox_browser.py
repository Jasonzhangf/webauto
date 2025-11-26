"""
Camoufox browser wrapper (modularized).
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from typing import Any, Dict, List, Optional

from abstract_browser import AbstractBrowser, AbstractPage

from .errors import SecurityError
from .overlay import build_overlay_script
from .scripts import dom_select_script
from .page_wrapper import CamoufoxPageWrapper


class CamoufoxBrowserWrapper(AbstractBrowser):
  """
  Camoufox wrapper with overlay injection, cookie/session helpers, and auto-save.
  The class is intentionally lean; heavy scripts are loaded from browser_interface.assets/.
  """

  def __init__(self, config: Optional[Dict[str, Any]] = None):
    self.config = config or {}
    self._browser = None
    self._playwright = None
    self._context = None
    # 统一cookie存储路径到 ~/.webauto/cookies
    home = os.path.expanduser("~")
    self._cookie_dir = self.config.get("cookie_dir", os.path.join(home, ".webauto", "cookies"))
    self._auto_session: bool = bool(self.config.get("auto_session", False))
    self._session_name: str = self.config.get("session_name", "default")
    self._kill_previous: bool = bool(self.config.get("kill_previous", True))
    self._auto_save_interval: Optional[float] = self.config.get("auto_save_interval", 30.0)
    self._auto_save_running: bool = False
    self._auto_save_thread: Optional[threading.Thread] = None
    self._fingerprint_profile: str = self.config.get("fingerprint_profile", "fixed")
    self._profile_id: str = self.config.get("profile_id", "1688-main-v1")
    # 防止重复保存的时间戳
    self._last_save_time: float = 0
    self._save_lock = threading.Lock()
    # 延迟保存相关
    self._pending_save_timer = None
    self._last_cookie_state = None
    self._cookie_change_count = 0

  # --- Browser/context lifecycle -------------------------------------------------

  def _ensure_browser(self):
    if self._browser is not None:
      return

    from playwright.sync_api import sync_playwright
    from camoufox import NewBrowser

    if self._kill_previous and os.name != "nt":
      for proc in ("Camoufox", "camoufox"):
        try:
          subprocess.run(["pkill", "-f", proc], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
          pass

    try:
      import camoufox.utils as _cf_utils  # type: ignore

      def _no_addons(addons_list, exclude_list=None):  # type: ignore
        return

      def _no_confirm(paths):  # type: ignore
        return

      def _no_update_fonts(config, target_os):  # type: ignore
        return

      _cf_utils.add_default_addons = _no_addons  # type: ignore
      _cf_utils.confirm_paths = _no_confirm  # type: ignore
      _cf_utils.update_fonts = _no_update_fonts  # type: ignore
    except Exception:
      pass

    self._playwright = sync_playwright().start()
    locale = self.config.get("locale")
    base_args: List[str] = []
    extra_args = self.config.get("args", [])
    merged_args: List[str] = []
    for arg in base_args + extra_args:
      if arg not in merged_args:
        merged_args.append(arg)

    headless = self.config.get("headless", False)
    from_options = None

    if self._fingerprint_profile == "fixed":
      try:
        import camoufox.utils as _cf_utils  # type: ignore

        home = os.path.expanduser("~")
        profile_root = os.path.join(home, ".webauto", "camoufox-profiles")
        os.makedirs(profile_root, exist_ok=True)
        options_file = os.path.join(profile_root, f"launch_options_{self._profile_id}.json")

        def _normalize(opts: Dict[str, Any]) -> Dict[str, Any]:
          prefs = opts.get("firefox_user_prefs") or {}
          prefs.setdefault("browser.startup.homepage", "about:blank")
          prefs.setdefault("browser.newtabpage.enabled", False)
          prefs.setdefault("browser.newtabpage.activity-stream.enabled", False)
          prefs.setdefault("browser.shell.checkDefaultBrowser", False)
          opts["firefox_user_prefs"] = prefs
          args_list = list(opts.get("args") or [])
          opts["args"] = [a for a in args_list if not str(a).startswith("--lang=") and a not in ("--lang", "-lang")]
          return opts

        if os.path.exists(options_file):
          with open(options_file, "r", encoding="utf-8") as f:
            opts = json.load(f)
          from_options = _normalize(opts)
          with open(options_file, "w", encoding="utf-8") as f:
            json.dump(from_options, f, indent=2, ensure_ascii=False)
        else:
          launch_kwargs: Dict[str, Any] = {"headless": headless, "args": merged_args}
          if locale:
            launch_kwargs["locale"] = locale
          opts = _cf_utils.launch_options(**launch_kwargs)
          from_options = _normalize(opts)
          with open(options_file, "w", encoding="utf-8") as f:
            json.dump(from_options, f, indent=2, ensure_ascii=False)
      except Exception:
        from_options = None

    from camoufox import NewBrowser  # type: ignore
    if from_options is not None:
      self._browser = NewBrowser(self._playwright, from_options=from_options)
    else:
      launch_config: Dict[str, Any] = {"headless": headless, "args": merged_args}
      if locale:
        launch_config["locale"] = locale
      self._browser = NewBrowser(self._playwright, **launch_config)

  def _get_context(self):
    if self._context is not None:
      return self._context

    self._ensure_browser()

    if self._auto_session:
      try:
        self.restore_session(self._session_name)
      except Exception:
        pass

    if self._context is None:
      default_viewport = {"width": 1440, "height": 900}
      viewport = self.config.get("viewport", default_viewport)
      ctx_opts = {"viewport": viewport, "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
      self._context = self._browser.new_context(**ctx_opts)

    try:
      locale = self.config.get("locale", "zh-CN")
      lang_header = f"{locale},{locale.split('-')[0]};q=0.9,en;q=0.8"
      self._context.set_extra_http_headers({"Accept-Language": lang_header})
    except Exception:
      pass

    if not self.config.get("disable_chinese_fonts"):
      try:
        font_css = """
        (function() {
          try {
            const style = document.createElement('style');
            style.textContent = `
              html, body, * {
                font-family: "PingFang SC", "Microsoft YaHei", "SimHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
                text-rendering: optimizeLegibility;
                -webkit-font-smoothing: antialiased;
              }
            `;
            (document.head || document.documentElement).appendChild(style);
          } catch {}
        })();
        """
        self._context.add_init_script(font_css)
      except Exception:
        pass

    try:
      self._context.add_init_script(dom_select_script())
    except Exception:
      pass

    # 只在明确启用auto_session时才启动自动保存
    # 避免不必要的cookie保存导致的状态污染
    # 但要确保在session恢复后才启动自动保存，防止立即保存刚恢复的session
    if self._auto_session and self._auto_save_interval and self._auto_save_interval > 0:
      self._start_auto_save_thread(self._context)

    return self._context

  # --- Auto save ---------------------------------------------------------------

  def _schedule_delayed_save(self) -> None:
    """调度延迟保存，等待cookie稳定"""
    print(f"[COOKIE DEBUG] 调度延迟保存，当前时间: {time.time()}")
    # 取消之前的延迟保存定时器
    if self._pending_save_timer:
      print(f"[COOKIE DEBUG] 取消之前的延迟保存定时器")
      self._pending_save_timer.cancel()
      self._pending_save_timer = None

    # 创建新的延迟保存定时器（5秒延迟）
    def delayed_save():
      print(f"[COOKIE DEBUG] 执行延迟保存")
      try:
        self._save_session_if_changed(force_save=True)
      finally:
        self._pending_save_timer = None

    self._pending_save_timer = threading.Timer(5.0, delayed_save)
    self._pending_save_timer.daemon = True
    self._pending_save_timer.start()

  def _save_session_if_changed(self, force_save: bool = False) -> None:
    # 使用锁防止并发保存冲突
    if not self._save_lock.acquire(blocking=False):
      return

    try:
      if self._context is None:
        print('[COOKIE DEBUG] 跳过保存：context 不存在')
        return

      # 限制保存频率，避免频繁磁盘写入
      current_time = time.time()
      if not force_save and current_time - self._last_save_time < 30:  # 30秒内最多保存一次
        print(f"[COOKIE DEBUG] 跳过保存：距离上次保存仅 {current_time - self._last_save_time:.2f}s")
        return

      storage_state = self._context.storage_state()
      current_cookies = storage_state.get("cookies", [])

      # 生成当前cookie状态的指纹
      cookie_fingerprint = hash(json.dumps(sorted([
        (c.get('name'), c.get('value'), c.get('domain'), c.get('path'))
        for c in current_cookies
      ], key=lambda x: (x[0], x[1], x[2], x[3]))))

      # 检查cookie是否有变化
      if not force_save and self._last_cookie_state == cookie_fingerprint:
        print('[COOKIE DEBUG] 跳过保存：cookie 指纹未变化')
        return  # cookie没有变化，不需要保存

      # 检查是否有实质性变化（cookie数量或origin数量变化）
      session_file = os.path.join(self._cookie_dir, f"session_{self._session_name}.json")
      save_needed = True
      if os.path.exists(session_file):
        try:
          with open(session_file, "r", encoding="utf-8") as f:
            old_state = json.load(f)

          old_cookies = len(old_state.get("cookies", []))
          old_origins = len(old_state.get("origins", []))
          new_cookies = len(current_cookies)
          new_origins = len(storage_state.get("origins", []))

          # 只有cookie或origin数量变化时才保存
          if old_cookies == new_cookies and old_origins == new_origins:
            print(f"[COOKIE DEBUG] 跳过保存：数量无变化 (cookies {old_cookies}->{new_cookies}, origins {old_origins}->{new_origins})")
            save_needed = False
        except Exception:
          pass  # 读取失败时强制保存

      if save_needed:
        os.makedirs(self._cookie_dir, exist_ok=True)
        with open(session_file, "w", encoding="utf-8") as f:
          json.dump(storage_state, f, indent=2, ensure_ascii=False)
        self._last_save_time = current_time
        self._last_cookie_state = cookie_fingerprint
        print(f"[COOKIE DEBUG] 保存session: {session_file}, cookies: {len(current_cookies)}, force_save: {force_save}")

    except Exception as e:
      print(f"[COOKIE ERROR] 保存session失败: {str(e)}")
      pass
    finally:
      self._save_lock.release()

  def _start_auto_save_thread(self, context) -> None:
    if self._auto_save_running:
      return
    self._auto_save_running = True
    interval_ms = int((self._auto_save_interval or 30.0) * 1000)
    binding_name = "__wa_save_state__"

    def _binding(_source) -> None:  # type: ignore[unused-argument]
      if not self._auto_save_running:
        return
      # 触发延迟保存而不是立即保存
      print(f"[COOKIE DEBUG] 接收到JS绑定保存请求")
      self._schedule_delayed_save()

    try:
      context.expose_binding(binding_name, _binding)
    except Exception:
      self._auto_save_running = False
      return

    script = f"""
    (function() {{
      try {{
        if (window.__waSaveStateTimer) return;

        // 防止重复初始化标记
        window.__waSaveStateInit = true;

        // 添加调试日志
        window.__waSaveStateLastUrl = window.location.href;
        window.__waSaveStateLastCheck = Date.now();

        window.__waSaveStateTimer = setInterval(function() {{
          try {{
            var now = Date.now();
            var url = window.location.href;

            // 检查页面是否仍在加载
            if (document.readyState !== 'complete') {{
              console.log('[COOKIE DEBUG] 页面未完全加载，跳过保存');
              return; // 页面未完全加载，跳过保存
            }}

            // 检查是否有活动导航
            if (url !== window.__waSaveStateLastUrl) {{
              console.log('[COOKIE DEBUG] URL变化，跳过保存:', window.__waSaveStateLastUrl, '->', url);
              window.__waSaveStateLastUrl = url;
              window.__waSaveStateLastCheck = now;
              return; // URL刚变化，等待稳定
            }}

            // 确保页面稳定至少5秒才触发保存
            if (now - window.__waSaveStateLastCheck < 5000) {{
              console.log('[COOKIE DEBUG] 页面未稳定足够时间，跳过保存');
              return;
            }}

            // 只在页面稳定且非导航状态时检查保存
            if (window.performance && window.performance.navigation) {{
              if (window.performance.navigation.type !== 0) {{
                console.log('[COOKIE DEBUG] 非正常加载导航，跳过保存');
                return; // 不是正常加载，跳过保存
              }}
            }}

            console.log('[COOKIE DEBUG] 触发保存检查');
            var fn = window['{binding_name}'];
            if (typeof fn === 'function') {{
              fn();
            }}

            // 更新最后检查时间
            window.__waSaveStateLastCheck = now;

          }} catch (e) {{
            console.log('[COOKIE DEBUG] 保存检查错误:', e);
          }}
        }}, {interval_ms});

        // 记录初始URL
        window.__waSaveStateLastUrl = window.location.href;
        console.log('[COOKIE DEBUG] 初始化自动保存检查器');
      }} catch (e) {{
        console.log('[COOKIE DEBUG] 初始化保存检查器错误:', e);
      }}
    }})();
    """
    try:
      context.add_init_script(script)
    except Exception:
      self._auto_save_running = False

  # --- Overlay -----------------------------------------------------------------

  def install_overlay(self, session_id: str, profile_id: Optional[str] = None) -> None:
    try:
      context = self._get_context()
      script = build_overlay_script(session_id, profile_id)
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
        except Exception:
          return
        try:
          def _on_nav(_frame):
            try:
              page.evaluate(script)
            except Exception:
              pass
          page.on("framenavigated", _on_nav)  # type: ignore[attr-defined]
        except Exception:
          pass

      for p in pages:
        _ensure_overlay_on_page(p)

      try:
        def _on_new_page(page):
          _ensure_overlay_on_page(page)
        context.on("page", _on_new_page)  # type: ignore[attr-defined]
      except Exception:
        pass
    except Exception:
      pass

  # --- Public API --------------------------------------------------------------

  def new_page(self) -> AbstractPage:
    context = self._get_context()
    page = context.new_page()
    return CamoufoxPageWrapper(page)

  def goto(self, url: str) -> AbstractPage:
    page = self.new_page()
    page.goto(url)
    return page

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
    print(f"[COOKIE DEBUG] 开始恢复session: {session_name}")
    try:
      path = os.path.join(self._cookie_dir, f"session_{session_name}.json")
      if not os.path.exists(path):
        return {"success": False, "error": f"会话文件不存在: {path}"}

      with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)

      # 验证session文件数据完整性
      cookies = state.get("cookies", [])
      if not isinstance(cookies, list):
        return {"success": False, "error": "Session文件格式错误：cookies不是数组"}

      # 检查cookie是否过期
      current_time = time.time()
      valid_cookies = []
      for cookie in cookies:
        expires = cookie.get("expires")
        if expires is None or expires == -1 or (isinstance(expires, (int, float)) and expires > current_time):
          valid_cookies.append(cookie)

      # 过滤掉过期cookie，避免登录状态异常
      if len(valid_cookies) != len(cookies):
        state["cookies"] = valid_cookies
        print(f"[COOKIE DEBUG] 过滤过期cookie: {len(cookies)} -> {len(valid_cookies)}")

      # 临时禁用自动保存，防止恢复过程中的循环保存
      original_auto_save = self._auto_save_running
      print(f"[COOKIE DEBUG] 原始自动保存状态: {original_auto_save}")
      self._auto_save_running = False

      # 关闭现有context
      if self._context:
        print(f"[COOKIE DEBUG] 关闭现有context")
        self._context.close()

      self._ensure_browser()
      print(f"[COOKIE DEBUG] 创建新context并加载storage state")
      self._context = self._browser.new_context(storage_state=state)

      # 恢复自动保存状态（如果原本启用了）
      if original_auto_save:
        print(f"[COOKIE DEBUG] 恢复自动保存状态")
        # 延迟重启自动保存，等待context稳定
        def delayed_restart():
          print(f"[COOKIE DEBUG] 延迟重启自动保存线程")
          time.sleep(2.0)  # 等待2秒让context稳定
          if self._context and not self._auto_save_running:
            # 重置cookie状态以避免立即保存
            self._last_cookie_state = None
            self._last_save_time = time.time()
            print(f"[COOKIE DEBUG] 重置cookie状态并启动自动保存线程")
            self._start_auto_save_thread(self._context)

        import threading
        restart_thread = threading.Thread(target=delayed_restart, daemon=True)
        restart_thread.start()

      print(f"[COOKIE DEBUG] session恢复完成，加载了{len(valid_cookies)}个cookies")
      return {
        "success": True,
        "session": session_name,
        "cookies_loaded": len(valid_cookies),
        "origins_loaded": len(state.get("origins", [])),
      }
    except Exception as e:
      print(f"[COOKIE ERROR] 恢复session失败: {str(e)}")
      return {"success": False, "error": str(e)}

  def get_storage_state(self) -> Dict[str, Any]:
    context = self._get_context()
    return context.storage_state()

  def close(self) -> None:
    print(f"[COOKIE DEBUG] 开始关闭浏览器实例")
    try:
      self._auto_save_running = False
      if self._auto_save_thread and self._auto_save_thread.is_alive():
        try:
          self._auto_save_thread.join(timeout=2.0)
        except Exception:
          pass

      if self._auto_session and self._context is not None:
        try:
          # 取消待处理的延迟保存
          if self._pending_save_timer:
            print(f"[COOKIE DEBUG] 关闭时取消待处理的延迟保存")
            self._pending_save_timer.cancel()
            self._pending_save_timer = None

          # 强制保存最终状态
          print(f"[COOKIE DEBUG] 关闭时强制保存最终状态")
          self._save_session_if_changed(force_save=True)
        except Exception as e:
          print(f"[COOKIE ERROR] 关闭时保存状态失败: {str(e)}")
          pass

      if self._context:
        print(f"[COOKIE DEBUG] 关闭context")
        self._context.close()
      if self._browser:
        print(f"[COOKIE DEBUG] 关闭browser")
        self._browser.close()
      if self._playwright:
        print(f"[COOKIE DEBUG] 停止playwright")
        self._playwright.stop()
    except Exception as e:
      print(f"[COOKIE ERROR] 关闭浏览器实例失败: {str(e)}")
      pass
    finally:
      self._browser = None
      self._playwright = None
      self._context = None
      print(f"[COOKIE DEBUG] 浏览器实例关闭完成")

  def get_status(self) -> Dict[str, Any]:
    return {
      "type": "camoufox",
      "connected": self._browser is not None,
      "config": self.config,
      "context_active": self._context is not None,
    }

  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc_val, exc_tb):
    self.close()


__all__ = ["CamoufoxBrowserWrapper"]
