# WebAuto 浏览器模块 - 快速开始指南

## 🚀 5分钟快速上手

### 第一步：导入模块

```python
from browser_interface import create_browser, quick_test, stealth_mode
```

### 第二步：选择使用方式

#### 🎯 最简单方式
```python
# 一行代码测试
quick_test()
```

#### 🖥️ 基础浏览器
```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'页面标题: {page.title()}')
```

#### 🔒 隐匿模式
```python
with stealth_mode() as browser:
    page = browser.goto('https://example.com')
    print(f'隐匿访问: {page.title()}')
```

## 📋 常见使用场景

### 场景1：快速测试网站
```python
from browser_interface import quick_test

# 测试百度
quick_test()

# 测试微博
quick_test(url='https://weibo.com', wait_time=3)
```

### 场景2：百度搜索自动化
```python
from browser_interface import create_browser

def baidu_search(keyword):
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        page.fill('#kw', keyword)
        page.click('#su')
        
        import time
        time.sleep(2)
        
        return page.title()

# 使用
result = baidu_search('Python 自动化')
print(f'搜索结果: {result}')
```

### 场景3：网站信息采集
```python
from browser_interface import create_browser

def get_website_info(url):
    with create_browser() as browser:
        page = browser.goto(url)
        
        return {
            'title': page.title(),
            'url': page.url(),
            'timestamp': time.time()
        }

# 采集多个网站
sites = ['https://www.baidu.com', 'https://weibo.com']
for site in sites:
    info = get_website_info(site)
    print(f"{site}: {info['title']}")
```

### 场景4：自动化截图
```python
from browser_interface import create_browser

def screenshot_websites(urls):
    with create_browser() as browser:
        for url in urls:
            page = browser.goto(url)
            filename = f'screenshot_{url.replace("https://", "").replace("/", "_")}.png'
            page.screenshot(filename)
            print(f'截图保存: {filename}')

# 使用
screenshot_websites(['https://www.baidu.com', 'https://weibo.com'])
```

## 🔧 进阶配置

### 自定义浏览器配置
```python
from browser_interface import create_browser

# 自定义配置
config = {
    'headless': False,
    'locale': 'zh-CN',
    'args': [
        '--lang=zh-CN',
        '--window-size=1920,1080',
        '--disable-gpu'
    ]
}

with create_browser(config=config) as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'自定义配置访问: {page.title()}')
```

### 无头模式（后台运行）
```python
from browser_interface import headless_mode

# 无头模式 - 适合自动化任务
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'后台访问: {page.title()}')
```

## 🛠️ 常用操作

### 页面导航
```python
with create_browser() as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(f'当前URL: {page.url()}')
```

### 元素操作
```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    
    # 填写输入框
    page.fill('#kw', '搜索内容')
    
    # 点击按钮
    page.click('#su')
    
    # 获取元素文本
    text = page.text_content('#s-top-left a')
    print(f'元素文本: {text}')
```

### 截图功能
```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    
    # 页面截图
    page.screenshot('baidu_page.png')
    
    # 全页面截图
    page.screenshot('baidu_full.png', full_page=True)
```

## 🚨 重要注意事项

### ✅ 允许的操作
```python
from browser_interface import create_browser, quick_test, stealth_mode
# ✅ 这些都是安全的
```

### ❌ 禁止的操作
```python
from playwright.sync_api import sync_playwright     # ❌ 禁止
from camoufox import NewBrowser                    # ❌ 禁止
from selenium import webdriver                     # ❌ 禁止
from libs.browser import CamoufoxBrowser           # ❌ 禁止
```

## 🔍 故障排除

### 问题1：导入错误
```python
# 错误
from browser_interface import create_browser
# ModuleNotFoundError

# 解决
# 确保 browser_interface.py 在项目根目录
```

### 问题2：浏览器启动失败
```python
# 错误
# 浏览器无法启动

# 解决1：使用无头模式
with headless_mode() as browser:
    # 后台运行

# 解决2：检查安装
# pip install camoufox playwright
```

### 问题3：元素未找到
```python
# 解决：添加等待
import time
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    time.sleep(2)  # 等待页面加载
    page.fill('#kw', '内容')
```

## 🎯 学习路径

### 初级（1-2天）
1. 掌握基础导入和使用
2. 学会 quick_test() 方法
3. 理解上下文管理器

### 中级（3-5天）
1. 学习页面操作方法
2. 掌握元素查找和操作
3. 学会截图和基本自动化

### 高级（1-2周）
1. 深入理解抽象接口架构
2. 学习高级用法和最佳实践
3. 掌握复杂项目开发

## 📚 更多资源

- 📖 `HOW_TO_USE_BROWSER_MODULE.md` - 详细使用指南
- 🏗️ `ABSTRACT_BROWSER_ARCHITECTURE.md` - 架构文档
- 💻 `browser_usage_examples.py` - 使用示例
- 🚀 `mini_project_example.py` -usage_examples.py` - 高级用法

## 🎉 开始你的第一个项目

```python
# 复制这段代码开始你的第一个自动化项目
from browser_interface import create_browser

def my_first_automation():
    print("🚀 开始第一个自动化项目...")
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 搜索 "WebAuto"
        page.fill('#kw', 'WebAuto')
        page.click('#su')
        
        import time
        time.sleep(2)
        
        print(f"✅ 完成！搜索结果: {page.title()}")
        
        # 截图留念
        page.screenshot('my_first_automation.png')
        print("📸 截图已保存")

if __name__ == '__main__':
    my_first_automation了 WebAuto 浏览器模块的基础用法！**

现在可以开始你的浏览器自动化之旅了！
