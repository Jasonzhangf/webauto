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
    self._cookie_dir = self.config.get("cookie_dir", "./cookies")
    self._auto_session: bool = bool(self.config.get("auto_session", False))
    self._session_name: str = self.config.get("session_name", "default")
    self._kill_previous: bool = bool(self.config.get("kill_previous", True))
    self._auto_save_interval: Optional[float] = self.config.get("auto_save_interval", 5.0)
    self._auto_save_running: bool = False
    self._auto_save_thread: Optional[threading.Thread] = None
    self._last_state_hash: Optional[str] = None
    self._fingerprint_profile: str = self.config.get("fingerprint_profile", "fixed")
    self._profile_id: str = self.config.get("profile_id", "1688-main-v1")

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

    if self._auto_session and self._auto_save_interval and self._auto_save_interval > 0:
      self._start_auto_save_thread(self._context)

    return self._context

  # --- Auto save ---------------------------------------------------------------

  def _save_session_if_changed(self) -> None:
    try:
      if self._context is None:
        return
      storage_state = self._context.storage_state()
      state_json = json.dumps(storage_state, sort_keys=True)
      state_hash = hash(state_json)
      if state_hash == self._last_state_hash:
        return
      self._last_state_hash = state_hash
      os.makedirs(self._cookie_dir, exist_ok=True)
      session_file = os.path.join(self._cookie_dir, f"session_{self._session_name}.json")
      with open(session_file, "w", encoding="utf-8") as f:
        json.dump(storage_state, f, indent=2, ensure_ascii=False)
    except Exception:
      pass

  def _start_auto_save_thread(self, context) -> None:
    if self._auto_save_running:
      return
    self._auto_save_running = True
    interval_ms = int((self._auto_save_interval or 5.0) * 1000)
    binding_name = "__wa_save_state__"

    def _binding(_source) -> None:  # type: ignore[unused-argument]
      if not self._auto_save_running:
        return
      self._save_session_if_changed()

    try:
      context.expose_binding(binding_name, _binding)
    except Exception:
      self._auto_save_running = False
      return

    script = f"""
    (function() {{
      try {{
        if (window.__waSaveStateTimer) return;
        window.__waSaveStateTimer = setInterval(function() {{
          try {{
            var fn = window['{binding_name}'];
            if (typeof fn === 'function') {{
              fn();
            }}
          }} catch (e) {{}}
        }}, {interval_ms});
      }} catch (e) {{}}
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
      self._auto_save_running = False
      if self._auto_save_thread and self._auto_save_thread.is_alive():
        try:
          self._auto_save_thread.join(timeout=2.0)
        except Exception:
          pass

      if self._auto_session and self._context is not None:
        try:
          state = self._context.storage_state()
          os.makedirs(self._cookie_dir, exist_ok=True)
          path = os.path.join(self._cookie_dir, f"session_{self._session_name}.json")
          with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        except Exception:
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
