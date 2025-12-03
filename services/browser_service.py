"""
Legacy BrowserService stub.

历史上的 Python BrowserService/Flask API 已下线，浏览器会话统一由
TypeScript 版本的 BrowserService 提供（见 runtime/browser/scripts/one-click-browser.mjs
或 npm run browser:oneclick）。此模块保留占位符，避免旧代码导入时报错。
"""

from __future__ import annotations

from typing import Any, Callable

LEGACY_MESSAGE = (
    "Python BrowserService 已废弃。请使用 TypeScript BrowserService：\n"
    "  $ npm run browser:oneclick [-- --profile default --url https://weibo.com]\n"
    "或直接运行 node runtime/browser/scripts/one-click-browser.mjs。\n"
)


class BrowserServiceError(RuntimeError):
    """Raised when legacy BrowserService entrypoints are used."""


class BrowserService:
    """Stub that guides callers to the new TypeScript BrowserService."""

    def __init__(self, *_: Any, **__: Any) -> None:
        self._message = LEGACY_MESSAGE

    def __getattr__(self, _name: str) -> Callable[..., Any]:
        def _fail(*_args: Any, **_kwargs: Any) -> Any:
            raise BrowserServiceError(self._message)

        return _fail


# Backwards compatible symbol so `from services.browser_service import browser_service`
# keeps working, but calling任何方法都会抛出可读的异常。
browser_service = BrowserService()

__all__ = ["BrowserService", "BrowserServiceError", "browser_service"]
