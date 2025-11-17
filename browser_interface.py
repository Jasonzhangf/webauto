"""
浏览器接口模块
WebAuto 统一浏览器入口 - 使用 Camoufox
包含完整的Cookie管理和JavaScript执行功能
"""

import sys
import os
import time
import json
import subprocess
import threading
import hashlib
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
        # 是否在同一 profile 下启动前自动终止已有 Camoufox 实例（互斥）
        self._kill_previous: bool = bool(self.config.get('kill_previous', True))
        # 自动会话周期性保存间隔（秒），用于应对 1688 等站点频繁更新 cookie 的场景
        # None/0 表示只在 close() 时保存一次；默认 5 秒
        self._auto_save_interval: Optional[float] = self.config.get('auto_save_interval', 5.0)
        self._auto_save_running: bool = False
        self._auto_save_thread: Optional[threading.Thread] = None
        self._last_state_hash: Optional[str] = None
        # 指纹策略：'random' 为每次随机，'fixed' 为按 profile 固定指纹（适用于 1688 等强绑定站点）
        # 默认采用固定指纹，并将默认 profile 固定为 1688 场景使用的 profile
        self._fingerprint_profile: str = self.config.get('fingerprint_profile', 'fixed')
        self._profile_id: str = self.config.get('profile_id', '1688-main-v1')
    
    def _ensure_browser(self):
        """确保浏览器已初始化"""
        if self._browser is None:
            from playwright.sync_api import sync_playwright
            from camoufox import NewBrowser

            # 同一 profile 互斥：在启动前尝试终止已有 Camoufox 进程，避免残留窗口和竞争
            if self._kill_previous and sys.platform != 'win32':
                try:
                    subprocess.run(['pkill', '-f', 'Camoufox'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    subprocess.run(['pkill', '-f', 'camoufox'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
            # 禁用 Camoufox 默认扩展下载与路径校验，避免在受限网络环境下因 UBO 安装失败导致启动错误；
            # 同时关闭字体指纹修改，避免将中文字体替换成不含 CJK 字形的组合，导致页面中文渲染成方框。
            try:
                import camoufox.utils as _cf_utils  # type: ignore

                def _no_addons(addons_list, exclude_list=None):  # type: ignore
                    return

                def _no_confirm(paths):  # type: ignore
                    return

                def _no_update_fonts(config, target_os):  # type: ignore
                    # 保留系统默认字体列表，避免指纹算法干预中文字体渲染
                    return

                _cf_utils.add_default_addons = _no_addons  # type: ignore
                _cf_utils.confirm_paths = _no_confirm      # type: ignore
                _cf_utils.update_fonts = _no_update_fonts  # type: ignore
            except Exception:
                pass

            self._playwright = sync_playwright().start()
            # 默认中文配置 - 使用最小化但有效的中文环境
            # 经验表明：Camoufox 内部 locale 配置已经足够，额外传入 locale/--lang 可能触发内部跳转到 zh-cn 错误页面。
            # 因此这里只从 config 读取 locale，不再为其设置默认值，也尽量避免传入 Camoufox，仅在需要时由上层显式配置。
            locale = self.config.get('locale')
            base_args: list[str] = []
            extra_args = self.config.get('args', [])
            merged_args = []
            for arg in base_args + extra_args:
                if arg not in merged_args:
                    merged_args.append(arg)

            headless = self.config.get('headless', False)

            # 指纹策略：固定指纹使用 launch_options 生成并持久化 from_options，其余保持原行为
            from_options = None
            if self._fingerprint_profile == 'fixed':
                try:
                    import camoufox.utils as _cf_utils  # type: ignore
                    home = os.path.expanduser('~')
                    profile_root = os.path.join(home, '.webauto', 'camoufox-profiles')
                    os.makedirs(profile_root, exist_ok=True)
                    options_file = os.path.join(profile_root, f'launch_options_{self._profile_id}.json')

                    def _normalize_launch_options(opts: Dict[str, Any]) -> Dict[str, Any]:
                        """
                        规范化 Camoufox 启动配置：
                        - 确保启动页为 about:blank，避免默认主页造成跳转
                        - 移除历史遗留的 '--lang=xx' 参数，避免被错误解析为 URL（如 zh-cn）
                        """
                        prefs = opts.get('firefox_user_prefs') or {}
                        # 将主页和新标签页设置为 about:blank
                        prefs.setdefault('browser.startup.homepage', 'about:blank')
                        prefs.setdefault('browser.newtabpage.enabled', False)
                        prefs.setdefault('browser.newtabpage.activity-stream.enabled', False)
                        prefs.setdefault('browser.shell.checkDefaultBrowser', False)
                        opts['firefox_user_prefs'] = prefs

                        # 清理 args 中残留的语言相关参数，尤其是 '--lang=zh-CN' 这类会被错误当成 URL 的参数
                        args_list = list(opts.get('args') or [])
                        filtered_args = []
                        for a in args_list:
                            sa = str(a)
                            if sa.startswith('--lang=') or sa == '--lang' or sa == '-lang':
                                continue
                            filtered_args.append(a)
                        opts['args'] = filtered_args

                        return opts

                    if os.path.exists(options_file):
                        with open(options_file, 'r', encoding='utf-8') as f:
                            opts = json.load(f)
                        from_options = _normalize_launch_options(opts)
                        # 将修正后的配置写回，避免旧文件中残留错误 homepage
                        with open(options_file, 'w', encoding='utf-8') as f:
                            json.dump(from_options, f, indent=2, ensure_ascii=False)
                    else:
                        launch_kwargs = {
                            'headless': headless,
                            'args': merged_args
                        }
                        if locale:
                            launch_kwargs['locale'] = locale

                        opts = _cf_utils.launch_options(**launch_kwargs)
                        from_options = _normalize_launch_options(opts)
                        with open(options_file, 'w', encoding='utf-8') as f:
                            json.dump(from_options, f, indent=2, ensure_ascii=False)
                except Exception:
                    from_options = None

            if from_options is not None:
                # 使用固定指纹配置启动 Camoufox
                self._browser = NewBrowser(
                    self._playwright,
                    from_options=from_options
                )
            else:
                # 默认配置 - 强制使用 Camoufox（随机指纹）
                launch_config = {
                    'headless': headless,
                    'args': merged_args,
                }
                if locale:
                    launch_config['locale'] = locale
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

            # 视口尺寸：优先使用外部传入的 viewport，其次使用一个较小的默认窗口尺寸，
            # 避免每次启动都是 1920x1080 的大窗口。
            default_viewport = {'width': 1440, 'height': 900}
            viewport = self.config.get('viewport', default_viewport)

            context_options = {
                'viewport': viewport,
                'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
            self._context = self._browser.new_context(**context_options)

            # 设置 Accept-Language，保持与手工验证脚本一致
            try:
                locale = self.config.get('locale', 'zh-CN')
                lang_header = '{0},{1};q=0.9,en;q=0.8'.format(
                    locale,
                    locale.split('-')[0]
                )
                self._context.set_extra_http_headers({
                    'Accept-Language': lang_header
                })
            except Exception:
                # 语言头设置失败不影响主流程
                pass

            # 默认：注入通用中文字体 CSS，防止 Camoufox 指纹系统选择到缺少 CJK 字形的字体
            # 如需完全关闭，可在 config 中设置 disable_chinese_fonts=True
            if not self.config.get('disable_chinese_fonts'):
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
                    # 字体增强失败不应影响主流程
                    pass

            # DOM 选取辅助脚本：在页面级提供 window.__webautoDomSelect（F2 开启 / ESC 关闭）
            try:
                dom_select_script = """
                (function() {
                  try {
                    if (window.__webautoDomSelect) return;
                    const state = { active: false, box: null, lastTarget: null };

                    function ensureBox() {
                      if (state.box) return state.box;
                      const box = document.createElement('div');
                      box.id = '__webauto_dom_highlight__';
                      box.style.position = 'absolute';
                      box.style.zIndex = '2147483646';
                      box.style.pointerEvents = 'none';
                      box.style.border = '2px solid #3b82f6';
                      box.style.borderRadius = '4px';
                      box.style.boxShadow = '0 0 0 1px rgba(15,23,42,0.8)';
                      box.style.background = 'rgba(37,99,235,0.08)';
                      box.style.transition = 'all 0.06s ease-out';
                      document.documentElement.appendChild(box);
                      state.box = box;
                      return box;
                    }

                    function isOverlayElement(el) {
                      try {
                        if (!el) return false;
                        if (el.id === '__webauto_overlay_root__') return true;
                        if (el.closest) {
                          return !!el.closest('#__webauto_overlay_root__');
                        }
                        return false;
                      } catch (e) {
                        return false;
                      }
                    }

                    function updateBoxFor(el) {
                      if (!el) return;
                      const box = ensureBox();
                      const rect = el.getBoundingClientRect();
                      const scrollX = window.scrollX || window.pageXOffset || 0;
                      const scrollY = window.scrollY || window.pageYOffset || 0;
                      box.style.left = (rect.left + scrollX - 2) + 'px';
                      box.style.top = (rect.top + scrollY - 2) + 'px';
                      box.style.width = Math.max(rect.width + 4, 4) + 'px';
                      box.style.height = Math.max(rect.height + 4, 4) + 'px';
                      box.style.display = 'block';
                    }

                    function hideBox() {
                      if (state.box) {
                        state.box.style.display = 'none';
                      }
                    }

                    function buildSelector(el) {
                      try {
                        if (!el || el.nodeType !== 1) return '';
                        if (el.id && document.getElementById(el.id) === el) {
                          var rawId = el.id;
                          var escId = (window.CSS && CSS.escape)
                            ? CSS.escape(rawId)
                            : rawId.replace(/([^a-zA-Z0-9_-])/g, '\\\\$1');
                          return '#' + escId;
                        }
                        const parts = [];
                        let cur = el;
                        while (cur && cur.nodeType === 1 && parts.length < 4) {
                          let part = cur.nodeName.toLowerCase();
                          if (cur.classList && cur.classList.length) {
                            const candidate = Array.from(cur.classList).find(function(c) {
                              return !/^(active|selected|hover|focus|current|on|off)$/i.test(c);
                            });
                            if (candidate) {
                              var escClass = (window.CSS && CSS.escape)
                                ? CSS.escape(candidate)
                                : candidate.replace(/([^a-zA-Z0-9_-])/g, '\\\\$1');
                              part += '.' + escClass;
                            }
                          }
                          const parent = cur.parentElement;
                          if (parent) {
                            const sameTag = Array.prototype.filter.call(parent.children, function(c) {
                              return c.tagName === cur.tagName;
                            });
                            if (sameTag.length > 1) {
                              const idx = sameTag.indexOf(cur) + 1;
                              part += ':nth-of-type(' + idx + ')';
                            }
                          }
                          parts.unshift(part);
                          cur = cur.parentElement;
                        }
                        return parts.join(' > ');
                      } catch (e) {
                        return '';
                      }
                    }

                    function onMove(ev) {
                      if (!state.active) return;
                      const path = ev.composedPath ? ev.composedPath() : null;
                      const target = path && path.length ? path[0] : ev.target;
                      if (!target || isOverlayElement(target)) {
                        hideBox();
                        return;
                      }
                      state.lastTarget = target;
                      updateBoxFor(target);
                    }

                    function onClick(ev) {
                      if (!state.active) return;
                      const path = ev.composedPath ? ev.composedPath() : null;
                      const target = path && path.length ? path[0] : ev.target;
                      if (!target || isOverlayElement(target)) return;
                      try {
                        ev.preventDefault();
                        ev.stopPropagation();
                      } catch (e) {}
                      const selector = buildSelector(target);
                      const rect = target.getBoundingClientRect();
                      const detail = {
                        selector: selector,
                        tagName: target.tagName,
                        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                      };
                      try {
                        window.dispatchEvent(new CustomEvent('__webauto_dom_picked', { detail: detail }));
                      } catch (e) {}
                    }

                    function enable() {
                      if (state.active) return;
                      state.active = true;
                      document.addEventListener('mousemove', onMove, true);
                      document.addEventListener('click', onClick, true);
                      ensureBox();
                    }

                    function disable() {
                      if (!state.active) return;
                      state.active = false;
                      document.removeEventListener('mousemove', onMove, true);
                      document.removeEventListener('click', onClick, true);
                      hideBox();
                    }

                    window.__webautoDomSelect = {
                      enable: enable,
                      disable: disable,
                      get isActive() { return state.active; }
                    };

                    window.addEventListener('keydown', function(ev) {
                      try {
                        if (ev.key === 'F2') {
                          ev.preventDefault();
                          if (state.active) {
                            disable();
                          } else {
                            enable();
                          }
                        } else if (ev.key === 'Escape') {
                          if (state.active) {
                            ev.preventDefault();
                            disable();
                          }
                        }
                      } catch (e) {}
                    }, true);
                  } catch (e) {}
                })();
                """
                self._context.add_init_script(dom_select_script)
            except Exception:
                # DOM 选取脚本注入失败不影响主流程
                pass

            # 如启用自动会话 & 配置了自动保存间隔，则通过前端定时器 + binding
            # 周期性触发 storage_state 持久化（在 Playwright 的事件循环线程中执行，
            # 避免直接在 Python 线程里调用 storage_state 产生 greenlet 错误）。
            if self._auto_session and self._auto_save_interval and self._auto_save_interval > 0:
                self._start_auto_save_thread(self._context)
        return self._context

    def _save_session_if_changed(self) -> None:
        """
        在当前上下文中获取 storage_state，如有变化则增量写入 session 文件。
        在 Playwright 暴露的 binding 回调中执行，以保证运行在正确的事件循环线程中。
        """
        try:
            context = self._get_context()
            state = context.storage_state()
            serialized = json.dumps(
                state,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":")
            )
            current_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
            if self._last_state_hash is not None and self._last_state_hash == current_hash:
                return

            os.makedirs(self._cookie_dir, exist_ok=True)
            session_file = os.path.join(
                self._cookie_dir,
                f'session_{self._session_name}.json'
            )
            with open(session_file, 'w', encoding='utf-8') as f:
                f.write(serialized)

            self._last_state_hash = current_hash
        except Exception:
            # 自动保存失败不影响主流程
            pass

    def _start_auto_save_thread(self, context) -> None:
        """
        通过 Playwright binding + 前端 setInterval 周期性保存会话
        （不再使用 Python 线程，避免 greenlet 跨线程错误）
        """
        if self._auto_save_running:
            return

        self._auto_save_running = True

        try:
            interval_ms = int((self._auto_save_interval or 5.0) * 1000)
            binding_name = "__wa_save_state__"

            def _binding(source) -> None:  # type: ignore[unused-argument]
                if not self._auto_save_running:
                    return
                self._save_session_if_changed()

            try:
                context.expose_binding(binding_name, _binding)
            except Exception:
                # binding 注册失败则不再尝试自动保存
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
                # init script 注入失败则不再自动保存
                self._auto_save_running = False
        except Exception:
            self._auto_save_running = False

    def install_overlay(self, session_id: str, profile_id: Optional[str] = None) -> None:
        """
        在当前浏览器上下文中安装容器编辑悬浮菜单（Shadow DOM 隔离）

        与 Node 侧 ``libs/browser/ui-overlay.js`` 的视觉和交互骨架保持一致：
        - 右上角瘦长 pill（显示 SID / Profile +「容器编辑」按钮）
        - 可展开/折叠的容器树 + DOM 选取面板（当前仅为 UI 雏形，无真实数据绑定）
        - 通过 ``add_init_script`` 保证所有新页面都会自动注入该 UI
        """
        try:
            context = self._get_context()
            sid = json.dumps(session_id)
            pid = json.dumps(profile_id or self._session_name or "default")

            # 这是与 libs/browser/ui-overlay.js::buildOverlayScript 基本等价的脚本实现，
            # 只是将 Node 里的模板变量 ${sid}/${pid} 替换为占位符，在这里用 Python 注入。
            script_template = r"""
            (() => {
              try {
                const ROOT_ID = '__webauto_overlay_root__';

                function ensureOverlay() {
                  try {
                    if (document.getElementById(ROOT_ID)) return;

                    const root = document.createElement('div');
                    root.id = ROOT_ID;
                    root.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;pointer-events:none;';

                    const host = document.createElement('div');
                    root.appendChild(host);

                    const shadow = host.attachShadow({ mode: 'open' });
                    const style = document.createElement('style');
                    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      }
      .wa-root {
        pointer-events: auto;
        position: relative;
      }
      .wa-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(15,23,42,0.92);
        border: 1px solid rgba(55,65,81,0.9);
        color: #e5e7eb;
        font-size: 11px;
        box-shadow: 0 6px 16px rgba(0,0,0,0.75);
        cursor: default;
      }
      .wa-pill-label {
        opacity: .6;
      }
      .wa-pill-sep {
        width: 1px;
        height: 12px;
        background: rgba(55,65,81,0.9);
      }
      .wa-pill-btn {
        border-radius: 999px;
        padding: 2px 6px;
        border: 1px solid rgba(59,130,246,0.7);
        background: rgba(37,99,235,0.12);
        color: #bfdbfe;
        font-size: 11px;
        cursor: default;
      }
      .wa-panel {
        position: absolute;
        top: 26px;
        right: 0;
        width: 420px;
        height: 560px;
        background: #020617;
        border-radius: 14px;
        border: 1px solid #1e293b;
        box-shadow: 0 18px 45px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .wa-panel.hidden {
        display: none;
      }
      .wa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid #1f2937;
        background: linear-gradient(90deg,#020617,#0b1120);
        font-size: 11px;
        color: #e5e7eb;
      }
      .wa-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .wa-badge {
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(59,130,246,0.15);
        border: 1px solid rgba(59,130,246,0.4);
        color: #bfdbfe;
      }
      .wa-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .wa-icon-btn {
        border: none;
        background: transparent;
        color: #6b7280;
        font-size: 13px;
        padding: 2px 4px;
        border-radius: 4px;
        cursor: default;
      }
      .wa-icon-btn:hover {
        background: rgba(55,65,81,0.6);
        color: #e5e7eb;
      }
      .wa-tabs {
        display: flex;
        padding: 6px 10px;
      }
      .wa-tab {
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid transparent;
        background: transparent;
        color: #9ca3af;
        cursor: default;
      }
      .wa-tab.active {
        background: rgba(59,130,246,0.15);
        border-color: rgba(59,130,246,0.7);
        color: #eff6ff;
      }
      .wa-body {
        flex: 1;
        display: flex;
        min-height: 0;
        background: #020617;
      }
      .wa-left {
        width: 46%;
        border-right: 1px solid #1f2937;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #020617;
      }
      .wa-right {
        flex: 1;
        padding: 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #020617;
      }
      .wa-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #9ca3af;
      }
      .wa-search {
        width: 140px;
        padding: 3px 6px;
        border-radius: 999px;
        border: 1px solid #1f2937;
        background: #020617;
        color: #e5e7eb;
        font-size: 11px;
      }
      .wa-search::placeholder {
        color: #4b5563;
      }
      .wa-tree {
        flex: 1;
        border-radius: 8px;
        background: #020617;
        border: 1px solid #111827;
        padding: 6px 4px;
        font-size: 12px;
        overflow: auto;
      }
      .wa-tree-node {
        padding: 2px 6px;
        border-radius: 4px;
        color: #9ca3af;
      }
      .wa-tree-node-root {
        font-weight: 500;
        color: #e5e7eb;
      }
      .wa-tree-node-selected {
        background: rgba(37,99,235,0.32);
        color: #eff6ff;
      }
      .wa-tree-node-child {
        margin-left: 14px;
      }
      .wa-tree-children {
        margin-top: 2px;
        margin-left: 14px;
      }
      .wa-section {
        border-radius: 10px;
        background: rgba(15,23,42,0.9);
        border: 1px solid #1e293b;
        padding: 8px 10px;
        font-size: 12px;
      }
      .wa-section-title {
        font-size: 12px;
        color: #e5e7eb;
        margin-bottom: 4px;
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      .wa-section-sub {
        font-size: 10px;
        color: #6b7280;
      }
      .wa-field {
        display: flex;
        margin-bottom: 4px;
      }
      .wa-field label {
        width: 72px;
        color: #9ca3af;
        font-size: 11px;
      }
      .wa-field-value {
        flex: 1;
        color: #e5e7eb;
        font-size: 12px;
      }
      .wa-op-list {
        list-style: none;
        padding: 0;
        margin: 4px 0 4px;
      }
      .wa-op-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 3px 6px;
        border-radius: 6px;
        background: #020617;
        border: 1px solid #111827;
        margin-bottom: 3px;
      }
      .wa-op-handle {
        font-size: 11px;
        color: #4b5563;
        margin-right: 4px;
      }
      .wa-op-name {
        flex: 1;
      }
      .wa-op-delete {
        border: none;
        background: transparent;
        color: #f97373;
        font-size: 11px;
      }
      .wa-btn-link {
        border: none;
        background: transparent;
        color: #93c5fd;
        font-size: 11px;
        padding: 0;
        margin-top: 2px;
      }
      .wa-op-palette {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .wa-op-chip {
        padding: 2px 8px;
        border-radius: 999px;
        background: #020617;
        border: 1px solid #374151;
        font-size: 11px;
        color: #d1d5db;
      }
      .wa-subcontainer-list {
        list-style: none;
        padding: 0;
        margin: 3px 0 6px;
        font-size: 11px;
        color: #d1d5db;
      }
      .wa-subcontainer-list li {
        padding: 2px 0;
      }
      .wa-btn-primary {
        border-radius: 999px;
        border: none;
        padding: 4px 10px;
        font-size: 11px;
        background: #2563eb;
        color: white;
      }
      .wa-footer {
        border-top: 1px solid #1f2937;
        padding: 4px 10px;
        font-size: 11px;
        color: #6b7280;
        display: flex;
        justify-content: space-between;
        background: #020617;
      }
      .wa-footer span {
        white-space: nowrap;
      }
      .wa-tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .wa-tab-content.dom-mode {
        padding: 10px;
        font-size: 12px;
        color: #d1d5db;
      }
                    `;

                    shadow.appendChild(style);

                    const rootWrap = document.createElement('div');
                    rootWrap.className = 'wa-root';

                    // 顶部 pill（SID/Profile + 打开编辑器按钮）
                    const pill = document.createElement('div');
                    pill.className = 'wa-pill';

                    const sidLabel = document.createElement('span');
                    sidLabel.className = 'wa-pill-label';
                    sidLabel.textContent = 'SID';
                    const sidVal = document.createElement('span');
                    sidVal.id = '__waOverlay_sid';
                    sidVal.textContent = __SID__;

                    const sep = document.createElement('span');
                    sep.className = 'wa-pill-sep';

                    const pidLabel = document.createElement('span');
                    pidLabel.className = 'wa-pill-label';
                    pidLabel.textContent = 'P';
                    const pidVal = document.createElement('span');
                    pidVal.id = '__waOverlay_pid';
                    pidVal.textContent = __PID__;

                    const openBtn = document.createElement('button');
                    openBtn.className = 'wa-pill-btn';
                    openBtn.textContent = '容器编辑';

                    pill.appendChild(sidLabel);
                    pill.appendChild(sidVal);
                    pill.appendChild(sep);
                    pill.appendChild(pidLabel);
                    pill.appendChild(pidVal);
                    pill.appendChild(openBtn);

                    // 主面板
                    const panel = document.createElement('div');
                    panel.className = 'wa-panel hidden';

                    const header = document.createElement('div');
                    header.className = 'wa-header';

                    const headerLeft = document.createElement('div');
                    headerLeft.className = 'wa-header-left';
                    const badgeSid = document.createElement('span');
                    badgeSid.className = 'wa-badge';
                    badgeSid.textContent = 'Session: ' + __SID__;
                    const badgePid = document.createElement('span');
                    badgePid.className = 'wa-badge';
                    badgePid.textContent = 'Profile: ' + __PID__;
                    headerLeft.appendChild(badgeSid);
                    headerLeft.appendChild(badgePid);

                    const headerActions = document.createElement('div');
                    headerActions.className = 'wa-header-actions';
                    const collapseBtn = document.createElement('button');
                    collapseBtn.className = 'wa-icon-btn';
                    collapseBtn.textContent = '▾';
                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'wa-icon-btn';
                    closeBtn.textContent = '×';
                    headerActions.appendChild(collapseBtn);
                    headerActions.appendChild(closeBtn);

                    header.appendChild(headerLeft);
                    header.appendChild(headerActions);

                    const tabs = document.createElement('div');
                    tabs.className = 'wa-tabs';
                    const tabTree = document.createElement('button');
                    tabTree.className = 'wa-tab active';
                    tabTree.textContent = '容器树';
                    const tabDom = document.createElement('button');
                    tabDom.className = 'wa-tab';
                    tabDom.textContent = 'DOM 选取';
                    tabs.appendChild(tabTree);
                    tabs.appendChild(tabDom);

                    const body = document.createElement('div');
                    body.className = 'wa-body';

                    const tabContentTree = document.createElement('div');
                    tabContentTree.className = 'wa-tab-content';

                    const left = document.createElement('div');
                    left.className = 'wa-left';
                    const leftHeader = document.createElement('div');
                    leftHeader.className = 'wa-section-header';
                    const leftTitle = document.createElement('span');
                    leftTitle.textContent = '容器树';
                    const search = document.createElement('input');
                    search.className = 'wa-search';
                    search.placeholder = '搜索容器…';
                    leftHeader.appendChild(leftTitle);
                    leftHeader.appendChild(search);
                    const tree = document.createElement('div');
                    tree.className = 'wa-tree';
                    const rootNode = document.createElement('div');
                    rootNode.className = 'wa-tree-node wa-tree-node-root wa-tree-node-selected';
                    rootNode.textContent = '页面根容器 (#app-root)';
                    const nodeNav = document.createElement('div');
                    nodeNav.className = 'wa-tree-node wa-tree-node-child';
                    nodeNav.textContent = '顶部导航（nav）';
                    const nodeSide = document.createElement('div');
                    nodeSide.className = 'wa-tree-node wa-tree-node-child';
                    nodeSide.textContent = '侧边栏（sidebar）';
                    const nodeProduct = document.createElement('div');
                    nodeProduct.className = 'wa-tree-node wa-tree-node-child';
                    nodeProduct.textContent = '商品区域（product）';
                    const childrenWrap = document.createElement('div');
                    childrenWrap.className = 'wa-tree-children';
                    const child1 = document.createElement('div');
                    child1.className = 'wa-tree-node';
                    child1.textContent = '商品卡片（item-card）';
                    const child2 = document.createElement('div');
                    child2.className = 'wa-tree-node';
                    child2.textContent = '价格区域（price-area）';
                    childrenWrap.appendChild(child1);
                    childrenWrap.appendChild(child2);
                    nodeProduct.appendChild(childrenWrap);
                    tree.appendChild(rootNode);
                    tree.appendChild(nodeNav);
                    tree.appendChild(nodeSide);
                    tree.appendChild(nodeProduct);
                    left.appendChild(leftHeader);
                    left.appendChild(tree);

                    const right = document.createElement('div');
                    right.className = 'wa-right';

                    const sectionDetail = document.createElement('div');
                    sectionDetail.className = 'wa-section';
                    const st1 = document.createElement('div');
                    st1.className = 'wa-section-title';
                    st1.textContent = '容器详情';
                    sectionDetail.appendChild(st1);
                    const f1 = document.createElement('div');
                    f1.className = 'wa-field';
                    const f1l = document.createElement('label');
                    f1l.textContent = '标题';
                    const f1v = document.createElement('div');
                    f1v.className = 'wa-field-value';
                    f1v.textContent = '商品列表容器';
                    f1.appendChild(f1l);
                    f1.appendChild(f1v);
                    const f2 = document.createElement('div');
                    f2.className = 'wa-field';
                    const f2l = document.createElement('label');
                    f2l.textContent = 'Selector';
                    const f2v = document.createElement('div');
                    f2v.className = 'wa-field-value';
                    f2v.textContent = '.product-list';
                    f2.appendChild(f2l);
                    f2.appendChild(f2v);
                    const f3 = document.createElement('div');
                    f3.className = 'wa-field';
                    const f3l = document.createElement('label');
                    f3l.textContent = '容器 ID';
                    const f3v = document.createElement('div');
                    f3v.className = 'wa-field-value';
                    f3v.textContent = 'product_list';
                    f3.appendChild(f3l);
                    f3.appendChild(f3v);
                    sectionDetail.appendChild(f1);
                    sectionDetail.appendChild(f2);
                    sectionDetail.appendChild(f3);

                    const sectionOps = document.createElement('div');
                    sectionOps.className = 'wa-section';
                    const st2 = document.createElement('div');
                    st2.className = 'wa-section-title';
                    st2.innerHTML = '已注册 Operation <span class="wa-section-sub">（仅样式，占位拖拽排序区）</span>';
                    sectionOps.appendChild(st2);
                    const opList = document.createElement('ul');
                    opList.className = 'wa-op-list';
                    const op1 = document.createElement('li');
                    op1.className = 'wa-op-item';
                    op1.innerHTML = '<span class="wa-op-handle">⋮⋮</span><span class="wa-op-name">滚动加载商品</span><button class="wa-op-delete">删除</button>';
                    const op2 = document.createElement('li');
                    op2.className = 'wa-op-item';
                    op2.innerHTML = '<span class="wa-op-handle">⋮⋮</span><span class="wa-op-name">提取列表数据</span><button class="wa-op-delete">删除</button>';
                    opList.appendChild(op1);
                    opList.appendChild(op2);
                    sectionOps.appendChild(opList);
                    const btnLink = document.createElement('button');
                    btnLink.className = 'wa-btn-link';
                    btnLink.textContent = '＋ 添加 Operation';
                    sectionOps.appendChild(btnLink);

                    const sectionPalette = document.createElement('div');
                    sectionPalette.className = 'wa-section';
                    const st3 = document.createElement('div');
                    st3.className = 'wa-section-title';
                    st3.textContent = '可添加 Operation';
                    sectionPalette.appendChild(st3);
                    const pal = document.createElement('div');
                    pal.className = 'wa-op-palette';
                    ['批量选中商品','打开详情页','滚动到底部'].forEach(t => {
                      const chip = document.createElement('span');
                      chip.className = 'wa-op-chip';
                      chip.textContent = t;
                      pal.appendChild(chip);
                    });
                    sectionPalette.appendChild(pal);

                    const sectionChildren = document.createElement('div');
                    sectionChildren.className = 'wa-section';
                    const st4 = document.createElement('div');
                    st4.className = 'wa-section-title';
                    st4.textContent = '子容器';
                    sectionChildren.appendChild(st4);
                    const subList = document.createElement('ul');
                    subList.className = 'wa-subcontainer-list';
                    const li1 = document.createElement('li');
                    li1.textContent = 'item-card（商品卡片）';
                    const li2 = document.createElement('li');
                    li2.textContent = 'price-area（价格区域）';
                    subList.appendChild(li1);
                    subList.appendChild(li2);
                    const btnAddChild = document.createElement('button');
                    btnAddChild.className = 'wa-btn-primary';
                    btnAddChild.textContent = '＋ 添加子容器';
                    sectionChildren.appendChild(subList);
                    sectionChildren.appendChild(btnAddChild);

                    right.appendChild(sectionDetail);
                    right.appendChild(sectionOps);
                    right.appendChild(sectionPalette);
                    right.appendChild(sectionChildren);

                    tabContentTree.appendChild(left);
                    tabContentTree.appendChild(right);

      const tabContentDom = document.createElement('div');
      tabContentDom.className = 'wa-tab-content dom-mode';
      tabContentDom.style.display = 'none';
      tabContentDom.innerHTML = '<p>DOM 选取模式：</p><ol><li>按 F2 开启或关闭 DOM 选取模式。</li><li>鼠标移动到页面元素上会高亮该元素。</li><li>点击元素以选中，下面会显示对应 Selector。</li><li>ESC 退出 DOM 选取模式。</li></ol>';

      const domInfo = document.createElement('div');
      domInfo.className = 'wa-dom-info';
      domInfo.style.marginTop = '6px';
      domInfo.style.fontSize = '11px';
      domInfo.style.color = '#d1d5db';
      domInfo.textContent = '当前未选中任何元素（按 F2 开启 DOM 选取）';
      tabContentDom.appendChild(domInfo);

      // 监听页面级 DOM 选取结果事件，并在 UI 中展示
      try {
        window.addEventListener('__webauto_dom_picked', (ev) => {
          try {
            const detail = ev.detail || {};
            const sel = detail.selector || '(无)';
            const tag = detail.tagName || '';
            domInfo.textContent = '已选元素: ' + (tag ? tag + ' ' : '') + sel;
          } catch {}
        });
      } catch {}

                    body.appendChild(tabContentTree);
                    body.appendChild(tabContentDom);

                    const footer = document.createElement('div');
                    footer.className = 'wa-footer';
                    const fLeft = document.createElement('span');
                    fLeft.textContent = '状态：浏览模式（UI 雏形，无真实数据绑定）';
                    const fRight = document.createElement('span');
                    fRight.textContent = 'F2 切换 DOM 选取 · ESC 取消';
                    footer.appendChild(fLeft);
                    footer.appendChild(fRight);

                    panel.appendChild(header);
                    panel.appendChild(tabs);
                    panel.appendChild(body);
                    panel.appendChild(footer);

                    rootWrap.appendChild(pill);
                    rootWrap.appendChild(panel);

                    shadow.appendChild(rootWrap);
                    document.documentElement.appendChild(root);

                    window.__webautoOverlay = {
                      update(info){
                        try {
                          if (!info) return;
                          if (info.sessionId) {
                            const el = shadow.getElementById('__waOverlay_sid');
                            if (el) el.textContent = String(info.sessionId);
                          }
                          if (info.profileId) {
                            const el = shadow.getElementById('__waOverlay_pid');
                            if (el) el.textContent = String(info.profileId);
                          }
                        } catch {}
                      }
                    };

                    // 基础 UI 行为：打开/折叠面板，标签切换，树节点简单高亮
                    openBtn.addEventListener('click', () => {
                      panel.classList.toggle('hidden');
                    });
                    collapseBtn.addEventListener('click', () => {
                      panel.classList.add('hidden');
                    });
                    closeBtn.addEventListener('click', () => {
                      root.style.display = 'none';
                    });

                    tabTree.addEventListener('click', () => {
                      tabTree.classList.add('active');
                      tabDom.classList.remove('active');
                      tabContentTree.style.display = 'flex';
                      tabContentDom.style.display = 'none';
                    });
                    tabDom.addEventListener('click', () => {
                      tabDom.classList.add('active');
                      tabTree.classList.remove('active');
                      tabContentTree.style.display = 'none';
                      tabContentDom.style.display = 'block';
                    });

                    const allNodes = [rootNode, nodeNav, nodeSide, nodeProduct, child1, child2];
                    allNodes.forEach(node => {
                      node.addEventListener('click', () => {
                        allNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
                        node.classList.add('wa-tree-node-selected');
                      });
                    });
                  } catch {}
                }

                // 首次执行，确保当前文档已有 overlay
                ensureOverlay();

                // DOM 变动时自动“自愈”，防止站点用 JS 重写页面把 overlay 干掉
                try {
                  const target = document.documentElement || document.body || document;
                  const observer = new MutationObserver(() => {
                    try {
                      if (!document.getElementById(ROOT_ID)) {
                        ensureOverlay();
                      }
                    } catch {}
                  });
                  observer.observe(target, { childList: true, subtree: true });
                } catch {}

                // 兜底：每隔几秒检查一次，确保极端情况下 overlay 仍能恢复
                try {
                  if (!window.__webautoOverlayKeepAlive) {
                    window.__webautoOverlayKeepAlive = setInterval(() => {
                      try {
                        if (!document.getElementById(ROOT_ID)) {
                          ensureOverlay();
                        }
                      } catch {}
                    }, 4000);
                  }
                } catch {}
              } catch {}
            })();
            """

            script = script_template.replace("__SID__", sid).replace("__PID__", pid)

            # 1) 在 Context 级别注册 init script，确保“新页面 / 刷新”时都会尝试注入
            try:
                context.add_init_script(script)
            except Exception:
                # 有些 Camoufox/Playwright 版本在此处可能有限制，失败不阻断后续逻辑
                pass

            # 2) 为当前已存在的页面手动执行一次注入
            try:
                existing_pages = list(getattr(context, "pages", []) or [])
            except Exception:
                existing_pages = []

            def _ensure_overlay_on_page(page) -> None:
                """在单个 Page 上确保 overlay 存在，并在后续导航时自动恢复。"""
                try:
                    # 先在当前文档里跑一遍（如果已经有 ROOT_ID，会直接返回）
                    page.evaluate(script)
                except Exception:
                    # evaluate 失败不影响主流程
                    return

                # 监听页面内部的导航 / 刷新，在每次 frame 切换文档时重新尝试注入
                try:
                    def _on_nav(_frame):
                        try:
                            page.evaluate(script)
                        except Exception:
                            pass

                    page.on("framenavigated", _on_nav)  # type: ignore[attr-defined]
                except Exception:
                    # 事件监听失败也不阻断
                    pass

            for p in existing_pages:
                _ensure_overlay_on_page(p)

            # 3) 监听 Context 级别的新页面创建事件，保证后续通过 UI / 快捷键打开的标签页也带有 overlay
            try:
                def _on_new_page(page):
                    _ensure_overlay_on_page(page)

                context.on("page", _on_new_page)  # type: ignore[attr-defined]
            except Exception:
                # 监听失败不影响当前页面的 overlay 注入
                pass
        except Exception:
            # UI 注入失败不影响主流程
            pass
    
    def new_page(self) -> 'CamoufoxPageWrapper':
        """创建新页面"""
        context = self._get_context()
        # Camoufox 在启动时可能会打开一个默认页面（如 zh-cn 错误页）。
        # 这里始终创建一个新标签页，强制导航到 about:blank，并将其作为唯一可见页面。
        try:
            existing_pages = list(context.pages or [])
        except Exception:
            existing_pages = []

        page = context.new_page()
        try:
            page.goto('about:blank')
            # 确保空白页在前台显示，覆盖 Camoufox 启动时的默认错误标签页
            try:
                page.bring_to_front()
            except Exception:
                pass
        except Exception:
            pass

        # 清理其它启动页，只保留这个 about:blank
        if existing_pages:
            for p in existing_pages:
                if p is page:
                    continue
                try:
                    p.close()
                except Exception:
                    continue
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
            # 先停止自动保存线程
            self._auto_save_running = False
            if self._auto_save_thread and self._auto_save_thread.is_alive():
                try:
                    self._auto_save_thread.join(timeout=2.0)
                except Exception:
                    pass

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
        # 确保在页面级别也应用中文字体覆盖，防止站点后续样式覆盖 context 级别注入导致文字渲染为方框
        try:
            self._page.add_style_tag(content="""
                html, body, * {
                    font-family: "PingFang SC", "Microsoft YaHei", "SimHei",
                                 system-ui, -apple-system, BlinkMacSystemFont,
                                 sans-serif !important;
                    text-rendering: optimizeLegibility;
                    -webkit-font-smoothing: antialiased;
                }
            """)
        except Exception:
            pass
    
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
def open_profile_browser(profile_id: str = '1688-main-v1',
                         session_name: Optional[str] = None,
                         headless: bool = False):
    """
    高级封装：按 profile 启动固定指纹浏览器（默认行为）
    - 同一 profile 下互斥：启动前会尝试终止已有 Camoufox 实例
    - 自动会话：auto_session=True，使用 session_name 或 profile_id 作为会话名
    - 启动后：
      - 注入最小悬浮菜单（install_overlay）
      - 只创建一个空白标签页（about:blank），不自动导航任何网址
    """
    sid = session_name or profile_id
    config = {
        'headless': headless,
        'auto_session': True,
        'session_name': sid,
        'fingerprint_profile': 'fixed',
        'profile_id': profile_id,
        'kill_previous': True,
    }
    with create_browser(config) as browser:
        try:
            browser.install_overlay(session_id=sid, profile_id=profile_id)
        except Exception:
            # UI 注入失败不应阻断主流程
            pass
        # 打开一个空白页面，并确保它是唯一的可见标签页（清理 Camoufox 默认启动页）
        page = browser.new_page()
        try:
            ctx = browser._get_context()
            for p in list(ctx.pages or []):
                if p is not page:
                    try:
                        p.close()
                    except Exception:
                        continue
        except Exception:
            pass
        yield browser

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
    'open_profile_browser',
    'SecurityError',
    'CamoufoxBrowserWrapper',
    'CamoufoxPageWrapper',
    # Cookie 管理函数
    'save_cookies',
    'load_cookies',
    'save_session',
    'restore_session'
]
