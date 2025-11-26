#!/usr/bin/env python3
"""简单的容器匹配测试"""

import json
import os
from urllib.parse import urlparse

def load_containers():
    """加载容器定义"""
    container_index_path = "container-library.index.json"

    if not os.path.exists(container_index_path):
        print("❌ 容器索引文件不存在")
        return {}

    with open(container_index_path, 'r', encoding='utf-8') as f:
        index = json.load(f)

    # 加载weibo容器
    weibo_info = index.get("weibo", {})
    if not weibo_info:
        print("❌ 未找到weibo站点配置")
        return {}

    weibo_path = weibo_info.get("path", "container-library/weibo")
    if not os.path.exists(weibo_path):
        print("❌ weibo容器目录不存在")
        return {}

    containers = {}
    for container_file in os.listdir(weibo_path):
        container_dir = os.path.join(weibo_path, container_file)
        if os.path.isdir(container_dir):
            container_json = os.path.join(container_dir, "container.json")
            if os.path.exists(container_json):
                try:
                    with open(container_json, 'r', encoding='utf-8') as f:
                        container_data = json.load(f)
                    containers[container_file] = container_data
                except Exception as e:
                    print(f"⚠️  加载容器失败: {container_file}, 错误: {e}")

    return containers

def test_page_patterns():
    """测试页面模式匹配"""
    import fnmatch

    test_urls = [
        "https://weibo.com",
        "https://weibo.com/newlogin",
        "https://passport.weibo.com/"
    ]

    containers = load_containers()

    print("🔍 测试页面模式匹配:")
    print(f"📦 加载到 {len(containers)} 个容器")

    for url in test_urls:
        print(f"\n📍 测试URL: {url}")
        parsed = urlparse(url)

        for container_name, container_data in containers.items():
            page_patterns = container_data.get("page_patterns", [])
            if page_patterns:
                # 检查排除模式
                excluded = False
                for pattern in page_patterns:
                    if pattern.startswith('!'):
                        exclude_pattern = pattern[1:]
                        if fnmatch.fnmatch(url, f"*{exclude_pattern}*") or fnmatch.fnmatch(parsed.path, exclude_pattern):
                            excluded = True
                            print(f"  ❌ {container_name}: 被 {pattern} 排除")
                            break

                if not excluded:
                    # 检查包含模式
                    matched = False
                    for pattern in page_patterns:
                        if not pattern.startswith('!'):
                            if fnmatch.fnmatch(url, f"*{pattern}*") or fnmatch.fnmatch(parsed.path, pattern):
                                matched = True
                                print(f"  ✅ {container_name}: 匹配 {pattern} (+0.1)")
                                break

                    if not matched:
                        print(f"  ⚪ {container_name}: 无匹配 (0.0)")
            else:
                print(f"  ⚪ {container_name}: 无页面模式 (0.0)")

def check_container_structure():
    """检查容器结构"""
    print("\n🏗️  容器结构检查:")

    containers = load_containers()

    for container_name, container_data in containers.items():
        print(f"\n📦 {container_name}:")
        print(f"  ID: {container_data.get('id', 'N/A')}")
        print(f"  名称: {container_data.get('name', 'N/A')}")
        print(f"  类型: {container_data.get('type', 'N/A')}")
        print(f"  页面模式: {container_data.get('page_patterns', 'N/A')}")

        selectors = container_data.get('selectors', [])
        print(f"  选择器 ({len(selectors)}):")
        for i, selector in enumerate(selectors):
            selector_text = ""
            if 'classes' in selector:
                selector_text = ".".join(selector['classes'])
            if selector.get('variant'):
                selector_text += f" ({selector['variant']})"
            if selector.get('score'):
                selector_text += f" [score: {selector['score']}]"
            print(f"    [{i+1}] {selector_text}")

if __name__ == "__main__":
    check_container_structure()
    test_page_patterns()