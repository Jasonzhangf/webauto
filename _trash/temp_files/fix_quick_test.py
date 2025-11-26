#!/usr/bin/env python3
"""
修复 quick_test 函数中的 URL 调用问题
"""

# 读取文件内容
with open('abstract_browser.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 修复 quick_test 函数中的 page.url() 调用
for i, line in enumerate(lines):
    if 'print(f\'页面URL: {page.url()}\')' in line:
        lines[i] = line.replace('page.url()', 'page.url')
        print(f"✅ 修复了第 {i+1} 行")

# 写回文件
with open('abstract_browser.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✅ 修复完成 - quick_test 函数现在使用属性访问 URL")