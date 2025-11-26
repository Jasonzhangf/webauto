#!/usr/bin/env python3
"""
调试微博容器匹配问题
检查当前微博页面的DOM结构，找出正确的选择器
"""

import sys
import os
import time

# Add browser_interface to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper


def debug_weibo_containers():
    """调试微博容器匹配问题"""
    print("🔍 调试微博容器匹配问题")
    print("=" * 50)

    # 简单配置，无头模式避免弹窗
    config = {
        'headless': True,  # 无头模式避免弹窗干扰
        'auto_overlay': False,
        'profile_id': 'debug_weibo',
        'cookie_monitoring_enabled': False
    }

    try:
        print("🌐 启动浏览器...")
        browser = ChromiumBrowserWrapper(config)

        print("📍 导航到微博...")
        page = browser.goto("https://weibo.com")

        print("⏳ 等待页面加载...")
        time.sleep(3)

        # 获取当前页面的DOM结构
        playwright_page = page.page if hasattr(page, 'page') else page

        print("\n🔍 检查可能的登录相关元素...")

        # 检查各种可能的登录元素
        login_selectors = [
            ".LoginCard_wrap_18dK4",  # 容器库中的选择器
            "[class*='LoginCard']",   # 包含LoginCard的类
            "[class*='login']",      # 包含login的类
            "[class*='auth']",       # 包含auth的类
            ".woo-box-flex",         # 新版微博可能的选择器
            ".woo-form-main",        # 表单容器
            "form",                  # 通用表单
            ".login_box",            # 登录框
            ".login-form",           # 登录表单
            "#login",                 # ID为login的元素
            "body",                  # 备用：body元素
        ]

        found_elements = []
        for selector in login_selectors:
            try:
                elements = playwright_page.query_selector_all(selector)
                if elements:
                    count = len(elements)
                    print(f"✅ 找到 {selector}: {count} 个元素")

                    # 获取第一个元素的详细信息
                    if elements:
                        element = elements[0]
                        try:
                            class_names = element.get_attribute('class') or ''
                            text_content = element.inner_text()[:50] if count == 1 else ''
                            print(f"   📝 类名: {class_names}")
                            if text_content:
                                print(f"   📄 内容: {text_content}...")

                            found_elements.append({
                                'selector': selector,
                                'count': count,
                                'class_names': class_names,
                                'has_text': bool(text_content)
                            })
                        except:
                            found_elements.append({
                                'selector': selector,
                                'count': count,
                                'class_names': 'N/A',
                                'has_text': False
                            })
                else:
                    print(f"❌ 未找到 {selector}")
            except Exception as e:
                print(f"⚠️ 检查 {selector} 时出错: {e}")

        # 检查页面标题和URL
        title = playwright_page.title()
        url = playwright_page.url
        print(f"\n📊 页面信息:")
        print(f"   🌐 URL: {url}")
        print(f"   📄 标题: {title}")

        # 检查是否已登录
        is_logged_in = 'login' not in url.lower() and 'passport' not in url.lower()
        print(f"   🔐 登录状态: {'已登录' if is_logged_in else '未登录'}")

        # 推荐新的选择器
        print(f"\n💡 推荐的容器选择器:")

        if found_elements:
            best_match = max(found_elements, key=lambda x: x['count'] * (2 if x['has_text'] else 1))
            print(f"   🎯 最佳匹配: {best_match['selector']} (数量: {best_match['count']})")

            # 为不同状态提供推荐
            if is_logged_in:
                print(f"   🔐 已登录状态: body, main, [class*='main'], [class*='content']")
                print(f"   📱 推荐选择器: body, main, .main, .content")
            else:
                print(f"   🔓 未登录状态: {best_match['selector']}, form, [class*='form']")
                print(f"   📱 推荐选择器: form, .woo-box-flex, .login-form, body")
        else:
            print(f"   🔄 备用方案: body, main, [class*='container']")

        print(f"\n📋 更新容器库建议:")
        print(f"   1. 将过时的选择器更新为当前有效的选择器")
        print(f"   2. 添加多个备选选择器以提高匹配成功率")
        print(f"   3. 区分已登录和未登录状态的不同选择器")

        # 关闭浏览器
        browser.close()
        print("\n✅ 调试完成")

        return found_elements

    except Exception as e:
        print(f"❌ 调试失败: {e}")
        import traceback
        traceback.print_exc()
        return []


if __name__ == "__main__":
    debug_weibo_containers()