#!/usr/bin/env python3
"""
Camoufox 浏览器启动器 (Camoufox-specific browser launcher)

⚠️ 注意：此文件为 Camoufox 专用启动器，被以下文件引用：
- runtime/browser/scripts/one-click-camoufox.mjs

如需修改或重构，请确保上述引用同步更新。
"""

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
