# WebAuto 浏览器模块 - 使用方式文档

## 🎯 核心使用原则

### 📝 唯一入口原则

**所有浏览器操作都必须且只能通过 `browser_interface.py` 进行！**

### 🚫 禁止的直接访问

**这些导入和操作都会被安全系统阻止：**

```python
# ❌ 绝对禁止的导入
from playwright.sync_api import sync_playwright     # 阻断
from playwright.async_api import async_playwright    # 阻断
from camoufox import NewBrowser                    # 阻断
from selenium import webdriver                     # 阻断
from undetected_chromedriver import uc               # 阻断
from libs.browser import CamoufoxBrowser           # 阻断
from libs.browser.config import BrowserConfig      # 阻断
from browser_manager import get_browser              # 阻断

# ❌ 绝对禁止的类使用
playwright = sync_playwright().start()             # 阻断
browser = NewBrowser(playwright=p)                  # 阻断
driver = webdriver.Chrome()                        # 阻断
```

### ✅ 唯一允许的使用方式

**只能从 `browser_interface.py` 导入！**

```python
# ✅ 唯一正确的方式
from browser_interface import (
    create_browser,    # 创建浏览器
    quick_test,        # 快速测试
    stealth_mode,      # 隐匿模式
    headless_mode       # 无头模式
    SecurityError       # 安全异常
)

# 使用示例
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
```

## 🚀 四种核心使用方式

### 1. 标准浏览器模式

```python
from browser_interface import create_browser

# 基础使用（Python 侧统一入口）
with create_browser() as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(f'页面标题: {page.title()}')
```

**特点：**
- 包含完整中文支持
- 自动资源管理
- 标准配置参数

### 2. 快速测试模式

```python
from browser_interface import quick_test

# 一行代码测试
quick_test()

# 自定义测试
quick_test(url='https://weibo.com', wait_time=3)

# 无头模式测试
quick_test(headless=True)
```

**特点：**
- 一行代码即可使用
- 自动处理所有配置
- 适合快速验证

### 3. 隐匿模式（最强反检测）

```python
from browser_interface import stealth_mode

# 隐匿模式使用
with stealth_mode() as browser:
    page = browser.goto('https://bot.sannysoft.com')
    print(f'隐匿访问: {page.title()}')
```

**特点：**
- 包含11个反检测参数
- 自动隐藏 webdriver 属性
- 模拟真实浏览器特征
- 绕过各种反爬虫检测

### 4. 无头模式（后台运行）

```python
from browser_interface import headless_mode

# 无头模式使用
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'后台访问: {page.title()}')
```

**特点：**
- 适合自动化任务
- 不显示浏览器界面
- 更好的性能表现

## 🔧 高级功能

### 自定义配置

```python
from browser_interface import create_browser

# 自定义配置（不再推荐手动传入 --lang / 复杂指纹参数）
config = {
    'headless': False,
    # 如非必要，不要在这里直接设置 locale/args 等底层参数，
    # 中文与指纹配置已经在 browser_interface 中统一封装。
}

with create_browser(config=config) as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'自定义配置: {page.title()}')
```

### 多页面操作

```python
from browser_interface import create_browser

with create_browser() as browser:
    # 页面1 - 百度
    page1 = browser.goto('https://www.baidu.com')
    page1.fill('#kw', 'Python')
    
    # 页面2 - 微博
    page2 = browser.goto('https://weibo.com')
    print(f'微博标题: {page2.title()}')
    
    # 页面3 - 知乎
    page3 = browser.goto('https://www.zhihu.com')
    print(f'知乎标题: {page3.title()}')
    
    # 切换回页面1
    page1.click('#su')
```

## 🧰 命令行脚本与一键启动

### 1. 安装 / 重置 Camoufox 环境

浏览器底层由 Camoufox 提供，推荐使用官方 CLI 一次性完成安装与重置：

```bash
# 在项目根目录执行
npm run browser:camoufox:install
```

等价于：

```bash
python3 -m camoufox remove  # 清理旧的安装与缓存
python3 -m camoufox fetch   # 自动下载并安装最新的 Camoufox 浏览器
```

安装完成后，可以用 Python 入口快速验证：

```bash
python3 -c "from browser_interface import quick_test; quick_test(headless=False)"
```

### 2. 固定指纹 + 自动会话 + 空白页（推荐交互方式）

为了兼容 1688 等强绑定站点，Python 侧已经在 `browser_interface` 中封装了固定指纹 + 自动会话的统一入口：

```python
from browser_interface import open_profile_browser

# 默认使用 profile_id='1688-main-v1' + 固定指纹 + 自动会话 + 菜单注入
with open_profile_browser() as browser:
    # 此时浏览器：
    # - 使用固定指纹（不会每次随机）
    # - 复用 session_1688-fixed-v1.json 中的会话（如显式传入）
    # - 默认只保留一个 about:blank 空白标签页
    # - 已注入最小悬浮菜单，便于调试与标识
    page = browser.new_page()
    page.goto('https://www.1688.com')
```

**默认行为说明：**

- 同一 `profile_id` 下启动前会尝试终止已有 Camoufox 实例（互斥，避免多个窗口竞争同一 profile）。
- 默认指纹模式为 `fixed`，并将 `profile_id='1688-main-v1'` 作为默认 profile（可覆盖）。
- 当 `auto_session=True` 时，会自动：
  - **周期性保存会话**：后台线程每隔 5 秒调用一次 `save_session(session_name)` 持久化 `storage_state`（适配 1688 这类频繁变更 cookie 的站点）。
  - 在 `close()` 时再做一次最终保存。
- 启动后只保留一个 about:blank 空白标签页，业务页面由上层代码显式 `goto()` 控制，避免无意义的默认页面（如 zh-cn 错误页）。

### 2. 一键启动浏览器服务并创建会话（Node 端）

对于需要通过服务端/工作流远程控制浏览器的场景，可以使用一键脚本：

```bash
npm run browser:camoufox:oneclick
```

该命令会：

- 启动 Python 浏览器服务（`services/browser_launcher.py`），默认监听 `http://127.0.0.1:8888`
- 通过 REST API 创建一个使用 `profile_id="default"` 的会话
- 在前台弹出一个 Camoufox 窗口（初始页面为 `about:blank`）

后续浏览器控制应通过浏览器服务暴露的 API 完成（例如 `POST /api/v1/sessions/{id}/navigate`），而不是直接在应用层使用 Playwright / Camoufox 原生接口。
```

### 手动资源管理

```python
from browser_interface import create_browser, SecurityError

def manual_management():
    browser = create_browser()
    try:
        browser.start()
        
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(f'手动管理: {page.title()}')
        
    finally:
        browser.stop()
```

## 🛡️ 安全使用最佳实践

### 1. 导入安全检查

```python
# ✅ 安全 - 只从统一入口导入
from browser_interface import create_browser, quick_test, stealth_mode

# ❌ 危险 - 会被安全系统阻止
# from playwright.sync_api import sync_playwright
# from camoufox import NewBrowser
```

### 2. 文件内容安全

```python
# ✅ 安全的文件内容
"""安全的使用示例"""
from browser_interface import create_browser

with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
"""

# ❌ 危险的文件内容（会被检测并阻止）
"""危险的使用示例"""
from playwright.sync_api import sync_playwright  # 危险
from camoufox import NewBrowser                # 危险

with sync_playwright() as p:  # 危险
    browser = NewBrowser(playwright=p)          # 危险
    pass
"""
```

### 3. 函数调用安全

```python
# ✅ 安全的函数定义
def safe_search(keyword):
    """安全的搜索函数"""
    from browser_interface import create_browser  # 安全的局部导入
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        page.fill('#kw', keyword)
        page.click('#su')
        return page.title()

# ❌ 危险的函数定义
def dangerous_search(keyword):
    """危险的搜索函数"""
    import playwright  # 危险的模块级导入
    from camoufox import NewBrowser  # 危险的模块级导入
    
    with sync_playwright() as p:  # 危险的代码
        browser = NewBrowser(playwright=p)  # 危险的代码
        pass
```

## 📋 完整 API 参考

### 浏览器接口

| 方法 | 描述 | 示例 |
|------|------|------|
| `create_browser()` | 创建标准浏览器 | `with create_browser() as browser:` |
| `quick_test()` | 快速测试 | `quick_test()` |
| `stealth_mode()` | 隐匿模式 | `with stealth_mode() as browser:` |
| `headless_mode()` | 无头模式 | `with headless_mode() as browser:` |

### 页面操作方法

| 方法 | 描述 | 示例 |
|------|------|------|
| `goto(url)` | 导航到URL | `page = browser.goto('https://baidu.com')` |
| `new_page()` | 创建新页面 | `page = browser.new_page()` |
| `title()` | 获取标题 | `title = page.title()` |
| `url()` | 获取URL | `url = page.url()` |
| `click(selector)` | 点击元素 | `page.click('#button')` |
| `fill(selector, text)` | 填写输入框 | `page.fill('#input', 'text')` |
| `text_content(selector)` | 获取文本 | `text = page.text_content('#element')` |
| `screenshot(filename)` | 截图 | `page.screenshot('screenshot.png')` |
| `evaluate(script)` | 执行JS | `result = page.evaluate('1+1')` |

### 配置参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `headless` | bool | `False` | 是否无头模式 |
| `locale` | str | `'zh-CN'` | 语言环境 |
| `args` | list | `['--lang=zh-CN']` | 浏览器启动参数 |

## 🎯 常见使用场景

### 1. 网站信息采集

```python
from browser_interface import create_browser
def scrape_website_info(url):
    """采集网站基本信息"""
    with create_browser() as browser:
        page = browser.goto(url)
        
        return {
            'title': page.title(),
            'url': page.url(),
            'timestamp': time.time()
        }

# 使用
info = scrape_website_info('https://www.baidu.com')
print(info)
```

### 2. 百度搜索自动化

```python
from browser_interface import create_browser
def baidu_search(keyword):
    """百度搜索自动化"""
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 填写搜索框
        page.fill('#kw', keyword)
        
        # 点击搜索按钮
        page.click('#su')
        
        import time
        time.sleep(2)
        
        return page.title()

# 使用
result = baidu_search('Python 自动化')
print(f'搜索结果: {result}')
```

### 3. 批量网站测试

```python
from browser_interface import create_browser

def test_multiple_sites(sites):
    """批量网站测试"""
    results = []
    
    with create_browser() as browser:
        for site in sites:
            try:
                page = browser.goto(site)
                results.append({
                    'url': site,
                    'title': page.title(),
                    'status': 'success'
                })
                print(f'✅ {site}: {page.title()}')
                
            except Exception as e:
                results.append({
                    'url': site,
                    'error': str(e),
                    'status': 'failed'
                })
                print(f'❌ {site}: {e}')
    
    return results

# 使用
sites = ['https://www.baidu.com', 'https://weibo.com', 'https://www.zhihu.com']
results = test_multiple_sites(sites)
print(f'测试完成: {len([r for r in results if r["status"] == "success"])}/{len(sites)}')
```

### 4. 隐匿爬取

```python
from browser_interface import stealth_mode
def stealth_scrape(url):
    """隐匿模式爬取"""
    with stealth_mode() as browser:
        page = browser.goto(url)
        
        # 模拟人类行为
        import time
        import random
        
        # 随机滚动
        scroll_distance = random.randint(100, 300)
        page.evaluate(f'window.scrollBy(0, {scroll_distance})')
        time.sleep(random.uniform(1, 3))
        
        return {
            'title': page.title(),
            'url': page.url(),
            'timestamp': time.time()
        }

# 使用
result = stealth_scrape('https://example.com')
print(f'隐匿爬取: {result}')
```

## ⚠️ 常见错误和解决方案

### 错误1: SecurityViolationError

```python
SecurityViolationError: 禁止访问底层浏览器实现!
违规文件: your_file.py
违规模块: your_module
```

**解决方案：**
```python
# ✅ 正确做法
from browser_interface import create_browser

with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())

# ❌ 错误做法
from playwright.sync_api import sync_playwright     # 移除这些导入
from camoufox import NewBrowser                    # 移除这些导入
```

### 错误2: 多页面创建

```python
# ✅ 推荐做法（每个 goto 创建一个页面）
with create_browser() as browser:
    page1 = browser.goto('https://www.baidu.com')
    page2 = browser.goto('https://weibo.com')
    print(f'百度: {page1.title()}')
    print(f'微博: {page2.title()}')
```

### 错误3: 资源泄漏

```python
# ✅ 使用上下文管理器（推荐）
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
# 浏览器自动关闭

# ❌ 手动管理（容易忘记关闭）
browser = create_browser()
try:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
finally:
    browser.close()  # 容易忘记
```

## 🎉 最佳实践总结

### 1. 始终遵守统一入口原则

```python
# 每个文件的开头都应该是这样的
from browser_interface import create_browser, quick_test, stealth_mode, headless_mode
```

### 2. 优先使用上下文管理器

```python
# ✅ 推荐：自动资源管理
with create_browser() as browser:
    # 你的代码
    pass
# ✅ 推荐：复用浏览器实例
with create_browser() as browser:
    for site in sites:
        page = browser.goto(site)
        process_page(page)
```

### 3. 合理使用模式选择

```python
# 交互式开发：使用标准模式
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    # 调试和开发

# 自动化任务：使用无头模式
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    # 批量处理

# 反检测需求：使用隐匿模式
with stealth_mode() as browser:
    page = browser.goto('https://target-site.com')
    # 绕过检测

# 快速验证：使用快速测试
quick_test(headless=False)
```

### 4. 完善的错误处理

```python
from browser_interface import create_browser, SecurityError

try:
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        print(f'访问成功: {page.title()}')
        
except SecurityError as e:
    print(f'安全错误: {e}')
    # 只能使用正确的导入方式
    
except Exception as e:
    print(f'其他错误: {e}')
    # 处理网络、超时等错误
```

---

## 📚 延伸阅读

- [快速入门指南](QUICK_START.md) - 5分钟上手
- [用户指南](USER_GUIDE.md) - 详细功能说明
- [API 参考文档](API_REFERENCE.md) - 完整API文档
- [架构设计文档](ARCHITECTURE.md) - 理解抽象层设计
- [故障排除指南](TROUBLESHOOTING.md) - 常见问题解决
- [使用示例](EXAMPLES.md) - 实战项目示例

---

## 🎯 核心原则总结

### 📝 唯一入口
**所有浏览器操作都必须且只能通过 `browser_interface.py` 进行！**

### 🚫 安全防护
**任何直接访问底层实现都会被安全系统阻止！**

### 🔒 自动管理
**优先使用上下文管理器确保资源正确释放！**

### 🌐 中文支持
**默认配置已包含完整的中文支持！**

### 🎭 强大反检测
**使用隐匿模式获得最强的反检测自动化之旅吧！**
