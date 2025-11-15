# 如何使用 WebAuto 抽象浏览器模块

## 🚀 快速开始

### 1. 最简单的使用方式

```python
from browser_interface import create_browser

# 创建浏览器
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'页面标题: {page.title()}')
```

### 2. 一行代码测试

```python
from browser_interface import quick_test

# 快速测试 - 自动打开浏览器并访问百度
quick_test()

# 自定义测试
quick_test(url='https://weibo.com', wait_time=5)
```

## 📋 完整使用指南

### 基础操作

#### 1. 创建浏览器

```python
from browser_interface import create_browser

# 默认配置 (中文支持 + 有界面)
browser = create_browser()

# 无头模式 (后台运行)
browser = create_browser(headless=True)

# 自定义配置
config = {
    'headless': False,
    'locale': 'zh-CN',
    'args': ['--lang=zh-CN', '--window-size=1920,1080']
}
browser = create_browser(config=config)
```

#### 2. 页面操作

```python
from browser_interface import create_browser

with create_browser() as browser:
    # 创建页面
    page = browser.new_page()
    
    # 导航到URL
    page.goto('https://www.baidu.com')
    
    # 获取页面信息
    title = page.title()
    url = page.url()
    
    print(f'标题: {title}')
    print(f'URL: {url}')
```

#### 3. 元素操作

```python
from browser_interface import create_browser

with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    
    # 点击元素
    page.click('#su')  # 百度搜索按钮
    
    # 填写输入框
    page.fill('#kw', 'Python 爬虫')
    
    # 获取元素文本
    text = page.text_content('#s-top-left a')
    print(f'元素文本: {text}')
    
    # 截图
    page.screenshot('baidu.png', full_page=True)
```

## 🎯 预设模式

### 1. 隐匿模式 (最强反检测)

```python
from browser_interface import stealth_mode

# 隐匿模式 - 11个反检测参数
with stealth_mode(headless=False) as browser:
    page = browser.goto('https://bot.sannysoft.com/')
    print(f'反检测测试: {page.title()}')
```

### 2. 无头模式 (后台运行)

```python
from browser_interface import headless_mode

# 无头模式 - 适合自动化任务
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'后台访问标题: {page.title()}')
```

### 3. 快速测试模式

```python
from browser_interface import quick_test

# 快速测试多个网站
sites = [
    'https://www.baidu.com',
    'https://weibo.com', 
    'https://www.zhihu.com'
]

for site in sites:
    quick_test(url=site, wait_time=2)
```

## 🔧 高级用法

### 1. 多页面操作

```python
from browser_interface import create_browser

with create_browser() as browser:
    # 第一个页面 - 百度
    page1 = browser.goto('https://www.baidu.com')
    page1.fill('#kw', 'Python')
    
    # 第二个页面 - 微博
    page2 = browser.goto('https://weibo.com')
    print(f'微博标题: {page2.title()}')
    
    # 切换回第一个页面
    page1.click('#su')
```

### 2. 自定义配置

```python
from browser_interface import create_browser

# 自定义配置
config = {
    'headless': False,
    'locale': 'zh-CN',
    'args': [
        '--lang=zh-CN',
        '--window-size=1920,1080',
        '--disable-gpu',
        '--no-sandbox'
    ]
}

with create_browser(config=config) as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'自定义配置访问: {page.title()}')
```

### 3. 错误处理

```python
from browser_interface import create_browser, SecurityError

try:
    with create_browser() as browser:
        page = browser.goto('https://example.com')
        print(f'访问成功: {page.title()}')
        
except SecurityError as e:
    print(f'安全检查失败: {e}')
except Exception as e:
    print(f'操作失败: {e}')
```

## 📚 实用示例

### 1. 百度搜索自动化

```python
from browser_interface import create_browser

def baidu_search(keyword):
    """百度搜索函数"""
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 填写搜索框
        page.fill('#kw', keyword)
        
        # 点击搜索
        page.click('#su')
        
        # 等待结果
        import time
        time.sleep(2)
        
        # 获取结果
        title = page.title()
        print(f'搜索结果页面: {title}')
        
        return page

# 使用
baidu_search('WebAuto 浏览器模块')
```

### 2. 网站信息抓取

```python
from browser_interface import create_browser

def scrape_website_info(url):
    """抓取网站基本信息"""
    with create_browser() as browser:
        page = browser.goto(url)
        
        info = {
            'title': page.title(),
            'url': page.url(),
            'screenshot': f'{url.replace("https://", "")}.png'
        }
        
        # 截图
        page.screenshot(info['screenshot'])
        
        return info

# 使用
info = scrape_website_info('https://www.baidu.com')
print(f'网站信息: {info}')
```

### 3. 批量网站测试

```python
from browser_interface import create_browser

def test_multiple_websites(sites):
    """批量测试多个网站"""
    results = {}
    
    with create_browser() as browser:
        for site in sites:
            try:
                page = browser.goto(site)
                results[site] = {
                    'status': 'success',
                    'title': page.title(),
                    'url': page.url()
                }
                print(f'✅ {site} - {page.title()}')
                
            except Exception as e:
                results[site] = {
                    'status': 'failed',
                    'error': str(e)
                }
                print(f'❌ {site} - {e}')
    
    return results

# 使用
sites = [
    'https://www.baidu.com',
    'https://weibo.com',
    'https://www.zhihu.com'
]

results = test_multiple_websites(sites)
```

## 🛡️ 安全注意事项

### ✅ 允许的操作
```python
from browser_interface import create_browser, quick_test, stealth_mode

# 这些都是安全的
browser = create_browser()
quick_test()
with stealth_mode() as browser:
    page = browser.goto('https://example.com')
```

### ❌ 禁止的操作
```python
# 这些都会被安全系统阻止
from playwright.sync_api import sync_playwright     # ❌ 禁止
from camoufox import NewBrowser                    # ❌ 禁止
from selenium import webdriver                     # ❌ 禁止
from libs.browser import CamoufoxBrowser           # ❌ 禁止

# 这些调用也会被阻止
playwright = sync_playwright().start()             # ❌ 禁止
browser = NewBrowser(playwright=p)                  # ❌ 禁止
driver = webdriver.Chrome()                        # ❌ 禁止
```

## 🔧 故障排除

### 常见问题

1. **SecurityError 安全错误**
   ```python
   # 错误：试图直接访问底层实现
   # 解决：只能使用 browser_interface 导入
   ```

2. **导入错误**
   ```python
   # 错误：from browser_interface import create_browser 失败
   # 解决：确保文件在项目根目录
   ```

3. **浏览器启动失败**
   ```python
   # 错误：浏览器无法启动
   # 解决：检查 Camoufox 安装或使用无头模式
   ```

### 调试技巧

```python
from browser_interface import create_browser

# 启用调试模式
import logging
logging.basicConfig(level=logging.DEBUG)

with create_browser(headless=False) as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'调试信息: {page.title()}')
```

## 📖 API 参考

### 主要函数

| 函数 | 描述 | 示例 |
|------|------|------|
| `create_browser()` | 创建浏览器实例 | `browser = create_browser()` |
| `quick_test()` | 快速测试 | `quick_test(url='https://baidu.com')` |
| `stealth_mode()` | 隐匿模式 | `with stealth_mode() as browser:` |
| `headless_mode()` | 无头模式 | `with headless_mode() as browser:` |

### 浏览器方法

| 方法 | 描述 | 示例 |
|------|------|------|
| `browser.goto(url)` | 导航到URL | `page = browser.goto('https://baidu.com')` |
| `browser.new_page()` | 创建新页面 | `page = browser.new_page()` |
| `browser.get_status()` | 获取状态 | `status = browser.get_status()` |

### 页面方法

| 方法 | 描述 | 示例 |
|------|------|------|
| `page.goto(url)` | 导航到URL | `page.goto('https://baidu.com')` |
| `page.title()` | 获取标题 | `title = page.title()` |
| `page.url()` | 获取URL | `url = page.url()` |
| `page.click(selector)` | 点击元素 | `page.click('#button')` |
| `page.fill(selector, text)` | 填写输入框 | `page.fill('#input', 'text')` |
| `page.text_content(selector)` | 获取文本 | `text = page.text_content('#text')` |
| `page.screenshot(filename)` | 截图 | `page.screenshot('screenshot.png')` |

---

## 🎉 总结

WebAuto 抽象浏览器模块提供了：

- ✅ **统一接口** - 所有浏览器操作通过单一入口
- ✅ **安全防护** - 完全屏蔽底层实现
- ✅ **中文支持** - 完美的中文字符显示
- ✅ **反检测功能** - 隐匿模式和伪装技术
- ✅ **自动资源管理** - 上下文管理器自动清理
- ✅ **简单易用** - 一行代码即可使用

现在你可以安全、简单、可靠地进行浏览器自动化操作！
