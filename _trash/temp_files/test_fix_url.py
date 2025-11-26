#!/usr/bin/env python3
"""
修复 URL 方法调用问题的脚本
"""

import re

# 读取文件内容
with open('abstract_browser.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复 url 方法调用
pattern = r'return self\._page\.url$'
replacement = 'return self._page.url()'

content = re.sub(pattern, replacement, content)

# 写回文件
with open('abstract_browser.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ 修复了 URL 方法调用问题")