#!/usr/bin/env python3
"""
测试容器匹配功能
使用新的ContainerDefV2格式测试微博容器匹配
"""

import sys
import os
import json

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper
from core.container.models_v2 import ContainerDefV2, SelectorByClass


def test_container_matching():
    """测试容器匹配功能"""
    print("🧪 测试容器匹配功能")
    print("=" * 50)

    # 加载新的容器定义
    with open('weibo_containers_v2.json', 'r', encoding='utf-8') as f:
        containers_data = json.load(f)

    print(f"📁 已加载 {len(containers_data)} 个容器定义")

    # 简单配置
    config = {
        'headless': True,
        'auto_overlay': False,
        'profile_id': 'test_containers',
        'cookie_monitoring_enabled': False
    }

    try:
        print("🌐 启动浏览器...")
        browser = ChromiumBrowserWrapper(config)

        print("📍 导航到微博登录页面...")
        page = browser.goto("https://weibo.com")

        # 获取页面
        playwright_page = page.page if hasattr(page, 'page') else page

        print("\n🔍 测试容器匹配...")

        # 测试每个容器
        matched_containers = []
        for container_name, container_data in containers_data.items():
            print(f"\n📦 测试容器: {container_name}")
            print(f"   📝 名称: {container_data.get('name', '')}")
            print(f"   🎯 类型: {container_data.get('type', '')}")

            # 测试每个选择器
            selectors = container_data.get('selectors', [])
            for selector_config in selectors:
                selector = selector_config.get('classes', [])
                if selector:
                    css_selector = '.' + '.'.join(selector)
                    try:
                        elements = playwright_page.query_selector_all(css_selector)
                        if elements:
                            count = len(elements)
                            score = selector_config.get('score', 0.0)
                            print(f"   ✅ 匹配成功: {css_selector} (数量: {count}, 得分: {score})")
                            matched_containers.append({
                                'name': container_name,
                                'selector': css_selector,
                                'count': count,
                                'score': score
                            })
                            break  # 找到第一个匹配的选择器就停止
                        else:
                            print(f"   ❌ 未匹配: {css_selector}")
                    except Exception as e:
                        print(f"   ⚠️ 测试失败: {css_selector} - {e}")

        # 找出最佳匹配的容器
        if matched_containers:
            best_match = max(matched_containers, key=lambda x: x['score'])
            print(f"\n🎯 最佳匹配容器:")
            print(f"   📦 名称: {best_match['name']}")
            print(f"   🎯 选择器: {best_match['selector']}")
            print(f"   📊 匹配数量: {best_match['count']}")
            print(f"   ⭐ 置信度: {best_match['score']}")

            # 高亮最佳匹配的容器
            try:
                elements = playwright_page.query_selector_all(best_match['selector'])
                if elements:
                    element = elements[0]
                    # 执行高亮
                    playwright_page.evaluate(f"""
                        (element) => {{
                            element.style.border = '3px solid #ff6b6b';
                            element.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                            element.style.transition = 'all 0.3s ease';
                            return element;
                        }}
                    """, element)
                    print(f"   🌟 已高亮显示最佳匹配容器")
            except Exception as e:
                print(f"   ⚠️ 高亮失败: {e}")
        else:
            print(f"\n❌ 没有找到匹配的容器")
            print(f"💡 可能的原因:")
            print(f"   - 页面结构已变化")
            print(f"   - 选择器需要更新")
            print(f"   - 页面还在加载中")

        print(f"\n📊 匹配统计:")
        print(f"   🎯 总容器数: {len(containers_data)}")
        print(f"   ✅ 匹配成功: {len(matched_containers)}")
        print(f"   📈 成功率: {len(matched_containers)/len(containers_data)*100:.1f}%")

        # 等待一段时间让用户看到效果
        print(f"\n⏳ 等待5秒让用户查看效果...")
        import time
        time.sleep(5)

        # 关闭浏览器
        browser.close()
        print(f"\n✅ 测试完成")

        return len(matched_containers) > 0

    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_container_matching()
    if success:
        print(f"\n🎉 容器匹配测试成功！")
        print(f"💡 建议下一步:")
        print(f"   1. 将新的容器定义集成到container-library.json")
        print(f"   2. 测试容器操作执行")
        print(f"   3. 验证自动化流程")
    else:
        print(f"\n❌ 容器匹配测试失败")
        print(f"💡 建议检查:")
        print(f"   1. 页面是否正常加载")
        print(f"   2. 选择器是否需要更新")
        print(f"   3. 容器定义格式是否正确")