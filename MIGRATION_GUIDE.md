# 浏览器模块迁移指南

## 概述

项目现在有了统一的浏览器入口，所有浏览器操作都应该通过 `browser.py` 进行。

## 统一入口

**新的导入方式：**

```python
# 推荐方式 - 使用统一入口
from browser import get_browser, quick_test, stealth_mode

# 或者使用管理器
from browser import get_manager
```

## 迁移对照表

### 1. 基础浏览器操作

**旧代码：**
```python
# 方式1: 直接使用 camoufox
from playwright.sync_api import sync_playwright
from camoufox import NewBrowser

with sync_playwright() as p:
    browser = NewBrowser(playwright=p, headless=False, locale='zh-CN')
    page = browser.new_page()
    page.goto('https://www.baidu.com')
```

**新代码：**
```python
from browser import get_browser

with get_browser() as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
```

### 2. 配置文件使用

**旧代码：**
```python
from camoufox_final_setup import launch_camoufox_chinese

playwright, browser = launch_camoufox_chinese(headless=False)
```

**新代码：**
```python
from browser import start_browser

browser = start_browser(headless=False)
```

### 3. 隐匿模式

**旧代码：**
```python
from libs.browser import CamoufoxBrowser, BrowserConfig

config = BrowserConfig.get_stealth_config()
with CamoufoxBrowser(config=config) as browser:
    page = browser.new_page()
```

**新代码：**
```python
from browser import stealth_mode

with stealth_mode() as browser:
    page = browser.new_page()
```

### 4. 快速测试

**旧代码：**
```python
from camoufox_final_setup import test_final_config
test_final_config()
```

**新代码：**
```python
from browser import quick_test

quick_test()  # 使用默认参数
quick_test(url='https://example.com', wait_time=5)
```

### 5. 自定义配置

**旧代码：**
```python
from libs.browser import CamoufoxBrowser

browser = CamoufoxBrowser(
    headless=True,
    locale='zh-CN',
    args=['--custom-arg']
)
```

**新代码：**
```python
from browser import get_browser, get_default_config

config = get_default_config()
config['args'].append('--custom-arg')

with get_browser(config=config, headless=True) as browser:
    page = browser.new_page()
```

## 需要迁移的文件

根据架构分析，以下文件需要迁移：

### 测试文件 (8个)
- `test_camoufox.py`
- `test_camoufox_chinese.py`  
- `test_camoufox_encoding.py`
- `test_camoufox_quick.py`
- `test_chinese_setup.py`
- `test_final_chinese.py`
- `test_launch_options.py`
- `test_working_chinese.py`

### 配置文件 (3个)
- `camoufox_chinese_setup.py`
- `camoufox_final_setup.py`
- `camoufox_minimal_chinese.py`

### 示例文件 (3个)
- `camoufox_browser.py`
- `demo_chinese_browser.py`
- `test_browser_module.py`

## 迁移步骤

### 步骤1: 更新导入

```python
# 删除这些导入
from playwright.sync_api import sync_playwright
from camoufox import NewBrowser
from camoufox_final_setup import launch_camoufox_chinese
from libs.browser import CamoufoxBrowser

# 替换为
from browser import get_browser, quick_test, stealth_mode
```

### 步骤2: 更新浏览器创建

```python
# 删除这些代码
playwright = sync_playwright().start()
browser = NewBrowser(playwright=playwright, config)

# 替换为
browser = get_browser(config=config)
```

### 步骤3: 更新资源管理

```python
# 删除这些代码
try:
    # 浏览器操作
finally:
    browser.close()
    playwright.stop()

# 替换为
with get_browser() as browser:
    # 浏览器操作
```

## 新的优势

1. **统一管理** - 所有浏览器操作通过单一入口
2. **资源管理** - 自动处理资源清理
3. **配置统一** - 标准化的配置管理
4. **单例模式** - 避免重复创建实例
5. **简化调用** - 更少的代码，更清晰的结构

## 兼容性说明

- 旧的浏览器相关文件仍可正常工作
- 建议逐步迁移到新的统一入口
- 新功能应该只使用统一入口
- `libs/browser` 模块作为底层实现，不建议直接使用

## 示例：完整迁移

### 迁移前的文件

```python
# old_test.py
from camoufox_final_setup import launch_camoufox_chinese
import time

def test_baidu():
    playwright, browser = launch_camoufox_chinese(headless=False)
    
    try:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(page.title())
        time.sleep(2)
    finally:
        browser.close()
        playwright.stop()

if __name__ == '__main__':
    test_baidu()
```

### 迁移后的文件

```python
# new_test.py
from browser import get_browser
import time

def test_baidu():
    with get_browser(headless=False) as browser:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
        print(page.title())
        time.sleep(2)

if __name__ == '__main__':
    test_baidu()
```

可以看到，新代码更简洁、更安全、更易维护。
