#!/usr/bin/env python3
"""
调试 URL 方法调用问题的脚本
"""

from abstract_browser import create_browser

# 创建浏览器实例进行调试
try:
    with create_browser(headless=True) as browser:
        page = browser.goto('https://www.baidu.com')
        
        print(f"页面标题: {page.title()}")
        
        # 检查 page 对象类型
        print(f"Page 对象类型: {type(page)}")
        print(f"Page 对象方法: {[method for method in dir(page) if not method.startswith('_')]}")
        
        # 检查 url 属性
        print(f"是否有 url 属性: {hasattr(page, 'url')}")
        print(f"url 属性类型: {type(page.url)}")
        
        # 尝试不同的访问方式
        try:
            print(f"page.url(): {page.url()}")
        except Exception as e:
            print(f"page.url() 调用失败: {e}")
            
        try:
            print(f"page.url: {page.url}")
        except Exception as e:
            print(f"page.url 访问失败: {e}")
            
except Exception as e:
    print(f"调试失败: {e}")
    import traceback
    traceback.print_exc()