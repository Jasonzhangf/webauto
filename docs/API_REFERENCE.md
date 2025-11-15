# WebAuto 浏览器模块 - API 参考文档

## 📖 目录

- [1. 核心函数](#1-核心函数)
- [2. 浏览器接口](#2-浏览器接口)
- [3. 页面接口](#3-页面接口)
- [4. 配置函数](#4-配置函数)
- [5. 异常类](#5-异常类)
- [6. 类型定义](#6-类型定义)

## 1. 核心函数

### 1.1 `create_browser()`

创建标准浏览器实例。

#### 函数签名

```python
def create_browser(config: Optional[Dict[str, Any]] = None, **kwargs) -> AbstractBrowser:
    """创建浏览器实例"""
```

#### 参数

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| `config` | `dict | None` | 否 | `None` | 浏览器配置字典 |
| `headless` | `bool` | 否 | `False` | 是否无头模式 |
| `locale` | `str` | 否 | `'zh-CN'` | 语言环境 |
| `args` | `list` | 否 | `['--lang=zh-CN']` | 浏览器启动参数 |

#### 返回值

- `AbstractBrowser` - 浏览器实例

#### 示例

```python
from browser_interface import create_browser

# 基础使用
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())

# 自定义配置
config = {
    'headless': False,
    'locale': 'zh-CN',
    'args': ['--window-size=1920,1080']
}
with create_browser(config=config) as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())

# 直接传递参数
with create_browser(headless=True, locale='en-US') as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
```

### 1.2 `quick_test()`

快速测试浏览器功能。

#### 函数签名

```python
def quick_test(url: str = 'https://www.baidu.com', wait_time: int = 3, **kwargs):
    """快速测试浏览器功能"""
```

#### 参数

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| `url` | `str` | 否 | `'https://www.baidu.com'` | 测试URL |
| `wait_time` | `int` | 否 | `3` | 等待时间（秒） |
| `**kwargs` | `dict` | 否 | - | 传递给 `create_browser()` 的参数 |

#### 返回值

- `None`

#### 示例

```python
from browser_interface import quick_test

# 默认测试
quick_test()

# 自定义URL测试
quick_test(url='https://weibo.com', wait_time=5)

# 隐匿模式测试
quick_test(url='https://bot.sannysoft.com', headless=False)
```

### 1.3 `stealth_mode()`

创建隐匿模式浏览器（最强反检测）。

#### 函数签名

```python
def stealth_mode(**kwargs) -> AbstractBrowser:
    """创建隐匿模式浏览器实例"""
```

#### 参数

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| `headless` | `bool` | 否 | `False` | 是否无头模式 |
| `**kwargs` | `dict` | 否 | - | 其他浏览器参数 |

#### 返回值

- `AbstractBrowser` - 隐匿模式浏览器实例

#### 示例

```python
from browser_interface import stealth_mode

# 隐匿模式
with stealth_mode() as browser:
    page = browser.goto('https://bot.sannysoft.com')
    print(page.title())

# 隐匿无头模式
with stealth_mode(headless=True) as browser:
    page = browser.goto('https://example.com')
    print(page.title())
```

### 1.4 `headless_mode()`

创建无头模式浏览器（后台运行）。

#### 函数签名

```python
def headless_mode(**kwargs) -> AbstractBrowser:
    """创建无头模式浏览器实例"""
```

#### 参数

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| `**kwargs` | `dict` | 否 | - | 其他浏览器参数 |

#### 返回值

- `AbstractBrowser` - 无头模式浏览器实例

#### 示例

```python
from browser_interface import headless_mode

# 无头模式
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())

# 自定义无头模式
with headless_mode(locale='en-US') as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
```

## 2. 浏览器接口

### 2.1 `AbstractBrowser` 类

浏览器抽象接口，提供浏览器级别的操作方法。

#### 方法

##### `start(**kwargs)`

启动浏览器。

```python
def start(self, **kwargs):
    """启动浏览器"""
```

**参数：**
- `**kwargs`: 启动参数

**返回值：**
- `None`

**示例：**

```python
browser = create_browser()
browser.start()
try:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
finally:
    browser.stop()
```

##### `stop()`

停止浏览器。

```python
def stop(self):
    """停止浏览器"""
```

**参数：**
- 无

**返回值：**
- `None`

##### `new_page()`

创建新页面。

```python
def new_page(self) -> AbstractPage:
    """创建新页面"""
```

**参数：**
- 无

**返回值：**
- `AbstractPage` - 页面实例

**示例：**

```python
with create_browser() as browser:
    page1 = browser.new_page()
    page2 = browser.new_page()
    
    page1.goto('https://www.baidu.com')
    page2.goto('https://weibo.com')
    
    print(f'百度: {page1.title()}')
    print(f'微博: {page2.title()}')
```

##### `goto(url, **kwargs)`

导航到指定URL并创建页面。

```python
def goto(self, url: str, **kwargs) -> AbstractPage:
    """导航到URL"""
```

**参数：**
- `url` (str): 目标URL
- `**kwargs`: 其他导航参数

**返回值：**
- `AbstractPage` - 页面实例

**示例：**

```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'页面标题: {page.title()}')
```

##### `get_status()`

获取浏览器状态信息。

```python
def get_status(self) -> Dict[str, Any]:
    """获取浏览器状态"""
```

**参数：**
- 无

**返回值：**
- `dict` - 状态信息字典

**示例：**

```python
browser = create_browser()
try:
    page = browser.new_page()
    status = browser.get_status()
    print(f'浏览器状态: {status}')
finally:
    browser.close()
```

##### 上下文管理器支持

浏览器支持上下文管理器，自动处理资源清理。

```python
with create_browser() as browser:
    # 浏览器自动启动
    page = browser.goto('https://www.baidu.com')
    print(page.title())
    # 浏览器自动关闭
```

## 3. 页面接口

### 3.1 `AbstractPage` 类

页面抽象接口，提供页面级别的操作方法。

#### 方法

##### `goto(url, **kwargs)`

导航到指定URL。

```python
def goto(self, url: str, **kwargs):
    """导航到URL"""
```

**参数：**
- `url` (str): 目标URL
- `**kwargs`: 导航参数

**返回值：**
- `None`

**示例：**

```python
with create_browser() as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(f'当前URL: {page.url()}')
```

##### `title()`

获取页面标题。

```python
def title(self) -> str:
    """获取页面标题"""
```

**参数：**
- 无

**返回值：**
- `str` - 页面标题

**示例：**

```python
page.goto('https://www.baidu.com')
title = page.title()
print(f'页面标题: {title}')
```

##### `url()`

获取当前页面URL。

```python
def url(self) -> str:
    """获取页面URL"""
```

**参数：**
- 无

**返回值：**
- `str` - 当前URL

##### `screenshot(filename, **kwargs)`

对页面进行截图。

```python
def screenshot(self, filename: str, **kwargs):
    """页面截图"""
```

**参数：**
- `filename` (str): 截图文件名
- `**kwargs`: 截图参数
  - `full_page` (bool): 是否全页面截图，默认 `False`
  - `quality` (int): 截图质量，默认 80

**返回值：**
- `None`

**示例：**

```python
# 可见区域截图
page.screenshot('visible.png')

# 全页面截图
page.screenshot('full.png', full_page=True)

# 高质量截图
page.screenshot('high_quality.png', quality=95)
```

##### `click(selector, **kwargs)`

点击页面元素。

```python
def click(self, selector: str, **kwargs):
    """点击元素"""
```

**参数：**
- `selector` (str): CSS选择器
- `**kwargs`: 点击参数
  - `timeout` (int): 超时时间（毫秒），默认 10000
  - `force` (bool): 是否强制点击，默认 `False`

**返回值：**
- `None`

**示例：**

```python
# 点击搜索按钮
page.click('#su')

# 等待元素出现后点击
page.click('#dynamic_button', timeout=30000)

# 强制点击
page.click('#hidden_button', force=True)
```

##### `fill(selector, text, **kwargs)`

填写输入框内容。

```python
def fill(self, selector: str, text: str, **kwargs):
    """填写输入框"""
```

**参数：**
- `selector` (str): CSS选择器
- `text` (str): 填写内容
- `**kwargs`: 填写参数
  - `timeout` (int): 超时时间（毫秒），默认 10000
  - `clear` (bool): 是否先清空，默认 `True`

**返回值：**
- `None`

**示例：**

```python
# 填写搜索框
page.fill('#kw', 'Python 自动化')

# 等待元素出现后填写
page.fill('#dynamic_input', '内容', timeout=30000)

# 不清空现有内容
page.fill('#input', '追加内容', clear=False)
```

##### `text_content(selector, **kwargs)`

获取元素文本内容。

```python
def text_content(self, selector: str, **kwargs) -> str:
    """获取元素文本内容"""
```

**参数：**
- `selector` (str): CSS选择器
- `**kwargs`: 获取参数
  - `timeout` (int): 超时时间（毫秒），默认 10000

**返回值：**
- `str` - 元素文本内容

**示例：**

```python
# 获取元素文本
text = page.text_content('#element')
print(f'元素文本: {text}')

# 等待元素出现后获取
text = page.text_content('#dynamic_text', timeout=30000)
print(f'动态文本: {text}')
```

##### `evaluate(script, **kwargs)`

执行 JavaScript 代码。

```python
def evaluate(self, script: str, **kwargs):
    """执行JavaScript代码"""
```

**参数：**
- `script` (str): JavaScript 代码
- `**kwargs`: 执行参数
  - `arg` (any): 传递给脚本的参数

**返回值：**
- `any` - JavaScript 执行结果

**示例：**

```python
# 获取页面信息
info = page.evaluate('{title: document.title, url: window.location.href}')
print(f'页面信息: {info}')

# 执行带参数的脚本
result = page.evaluate('(arg) => arg * 2', arg=5)
print(f'结果: {result}')  # 输出: 10

# 修改页面内容
page.evaluate('document.title = "新标题"')
print(f'修改后标题: {page.title()}')
```

##### `mouse`

鼠标操作对象。

```python
@property
def mouse(self):
    """鼠标操作对象"""
```

**方法：**
- `move(x, y)` - 移动鼠标到指定坐标
- `click(x, y)` - 点击指定坐标
- `down()` - 按下鼠标
- `up()` - 释放鼠标

**示例：**

```python
# 移动鼠标
page.mouse.move(100, 100)

# 点击指定位置
page.mouse.click(100, 100)

# 拖拽操作
page.mouse.down(100, 100)
page.mouse.move(200, 200)
page.mouse.up()
```

##### `keyboard`

键盘操作对象。

```python
@property
def keyboard(self):
    """键盘操作对象"""
```

**方法：**
- `press(key)` - 按键
- `type(text)` - 输入文本
- `down(key)` - 按下按键
- `up(key)` - 释放按键

**示例：**

```python
# 按回车键
page.keyboard.press('Enter')

# 输入文本
page.keyboard.type('Hello World')

# 组合键
page.keyboard.press('Control+a')  # 全选
page.keyboard.press('Control+c')  # 复制
```

## 4. 配置函数

### 4.1 `get_default_config()`

获取默认浏览器配置。

#### 函数签名

```python
def get_default_config() -> Dict[str, Any]:
    """获取默认配置"""
```

#### 返回值

```python
{
    'headless': False,
    'locale': 'zh-CN',
    'args': ['--lang=zh-CN']
}
```

#### 示例

```python
from browser_interface import get_default_config

config = get_default_config()
print(f'默认配置: {config}')
```

### 4.2 `get_stealth_config()`

获取隐匿模式配置（最强反检测）。

#### 函数签名

```python
def get_stealth_config() -> Dict[str, Any]:
    """获取隐匿配置"""
```

#### 返回值

包含11个反检测参数的配置字典。

#### 示例

```python
from browser_interface import get_stealth_config

config = get_stealth_config()
print(f'隐匿参数数量: {len(config["args"])}')
```

### 4.3 `get_headless_config()`

获取无头模式配置。

#### 函数签名

```python
def get_headless_config() -> Dict[str, Any]:
    """获取无头配置"""
```

#### 返回值

```python
{
    'headless': True,
    'locale': 'zh-CN',
    'args': ['--lang=zh-CN']
}
```

## 5. 异常类

### 5.1 `SecurityError`

安全违规异常，当尝试访问禁止的底层实现时抛出。

#### 继承关系

```python
class SecurityError(Exception):
    pass
```

#### 触发条件

- 尝试导入禁止的模块（playwright、camoufox 等）
- 尝试直接实例化禁止的类（NewBrowser、WebDriver 等）
- 文件包含禁止的导入或类使用

#### 示例

```python
try:
    from playwright.sync_api import sync_playwright  # 禁止的操作
except SecurityError as e:
    print(f'安全违规: {e}')
```

## 6. 类型定义

### 6.1 类型别名

```python
from typing import Dict, Any, Optional, List

ConfigDict = Dict[str, Any]
BrowserType = str
URL = str
Selector = str
Timeout = int
```

### 6.2 枚举类型

#### 浏览器类型

```python
class BrowserType(Enum):
    CAMOUFOX = 'camoufox'
    # 未来可能支持更多类型
```

#### 资源类型

```python
class ResourceType(Enum):
    DOCUMENT = 'document'
    STYLESHEET = 'stylesheet'
    IMAGE = 'image'
    MEDIA = 'media'
    FONT = 'font'
    SCRIPT = 'script'
    TEXTTRACK = 'texttrack'
    XHR = 'xhr'
    FETCH = 'fetch'
    WEBSOCKET = 'websocket'
    MANIFEST = 'manifest'
```

## 版本信息

- **当前版本**: 3.0.0
- **接口版本**: abstract-v1
- **Python 版本**: >= 3.8
- **依赖版本**: 
  - camoufox >= 0.4.0
  - playwright >= 1.40.0

## 更新日志

### v3.0.0 (当前版本)
- ✅ 完全抽象的浏览器接口
- ✅ 三层安全防护机制
- ✅ 统一的配置管理
- ✅ 强化的反检测能力
- ✅ 完善的错误处理

### v2.0.0
- ✅ 基础浏览器管理器
- ✅ 中文支持配置
- ✅ 隐匿模式实现

### v1.0.0
- ✅ 初始版本
- ✅ 基础功能实现

---

## 📚 相关文档

- [快速入门指南](QUICK_START.md) - 5分钟上手
- [用户指南](USER_GUIDE.md) - 详细使用说明
- [架构设计文档](ARCHITECTURE.md) - 理解抽象层设计
- [故障排除指南](TROUBLESHOOTING.md) - 常见问题解决
- [使用示例](EXAMPLES.md) - 实战项目示例

---

**🎉 这就是 WebAuto 浏览器模块的完整 API 文档！**
