#!/usr/bin/env python3
"""
Minimal Camoufox-based detail page probe for Xiaohongshu.

用途：
  - 使用 Camoufox + 新指纹 打开单个带 xsec_token 的详情链接
  - 检查页面是否命中详情锚点 / 评论锚点 / 风控锚点
  - 通过 stdout 输出一行 JSON，便于上层 Node 脚本解析

注意：
  - 不依赖现有 Unified API / BrowserService，纯 Camoufox 直连
  - 由 SearchGate 速率控制在 Node 侧完成，本脚本只关心单次访问
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict

# 确保 runtime/browser 在 sys.path 中（防御性处理，避免依赖 Python 自动加载 sitecustomize）
ROOT_DIR = Path(__file__).resolve().parents[3]
BROWSER_DIR = ROOT_DIR / "runtime" / "browser"
if str(BROWSER_DIR) not in sys.path:
    sys.path.insert(0, str(BROWSER_DIR))

# 同时尝试加载 sitecustomize，将 runtime/* 相关目录注入 sys.path
try:  # pragma: no cover - 导入失败时交由后续导入报错
    import sitecustomize  # type: ignore[import]
except Exception:
    pass


def _load_camoufox_browser():
    """
    仅按需加载 CamoufoxBrowserWrapper，避免触发 browser_interface 包的完整导入
    （其依赖 Chromium / container_registry 等我们此处不需要的模块）。
    """
    here = Path(__file__).resolve()
    package_root = here.parent.parent / "browser_interface"
    module_path = package_root / "camoufox_browser.py"

    if not module_path.exists():
        raise ImportError(f"camoufox_browser.py not found at {module_path}")

    # 构造一个轻量级的 browser_interface 包，让 camoufox_browser 内部的相对导入 (.errors 等)
    # 能够正常工作，同时避免执行真实的 browser_interface/__init__.py。
    if "browser_interface" not in sys.modules:
        import types

        pkg = types.ModuleType("browser_interface")
        pkg.__path__ = [str(package_root)]  # type: ignore[attr-defined]
        sys.modules["browser_interface"] = pkg

    spec = importlib.util.spec_from_file_location(
        "browser_interface.camoufox_browser", str(module_path)
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot create spec for {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # type: ignore[index]
    spec.loader.exec_module(module)  # type: ignore[assignment]
    return module


try:
    _camoufox_mod = _load_camoufox_browser()
    CamoufoxBrowserWrapper = _camoufox_mod.CamoufoxBrowserWrapper  # type: ignore[attr-defined]
except Exception as exc:  # pragma: no cover - 环境错误直接向上抛出
    result = {
        "ok": False,
        "error": f"import CamoufoxBrowserWrapper failed: {exc}",
    }
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.exit(1)


def build_full_url(raw_url: str) -> str:
    raw_url = raw_url.strip()
    if raw_url.startswith("http://") or raw_url.startswith("https://"):
        return raw_url
    # 允许 /explore/... 或 /search_result/... 相对路径
    if raw_url.startswith("/"):
        return "https://www.xiaohongshu.com" + raw_url
    # 兜底：直接拼接
    return "https://www.xiaohongshu.com/" + raw_url


DETAIL_SELECTOR = (
    ".note-detail-mask, .note-detail-page, .note-detail-dialog, "
    ".note-detail, .detail-container, .media-container"
)
COMMENTS_SELECTOR = (
    ".comments-el, .comment-list, .comments-container, [class*=\"comment-section\"]"
)
RISK_SELECTOR = ".qrcode-box, .qrcode-img, .tip-text"


def build_probe_script() -> str:
    # 与 Node 侧 visit-safe-detail-urls.mjs 中的 DOM 逻辑保持一致
    return f"""
    (() => {{
      try {{
        const detailSelector = '{DETAIL_SELECTOR}';
        const commentsSelector = '{COMMENTS_SELECTOR}';
        const riskSelector = '{RISK_SELECTOR}';

        const detailEl = document.querySelector(detailSelector);
        const commentsEl = document.querySelector(commentsSelector);
        const riskEl = document.querySelector(riskSelector);

        const text = (document.body && document.body.textContent) ? document.body.textContent.toLowerCase() : '';

        const hasRiskKeywords =
          text.includes('风控') ||
          text.includes('验证码') ||
          text.includes('扫码') ||
          text.includes('qrcode') ||
          text.includes('error_code');

        return {{
          hasDetailAnchor: !!detailEl,
          hasCommentsAnchor: !!commentsEl,
          isRiskControl: !!riskEl || hasRiskKeywords
        }};
      }} catch (e) {{
        return {{
          hasDetailAnchor: false,
          hasCommentsAnchor: false,
          isRiskControl: false,
          error: String(e && e.message || e)
        }};
      }}
    }})();
    """


def probe_detail(url: str, note_id: str | None = None, headless: bool = True) -> Dict[str, Any]:
    full_url = build_full_url(url)

    # 为了“每次访问一个新指纹”，这里通过动态 profile_id 派生 Camoufox 启动配置
    ts = int(time.time())
    suffix = note_id or "xhs"
    profile_id = f"xhs_camoufox_{suffix}_{ts}"

    config: Dict[str, Any] = {
        "headless": bool(headless),
        "auto_session": False,       # 每次调用独立上下文，不复用 Cookie
        "session_name": profile_id,
        "fingerprint_profile": "fixed",
        "profile_id": profile_id,
        "kill_previous": True,       # 避免复用旧 Camoufox 实例
    }

    browser = None
    page = None

    try:
        browser = CamoufoxBrowserWrapper(config)  # type: ignore[call-arg]
        # CamoufoxBrowserWrapper.goto 会内部创建新页面并注入中文字体修复样式
        page = browser.goto(full_url)

        # 简单等待一小段时间，让页面和脚本加载完成
        time.sleep(3.0)
        # 调试/人工检查场景：有头模式下多停留一会儿，便于肉眼观察页面
        if not headless:
            time.sleep(25.0)

        info = page.evaluate(build_probe_script())
        if not isinstance(info, dict):
            info = {"unexpected": info}

        return {
            "ok": True,
            "url": full_url,
            "noteId": note_id,
            "anchors": {
                "hasDetailAnchor": bool(info.get("hasDetailAnchor")),
                "hasCommentsAnchor": bool(info.get("hasCommentsAnchor")),
                "isRiskControl": bool(info.get("isRiskControl")),
            },
            "raw": info,
        }
    except Exception as exc:
        return {
            "ok": False,
            "url": full_url,
            "noteId": note_id,
            "error": str(exc),
        }
    finally:
        try:
            if page is not None:
                page.close()
        except Exception:
            pass
        try:
            if browser is not None and hasattr(browser, "close"):
                browser.close()  # type: ignore[attr-defined]
        except Exception:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe Xiaohongshu detail page via Camoufox.")
    parser.add_argument("--url", required=True, help="safeDetailUrl (relative or absolute)")
    parser.add_argument("--note-id", help="noteId for logging / fingerprint seed", default=None)
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Camoufox in headless mode (default: False)",
    )
    args = parser.parse_args()

    result = probe_detail(args.url, args.note_id or None, headless=bool(args.headless))
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
