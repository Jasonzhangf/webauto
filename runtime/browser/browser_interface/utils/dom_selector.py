"""
DOM Selector utilities - provides reliable element location and interaction.
"""

from __future__ import annotations
from typing import List, Dict, Any, Optional
from functools import lru_cache
import time
import threading


@lru_cache(maxsize=100)
def _compile_selector_pattern(selector: str) -> str:
    """Compile CSS selector pattern for better performance"""
    # Simple CSS selector optimization
    if not selector or not selector.strip():
        return selector

    # Remove unnecessary spaces and normalize
    selector = ' '.join([part.strip() for part in selector.split('>') if part.strip()])

    # Optimize common patterns
    optimizations = [
        ('#', '>'),  # ID selectors
        ('.', '>'),  # Class selectors
        ('[', ''),   # Attribute selectors
    ]

    for old, new in optimizations:
        selector = selector.replace(old, new)

    return selector


@lru_cache(maxsize=200)
def _is_valid_element(element) -> bool:
    """Check if element is valid for interaction"""
    if not element:
        return False

    # Element must be visible and enabled
    try:
        is_visible = element.is_visible()
        is_enabled = not element.is_disabled()
        return is_visible and is_enabled
    except:
        return False


class DOMSelector:
    """Enhanced DOM selector with caching and multiple strategies"""

    def __init__(self, page: Any):
        self.page = page
        self._element_cache = {}
        self._cache_timeout = 30.0  # 30 seconds cache timeout
        self._cache_lock = threading.Lock()

        print("🔍 DOM选择器初始化完成")

    def query_selector(self, selector: str, use_cache: bool = True, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
        """Query elements with multiple fallback strategies"""
        # Use cached pattern if available and enabled
        pattern = _compile_selector_pattern(selector) if use_cache else None

        try:
            # Try multiple strategies
            elements = []

            # Strategy 1: Standard querySelector
            try:
                standard_elements = self.page.query_selector_all(selector)
                elements.extend([self._element_to_dict(elem) for elem in standard_elements if _is_valid_element(elem)])
            except Exception as e:
                print(f"⚠️ 标准查询失败: {str(e)}")

            # Strategy 2: Text content search
            if not elements and len(selector) > 20:  # For long selectors, try text search
                text_content = self.page.text_content('body')
                if selector in text_content:
                    # Find all occurrences
                    import re
                    matches = re.finditer(selector, text_content)
                    for match in matches:
                        start, end = match.span()
                        # Extract surrounding text
                        context_start = max(0, start - 50)
                        context_end = end + 50
                        context = text_content[context_start:context_end]

                        # Extract element with basic info
                        element_info = {
                            'tag_name': match.groupdict().get('tag_name', ''),
                            'class_list': self._get_element_classes(match.group(0)),
                            'text': match.group(0),
                            'context': text_content[context_start:context_end]
                        }
                        elements.append(element_info)

            # Strategy 3: XPath fallback
            if not elements:  # For complex selectors, try XPath
                try:
                    xpath_elements = self.page.query_selector_all(f"xpath={selector}")
                    elements.extend([self._element_to_dict(elem) for elem in xpath_elements if _is_valid_element(elem)])
                except Exception as e:
                    print(f"⚠️ XPath查询失败: {str(e)}")

            # Cache results if using cache
            if use_cache and elements:
                key = f"selector:{selector}:elements:{len(elements)}"
                with self._cache_lock:
                    self._element_cache[key] = elements

            print(f"🔍 查询完成: {selector} -> {len(elements)} 个元素")
            return elements

        except Exception as e:
            print(f"❌ 查询失败: {str(e)}")
            return []

    def wait_for_selector(self, selector: str, timeout: Optional[float] = None) -> bool:
        """Wait for selector to appear with timeout"""
        timeout_seconds = timeout or 10.0
        start_time = time.time()

        while time.time() - start_time < timeout_seconds:
            try:
                if self.query_selector(selector, use_cache=False):
                    time.sleep(0.1)  # Brief pause between queries
                    elements = self.query_selector(selector, use_cache=True)
                    if elements:
                        return True

                time.sleep(0.5)  # Longer pause
            except Exception as e:
                print(f"❌ 等待失败: {str(e)}")
                return False

        print(f"⏱️ 等待超时: {selector}")
        return False

    def _element_to_dict(self, element) -> Dict[str, Any]:
        """Convert Playwright element to dictionary"""
        try:
            return {
                'tag_name': element.tag_name,
                'text_content': element.text_content(),
                'class_list': self._get_element_classes(element),
                'bounding_box': element.bounding_box(),
                'visible': element.is_visible(),
                'enabled': not element.is_disabled(),
                'inner_html': element.inner_html(),
                'attributes': {}
            }

            # Add attributes
            attributes = {}
            for attr in ['id', 'class', 'href', 'src']:
                try:
                    value = element.get_attribute(attr)
                    if value:
                        attributes[attr] = value
                except:
                    attributes[attr] = None

            result['attributes'] = attributes
            return result
        except Exception as e:
            print(f"⚠️ 元素转换失败: {str(e)}")
            return {}

    def _get_element_classes(self, element) -> List[str]:
        """Get element class list"""
        try:
            class_attr = element.get_attribute('class') or ''
            return [cls.strip() for cls in class_attr.split() if cls.strip()]
        except:
            return []

    def clear_cache(self) -> None:
        """Clear element cache"""
        with self._cache_lock:
            self._element_cache.clear()
        print("🧹 元素缓存已清理")


__all__ = ["DOMSelector"]