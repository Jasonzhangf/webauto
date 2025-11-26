#!/usr/bin/env python3
"""
调试容器加载问题
"""

import sys
import os

# 添加路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'services'))

from container_registry import get_containers_for_url_v2, load_containers_for_site_v2

def debug_container_loading():
    """调试容器加载"""
    url = "https://weibo.com"

    print(f"🔍 调试容器加载 - URL: {url}")
    print("=" * 50)

    # 1. 直接调用 get_containers_for_url_v2
    print("\n1️⃣ 测试 get_containers_for_url_v2:")

    # 调试：逐步调用
    from container_registry import _load_registry, _find_site_key_for_url
    registry = _load_registry()
    site_key = _find_site_key_for_url(url, registry)
    print(f"   找到的站点key: {site_key}")

    if site_key:
        from container_registry import load_containers_for_site_v2
        site_containers = load_containers_for_site_v2(site_key)
        print(f"   load_containers_for_site_v2返回: {len(site_containers)}个容器")
    else:
        print(f"   没有找到匹配的站点key")
        print(f"   可用的站点keys: {list(registry.keys())}")

    containers = get_containers_for_url_v2(url)
    print(f"   最终找到容器数量: {len(containers)}")
    for cid, container in containers.items():
        print(f"   - {cid}: {container.name}")

    # 2. 直接调用 load_containers_for_site_v2
    print("\n2️⃣ 测试 load_containers_for_site_v2:")
    try:
        site_containers = load_containers_for_site_v2("weibo")
        print(f"   找到容器数量: {len(site_containers)}")
        for cid, container in site_containers.items():
            print(f"   - {cid}: {container.name}")
            if hasattr(container, 'selectors'):
                print(f"     选择器数量: {len(container.selectors)}")
                for sel in container.selectors:
                    print(f"     - {sel}")
    except Exception as e:
        print(f"   ❌ 加载失败: {e}")
        import traceback
        traceback.print_exc()

    # 3. 检查ContainerDefV2转换
    print("\n3️⃣ 测试ContainerDefV2转换:")
    try:
        import json
        from core.container.models_v2 import ContainerDefV2

        with open('container-library.json', 'r', encoding='utf-8') as f:
            registry = json.load(f)

        if 'weibo' in registry:
            weibo_data = registry['weibo']
            containers_data = weibo_data.get('containers', {})

            # 测试v2格式容器
            v2_containers = {}
            for cid, container_data in containers_data.items():
                if 'selectors' in container_data and isinstance(container_data['selectors'], list):
                    print(f"   测试转换: {cid}")
                    try:
                        container = ContainerDefV2.from_dict(container_data)
                        v2_containers[cid] = container
                        print(f"   ✅ 转换成功: {container.name}")
                    except Exception as e:
                        print(f"   ❌ 转换失败: {e}")
                        import traceback
                        traceback.print_exc()

            print(f"   成功转换的v2容器数量: {len(v2_containers)}")

        else:
            print("   ❌ weibo站点不存在")

    except Exception as e:
        print(f"   ❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()

    # 4. 检查container-library.json文件
    print("\n4️⃣ 检查container-library.json文件:")
    try:
        import json
        with open('container-library.json', 'r', encoding='utf-8') as f:
            registry = json.load(f)

        if 'weibo' in registry:
            weibo_data = registry['weibo']
            print(f"   weibo站点存在: ✅")
            print(f"   website: {weibo_data.get('website')}")
            containers_data = weibo_data.get('containers', {})
            print(f"   容器数量: {len(containers_data)}")

            for cid, container_data in containers_data.items():
                print(f"   - {cid}:")
                if 'selectors' in container_data:
                    print(f"     ✅ 有selectors字段 (v2格式)")
                    selectors = container_data['selectors']
                    print(f"     选择器数量: {len(selectors)}")
                else:
                    print(f"     ❌ 无selectors字段 (旧格式)")
                    print(f"     selector: {container_data.get('selector', 'N/A')}")
        else:
            print("   ❌ weibo站点不存在")

    except Exception as e:
        print(f"   ❌ 读取失败: {e}")

if __name__ == "__main__":
    debug_container_loading()