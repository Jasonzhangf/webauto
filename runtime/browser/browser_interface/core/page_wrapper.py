"""
Page Wrapper implementation - provides unified page operations.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import time

from .interfaces import IPageWrapper


class PageWrapper(IPageWrapper):
    """Unified page wrapper that hides browser implementation details."""

    def __init__(self, page: Any, config: Dict[str, Any]):
        self.page = page
        self.config = config
        self.default_timeout = config.get('timeout', 30.0)

    def navigate(self, url: str) -> bool:
        """Navigate to URL with timeout"""
        try:
            print(f"🌐 导航到: {url}")
            # Playwright expects timeout in milliseconds
            timeout_ms = int(self.default_timeout * 1000)
            self.page.goto(url, timeout=timeout_ms)

            # Wait for navigation to complete
            time.sleep(1)
            current_url = self.page.url
            if current_url and url in current_url:
                print(f"✅ 导航成功: {url}")
                return True
            else:
                print(f"⚠️ 导航完成但URL不匹配: 期望 {url}, 实际 {current_url}")
                return True  # Still return True as navigation completed
        except Exception as e:
            print(f"❌ 导航异常: {str(e)}")
            return False

    def screenshot(self, path: str) -> bool:
        """Take page screenshot"""
        try:
            print(f"📸 截图保存到: {path}")
            self.page.screenshot(path=path)
            print(f"✅ 截图成功: {path}")
            return True
        except Exception as e:
            print(f"❌ 截图失败: {str(e)}")
            return False

    def execute_script(self, script: str) -> Any:
        """Execute JavaScript on page"""
        try:
            print(f"🔧 执行脚本: {script[:50]}...")
            result = self.page.evaluate(script)
            print(f"✅ 脚本执行结果: {result}")
            return result
        except Exception as e:
            print(f"❌ 脚本执行失败: {str(e)}")
            return None

    def query_selector(self, selector: str) -> List[Any]:
        """Query page elements"""
        try:
            print(f"🔍 查询元素: {selector}")
            elements = self.page.query_selector_all(selector)

            element_list = []
            for elem in elements[:10]:  # Limit to 10 elements
                try:
                    text = elem.text_content()
                    visible = elem.is_visible()
                    element_list.append({
                        'tag': elem.tag_name,
                        'text': text[:100],
                        'visible': visible
                    })
                except Exception:
                    element_list.append({'tag': 'error', 'text': 'Query failed', 'visible': False})

            print(f"✅ 找到 {len(elements)} 个元素，显示前10个")
            return element_list
        except Exception as e:
            print(f"❌ 查询失败: {str(e)}")
            return []

    def click_element(self, selector: str) -> bool:
        """Click page element"""
        try:
            print(f"🖱️ 点击元素: {selector}")
            elem = self.page.query_selector(selector)
            if elem and elem.is_visible():
                elem.click()
                time.sleep(0.5)  # Wait for click to register
                print(f"✅ 元素点击成功: {selector}")
                return True
            else:
                print(f"❌ 元素不存在或不可见: {selector}")
                return False
        except Exception as e:
            print(f"❌ 点击失败: {str(e)}")
            return False

    def fill_input(self, selector: str, value: str) -> bool:
        """Fill input field"""
        try:
            print(f"⌨️ 填充输入框: {selector} = {value}")
            elem = self.page.query_selector(selector)
            if elem and elem.is_visible():
                elem.fill(value=value)
                time.sleep(0.5)
                print(f"✅ 输入框填充成功: {selector}")
                return True
            else:
                print(f"❌ 输入框不存在或不可见: {selector}")
                return False
        except Exception as e:
            print(f"❌ 填充失败: {str(e)}")
            return False

    def wait_for_selector(self, selector: str, timeout: Optional[float] = None) -> bool:
        """Wait for selector to appear"""
        try:
            timeout_ms = timeout * 1000 if timeout else self.default_timeout * 1000
            print(f"⏱️ 等待元素出现: {selector} (timeout: {timeout}s)")

            start_time = time.time()
            while time.time() - start_time < timeout_ms:
                if self.page.query_selector(selector):
                    print(f"✅ 元素已出现: {selector}")
                    return True
                time.sleep(0.5)

            print(f"❌ 等待超时: {selector}")
            return False
        except Exception as e:
            print(f"❌ 等待失败: {str(e)}")
            return False

    def get_page_info(self) -> Dict[str, Any]:
        """Get current page information"""
        try:
            title = self.page.title()
            url = self.page.url()

            info = {
                'title': title,
                'url': url,
                'timestamp': time.time()
            }

            print(f"📄 页面信息: {title} @ {url}")
            return info
        except Exception as e:
            print(f"❌ 获取页面信息失败: {str(e)}")
            return {}


__all__ = ["PageWrapper"]