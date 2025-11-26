#!/usr/bin/env python3
"""测试容器匹配的脚本"""

import asyncio
import json
import sys
sys.path.append('.')

from services.container_registry import get_containers_for_url_v2

def test_container_matching():
    """测试微博主页的容器匹配"""
    print("🔍 测试微博主页容器匹配...")

    # 获取微博的容器
    containers = get_containers_for_url_v2("https://weibo.com")

    print(f"📦 找到 {len(containers)} 个容器:")
    for container_id, container in containers.items():
        print(f"  - {container_id}")
        print(f"    名称: {container.name}")
        print(f"    类型: {container.type}")
        print(f"    选择器: {container.selectors}")
        print(f"    页面模式: {container.page_patterns}")
        print(f"    能力: {container.capabilities}")
        print()

def test_page_patterns():
    """测试页面模式匹配"""
    print("🧪 测试页面模式匹配逻辑...")

    from server.container_handler import ContainerOperationHandler

    # 测试不同URL的页面匹配
    test_urls = [
        "https://weibo.com",
        "https://weibo.com/newlogin",
        "https://passport.weibo.com/"
    ]

    containers = get_containers_for_url_v2("https://weibo.com")

    for url in test_urls:
        print(f"\n📍 测试URL: {url}")

        from urllib.parse import urlparse
        parsed = urlparse(url)

        for container_id, container in containers.items():
            if container.page_patterns:
                page_path = parsed.path
                matches = ContainerOperationHandler._matches_page_patterns(container, url, page_path)
                status = "✅" if matches else "❌"
                print(f"  {status} {container_id} (页面模式: {container.page_patterns})")

if __name__ == "__main__":
    test_container_matching()
    test_page_patterns()
