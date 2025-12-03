#!/usr/bin/env python3
"""
Legacy launcher stub.

Browser sessions are now managed exclusively by the TypeScript BrowserService.
"""

from __future__ import annotations

import sys
from textwrap import dedent

MESSAGE = dedent(
    """
    🧭 WebAuto Browser Launcher (legacy)
    -----------------------------------
    Python 版 BrowserService 已下线，请改用 TypeScript 实现：

        npm run browser:oneclick -- --profile default --url https://weibo.com
        # 或
        node runtime/browser/scripts/one-click-browser.mjs

    该脚本保留仅用于兼容旧调用，不再实际启动浏览器。
    """
).strip()


def main() -> int:
    print(MESSAGE)
    return 1


if __name__ == "__main__":
    sys.exit(main())
