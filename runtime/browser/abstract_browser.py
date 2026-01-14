"""
Minimal abstract browser / page base classes used by browser_interface.

说明：
- 仓库内的 CamoufoxBrowserWrapper / ChromiumBrowserWrapper 仅依赖这些类的
  基本接口与上下文管理协议，不需要完整实现。
- 这里提供一个轻量级实现，避免在本地开发环境中因为缺少第三方 abstract_browser
  包而无法导入 browser_interface。
"""

from __future__ import annotations

from typing import Any, Protocol


class AbstractPage(Protocol):
    """Minimal page interface expected by wrappers."""

    def goto(self, url: str) -> None: ...

    def evaluate(self, script: str) -> Any: ...

    def close(self) -> None: ...  # pragma: no cover - 由具体实现提供


class AbstractBrowser:
    """Minimal browser base with context-manager support."""

    def __enter__(self) -> "AbstractBrowser":  # pragma: no cover - 直接由子类复用
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover
        try:
            close = getattr(self, "close", None)
            if callable(close):
                close()
        except Exception:
            # 关闭失败不影响退出
            pass

    # 具体实现需要提供 new_page / goto / close 等方法
    def new_page(self) -> AbstractPage:  # pragma: no cover
        raise NotImplementedError

    def goto(self, url: str) -> AbstractPage:  # pragma: no cover
        raise NotImplementedError

    def close(self) -> None:  # pragma: no cover
        pass


__all__ = ["AbstractBrowser", "AbstractPage"]

