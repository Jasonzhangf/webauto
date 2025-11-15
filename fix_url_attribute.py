#!/usr/bin/env python3
"""
修复 URL 方法调用问题 - 改为属性访问
"""

# 读取文件内容
with open('abstract_browser.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到并修复 url 方法调用
for i, line in enumerate(lines):
    if 'return self._page.url()' in line:
        lines[i] = line.replace('return self._page.url()', 'return self._page.url')
        print(f"✅ 修复了第 {i+1} 行")

# 写回文件
with open('abstract_browser.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✅ 修复完成 - URL 现在作为属性访问")