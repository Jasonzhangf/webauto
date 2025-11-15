# WebAuto 浏览器模块 - 用户指南

## 📖 目录

- [1. 基础概念](#1-基础概念)
- [2. 核心功能](#2-核心功能)
- [3. 详细用法](#3-详细用法)
- [4. 高级特性](#4-高级特性)
- [5. 最佳实践](#5-最佳实践)
- [6. 常见场景](#6-常见场景)
- [7. 性能优化](#7-性能优化)

## 1. 基础概念

### 1.1 什么是 WebAuto 浏览器模块？

WebAuto 浏览器模块是一个完全抽象的浏览器自动化框架，提供统一的接口来控制浏览器，同时隐藏底层实现的复杂性。

### 1.2 核心设计*完全抽象** - 无法直接访问底层库（playwright、camoufox 等）
- **运行时检查** - 实时监控所有调用，确保安全
- **编译时检查** - 静态分析代码，阻止违规导入

#### 🚀 简单易用
- **统一入口** - 所有操作通过 `browser_interface.py`
- **一行代码** - `quick_test()` 即可开始
- **自动管理** - 上下文管理器自动处理资源

#### 🌐 功能强大
- **中文支持** - 完美的中文字符显示和输入
- **反检测** - 强大的隐匿模式，绕过各种检测
- **多模式** - 标准、隐匿、无头模式

### 1.3 架构概览

```
用户代码
    ↓
browser_interface.py (统一接口层)
    ↓
SecurityChecker (安全检查层)
    ↓
AbstractBrowser (抽象接口层)
    ↓
CamoufoxWrapper (实现包装层)
    ↓
libs/browser/ (底层实现)
```

## 2. 核心功能

### 2.1 四种核心函数

#### `create_browser()` - 创建标准浏览器

```python
from browser_interface import create_browser

# 基础用法
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'标题: {page.title()}')

# 自定义配置
config = {
    'headless': False,
    'locale': 'zh-CN',
    'args': ['--window-size=1920,1080']
}
with create_browser(config=config) as browser:
    page = browser.goto('https://www.baidu.com')
```

**参数说明：**
- `headless` (bool): 是否无头模式，默认 False
- `locale` (str): 语言环境，默认 'zh-CN'
- `args` (list): 浏览器启动参数

#### `quick_test()` - 快速测试

```python
from browser_interface import quick_test

# 默认测试（访问百度）
quick_test()

# 自定义测试
quick_test(url='https://weibo.com', wait_time=3)
```

**参数说明：**
- `url` (str): 测试网址，默认 'https://www.baidu.com'
- `wait_time` (int): 等待时间（秒），默认 3

#### `stealth_mode()` - 隐匿模式

```python
from browser_interface import stealth_mode

# 隐匿模式（最强反检测）
with stealth_mode() as browser:
    page = browser.goto('https://bot.sannysoft.com')
    print(f'隐匿访问: {page.title()}')
```

**特点：**
- 包含 11 个反检测参数
- 自动隐藏 webdriver 属性
- 模拟真实浏览器特征

#### `headless_mode()` - 无头模式

```python
from browser_interface import headless_mode

# 无头模式（后台运行）
with headless_mode() as browser:
    page = browser.goto('https://www.baidu.com')
    print(f'后台访问: {page.title()}')
```

**特点：**
- 适合自动化任务
- 不显示浏览器界面
- 更好的性能

### 2.2 页面操作方法

#### 基础操作

```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    
    # 获取页面信息
    title = page.title()           # 页面标题
    url = page.url()              # 页面URL
    
    # 元素操作
    page.fill('#kw', '搜索内容')   # 填写输入框
    page.click('#su')              # 点击按钮
    text = page.text_content('#element')  # 获取元素文本
    
    # 截图
    page.screenshot('screenshot.png')
    page.screenshot('full.png', full_page=True)
```

#### 高级操作

```python
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    
    # JavaScript 执行
    result = page.evaluate('document.title')
    print(f'JS执行结果: {result}')
    
    # 鼠标操作
    page.mouse.move(100, 100)
    page.mouse.click(100, 100)
    
    # 键盘操作
    page.keyboard.press('Enter')
    page.keyboard.type('Hello World')
    
    # 等待元素
    page.wait_for_selector('#element', timeout=10000)
```

## 3. 详细用法

### 3.1 浏览器配置

#### 默认配置

```python
from browser_interface import get_default_config

config = get_default_config()
print(config)
# 输出：
# {
#     'headless': False,
#     'locale': 'zh-CN',
#     'args': ['--lang=zh-CN']
# }
```

#### 隐匿配置

```python
from browser_interface import get_stealth_config

config = get_stealth_config()
print(f'隐匿参数数量: {len(config["args"])}')
# 输出：隐匿参数数量: 11
```

#### 自定义配置

```python
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
```

### 3.2 错误处理

#### 基础错误处理

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

#### 高级错误处理

```python
import time
from browser_interface import create_browser

def safe_operation(url, max_retries=3):
    """安全的浏览器操作"""
    for attempt in range(max_retries):
        try:
            with create_browser() as browser:
                page = browser.goto(url)
                
                # 等待页面加载
                time.sleep(2)
                
                # 验证页面标题
                if page.title():
                    return {
                        'success': True,
                        'title': page.title(),
                        'url': page.url()
                    }
                    
        except Exception as e:
            print(f'尝试 {attempt + 1} 失败: {e}')
            if attempt < max_retries - 1:
                time.sleep(2)  # 等待后重试
    
    return {'success': False, 'error': '所有尝试都失败'}

# 使用
result = safe_operation('https://www.baidu.com')
print(result)
```

### 3.3 多页面管理

```python
from browser_interface import create_browser

def multi_page_operations():
    """多页面操作示例"""
    with create_browser() as browser:
        # 创建多个页面
        page1 = browser.goto('https://www.baidu.com')
        page2 = browser.goto('https://weibo.com')
        page3 = browser.goto('https://www.zhihu.com')
        
        # 操作页面1
        page1.fill('#kw', 'Python')
        
        # 操作页面2
        title2 = page2.title()
        print(f'微博标题: {title2}')
        
        # 操作页面3
        title3 = page3.title()
        print(f'知乎标题: {title3}')
        
        # 返回页面1并搜索
        page1.click('#su')
        
        return {
            'baidu': page1.title(),
            'weibo': title2,
            'zhihu': title3
        }

# 使用
results = multi_page_operations()
print(results)
```

## 4. 高级特性

### 4.1 隐匿模式详解

#### 反检测参数

隐匿模式包含以下反检测参数：

```python
# 隐匿配置参数
[
    '--disable-blink-features=AutomationControlled',  # 禁用自动化控制
    '--disable-dev-shm-usage',                     # 优化内存使用
    '--no-sandbox',                               # 禁用沙盒
    '--disable-setuid-sandbox',                    # 禁用UID沙盒
    '--disable-extensions',                        # 禁用扩展
    '--disable-gpu',                              # 禁用GPU
    '--disable-dev-tools-animations',              # 禁用开发者工具动画
    '--disable-background-timer-throttling',       # 禁用后台定时器限制
    '--disable-backgrounding-occluded-windows',     # 禁用后台窗口
    '--disable-renderer-backgrounding',            # 禁用渲染器后台
    '--force-charset=UTF-8'                      # 强制UTF-8编码
]
```

#### 隐匿模式使用

```python
from browser_interface import stealth_mode

def stealth_scraping(url):
    """隐匿模式爬取"""
    with stealth_mode() as browser:
        page = browser.goto(url)
        
        # 模拟人类行为
        import time
        import random
        
        # 随机滚动
        scroll_distance = random.randint(100, 300)
        page.evaluate(f'window.scrollBy(0, {scroll_distance})')
        
        # 随机延迟
        time.sleep(random.uniform(1.0, 3.0))
        
        # 获取页面信息
        info = {
            'title': page.title(),
            'url': page.url(),
            'user_agent': page.evaluate('navigator.userAgent'),
            'has_webdriver': page.evaluate('navigator.webdriver !== undefined')
        }
        
        return info

# 使用
result = stealth_scraping('https://example.com')
print(result)
```

### 4.2 性能监控

#### 页面加载性能

```python
from browser_interface import create_browser

def monitor_performance(url):
    """监控页面性能"""
    with create_browser() as browser:
        page = browser.goto(url)
        
        # 获取性能指标
        performance = page.evaluate("""
            const perfData = performance.getEntriesByType('navigation')[0];
            ({
                domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
                loadComplete: perfData.loadEventEnd - perfData.navigationStart,
                firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
                firstContentfulPaint: performance.getEntriesByType('paint')[1]?.startTime || 0
            })
        """)
        
        return {
            'url': url,
            'performance': performance,
            'timestamp': time.time()
        }

# 使用
result = monitor_performance('https://www.baidu.com')
print(f'性能指标: {result["performance"]}')
```

### 4.3 网络请求监控

```python
from browser_interface import create_browser

def monitor_network_requests(url):
    """监控网络请求"""
    with create_browser() as browser:
        # 设置请求监控
        requests = []
        
        def log_request(request):
            requests.append({
                'url': request.url,
                'method': request.method,
                'resource_type': request.resource_type
            })
        
        # 尝试设置请求监听
        try:
            page = browser.goto(url)
            
            # 通过JavaScript监控网络请求
            network_data = page.evaluate("""
                const requests = [];
                const originalFetch = window.fetch;
                
                window.fetch = function(...args) {
                    requests.push({
                        url: args[0],
                        method: args[1]?.method || 'GET',
                        timestamp: Date.now()
                    });
                    return originalFetch.apply(this, args);
                };
                
                requests;
            """)
            
            # 执行一些操作产生请求
            time.sleep(2)
            
            final_requests = page.evaluate('window.requests')
            
            return {
                'url': url,
                'requests': final_requests,
                'total_requests': len(final_requests)
            }
            
        except Exception as e:
            return {'error': f'网络监控失败: {e}'}

# 使用
result = monitor_network_requests('https://www.baidu.com')
print(f'网络请求: {result}')
```

## 5. 最佳实践

### 5.1 资源管理

#### 推荐方式：上下文管理器

```python
# ✅ 推荐 - 自动资源管理
with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    # 浏览器自动关闭
```

#### 不推荐方式：手动管理

```python
# ❌ 不推荐 - 容易忘记关闭
browser = create_browser()
try:
    page = browser.goto('https://www.baidu.com')
finally:
    browser.close()  # 容易忘记
```

### 5.2 错误处理

#### 分层错误处理

```python
from browser_interface import create_browser, SecurityError

def robust_operation(url):
    """健壮的浏览器操作"""
    try:
        with create_browser() as browser:
            page = browser.goto(url)
            
            # 验证访问成功
            if not page.title():
                raise Exception('页面标题为空')
            
            return {'success': True, 'title': page.title()}
            
    except SecurityError as e:
        return {'success': False, 'error_type': 'security', 'error': str(e)}
    except Exception as e:
        return {'success': False, 'error_type': 'general', 'error': str(e)}
```

### 5.3 配置管理

#### 使用标准配置

```python
# ✅ 推荐 - 使用内置配置
from browser_interface import stealth_mode, headless_mode

with stealth_mode() as browser:
    # 使用经过验证的隐匿配置
    pass

# 不推荐 - 手动配置复杂参数
config = {
    'args': ['--disable-blink-features=AutomationControlled', ...] # 太复杂
}
```

### 5.4 性能优化

#### 无头模式提优

```python
# 对于自动化任务，使用无头模式
from browser_interface import headless_mode

with headless_mode() as browser:
    # 后台运行，性能更好
    page = browser.goto('https://www.baidu.com')
```

#### 批量操作优化

```python
from browser_interface import create_browser

def batch_process(urls):
    """批量处理，复用浏览器实例"""
    results = []
    
    with create_browser() as browser:
        for url in urls:
            try:
                page = browser.goto(url)
                results.append({
                    'url': url,
                    'success': True,
                    'title': page.title()
                })
            except Exception as e:
                results.append({
                    'url': url,
                    'success': False,
                    'error': str(e)
                })
    
    return results
```

## 6. 常见场景

### 6.1 网站爬取

```python
from browser_interface import create_browser
import json

def scrape_website(url):
    """爬取网站基本信息"""
    with create_browser() as browser:
        page = browser.goto(url)
        
        # 等待页面加载
        import time
        time.sleep(2)
        
        # 提取信息
        data = {
            'url': page.url(),
            'title': page.title(),
            'timestamp': time.time()
        }
        
        # 尝试提取更多信息
        try:
            # 提取描述
            description = page.text_content('meta[name="description"]')
            if description:
                data['description'] = description.strip()
        except:
            pass
        
        try:
            # 提取关键词
            keywords = page.text_content('meta[name="keywords"]')
            if keywords:
                data['keywords'] = keywords.strip()
        except:
            pass
        
        # 截图
        screenshot_name = f'{url.replace("https://", "")}.png'
        page.screenshot(screenshot_name)
        data['screenshot'] = screenshot_name
        
        return data

# 批量爬取
sites = ['https://www.baidu.com', 'https://weibo.com']
for site in sites:
    data = scrape_website(site)
    print(f'爬取结果: {data["title"]}')
```

### 6.2 自动化测试

```python
from browser_interface import create_browser

def test_website_functionality(url):
    """网站功能测试"""
    test_results = []
    
    with create_browser() as browser:
        page = browser.goto(url)
        
        # 测试1: 页面加载
        if page.title():
            test_results.append({'test': '页面加载', 'status': 'PASS'})
        else:
            test_results.append({'test': '页面加载', 'status': 'FAIL', 'error': '无标题'})
        
        # 测试2: 导航功能
        try:
            page.evaluate('window.location.href = "#test"')
            time.sleep(1)
            if '#test' in page.url():
                test_results.append({'test': '页面导航', 'status': 'PASS'})
            else:
                test_results.append({'test': '页面导航', 'status': 'FAIL'})
        except:
            test_results.append({'test': '页面导航', 'status': 'ERROR'})
        
        # 测试3: JavaScript 执行
        try:
            result = page.evaluate('1 + 1')
            if result == 2:
                test_results.append({'test': 'JavaScript执行', 'status': 'PASS'})
            else:
                test_results.append({'test': 'JavaScript执行', 'status': 'FAIL'})
        except:
            test_results.append({'test': 'JavaScript执行', 'status': 'ERROR'})
    
    return {
        'url': url,
        'timestamp': time.time(),
        'results': test_results,
        'passed': len([r for r in test_results if r['status'] == 'PASS']),
        'total': len(test_results)
    }

# 使用
test_result = test_website_functionality('https://www.baidu.com')
print(f'测试结果: {test_result["passed"]}/{test_result["total"]} 通过')
```

## 7. 性能优化

### 7.1 浏览器启动优化

```python
# 使用无头模式提升性能
from browser_interface import headless_mode

with headless_mode() as browser:
    # 后台运行，减少资源消耗
    page = browser.goto('https://www.baidu.com')
```

### 7.2 页面加载优化

```python
from browser_interface import create_browser

def optimized_page_load(url):
    """优化的页面加载"""
    config = {
        'headless': True,  # 无头模式
        'args': [
            '--disable-gpu',           # 禁用GPU
            '--no-sandbox',           # 禁用沙盒
            '--disable-dev-shm-usage', # 优化内存
            '--disable-images'         # 禁用图片加载
        ]
    }
    
    with create_browser(config=config) as browser:
        page = browser.goto(url)
        
        # 等待关键元素而非整个页面
        page.wait_for_selector('body', timeout=10000)
        
        return {
            'url': url,
            'title': page.title(),
            'loaded': True
        }
```

### 7.3 内存管理

```python
from browser_interface import create_browser

def memory_efficient_processing(urls):
    """内存高效的处理"""
    results = []
    
    for i, url in enumerate(urls):
        # 每处理一定数量后重新创建浏览器
        if i % 10 == 0:
            # 清理内存
            import gc
            gc.collect()
        
        with create_browser() as browser:
            page = browser.goto(url)
            results.append({
                'url': url,
                'title': page.title()
            })
            # 浏览器自动关闭，释放内存
    
    return results
```

---

## 📚 延伸阅读

- 🏗️ [架构设计文档](ARCHITECTURE.md) - 深入理解抽象层设计
- 🛠️ [API 参考文档](API_REFERENCE.md) - 完整API说明
- 🐛 [故障排除指南](TROUBLESHOOTING.md) - 常见问题解决
- 💡 [使用示例](EXAMPLES.md) - 更多实战示例

---

## 🎉 总结

WebAuto 浏览器模块提供了强大、安全、易用的浏览器自动化能力。通过掌握本指南的内容，你将能够：

- ✅ 安全地使用浏览器自动化
- ✅ 实现复杂的爬取和测试任务
- ✅ 优化性能和资源使用
- ✅ 处理各种异常情况
- ✅ 开发高质量的应用程序

**开始你的浏览器自动化之旅吧！** 🚀
