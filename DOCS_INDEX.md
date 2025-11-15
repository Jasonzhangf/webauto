# WebAuto 文档中心

## 📚 完整文档体系

### 🚀 快速开始
- **[README.md](README.md)** - 项目主页和快速开始
- **[docs/QUICK_START.md](docs/QUICK_START.md)** - 5分钟快速上手
- **[FINAL_USAGE_SUMMARY.md](FINAL_USAGE_SUMMARY.md)** - 最终使用总结

### 📖 详细文档
- **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** - 完整用户指南
- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - 完整 API 参考文档
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - 架构设计文档

### 💻 使用示例
- **[docs/EXAMPLES.md](docs/EXAMPLES.md)** - 丰富的使用示例
- **[browser_usage_examples.py](browser_usage_examples.py)** - 基础使用示例代码
- **[advanced_usage_examples.py](advanced_usage_examples.py)** - 高级用法示例
- **[mini_project_example.py](mini_project_example.py)** - 完整项目示例

### 🐛 故障排除
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - 故障排除指南
- **[browser_validation.py](browser_validation.py)** - 配置验证工具

### 🏗️ 架构相关
- **[ABSTRACT_BROWSER_ARCHITECTURE.md](ABSTRACT_BROWSER_ARCHITECTURE.md)** - 抽象架构文档
- **[BROWSER_ARCHITECTURE_SUMMARY.md](BROWSER_ARCHITECTURE_SUMMARY.md)** - 浏览器架构总结
- **[HOW_TO_USE_BROWSER_MODULE.md](HOW_TO_USE_BROWSER_MODULE.md)** - 模块使用方法

## 🎯 核心文件说明

### 🌟 统一入口
- **[browser_interface.py](browser_interface.py)** - 唯一浏览器接口入口

### 🔒 安全控制
- **[abstract_browser.py](abstract_browser.py)** - 抽象浏览器接口
- **[access_control_fixed.py](access_control_fixed.py)** - 访问控[libs/browser/](libs/browser/)** - 浏览器底层实现模块

## 🚀 5分钟开始

### 1. 快速测试
```python
from browser_interface import quick_test
quick_test()
```

### 2. 基础使用
```python
from browser_interface import create_browser

with create_browser() as browser:
    page = browser.goto('https://www.baidu.com')
    print(page.title())
```

### 3. 隐匿模式
```python
from browser_interface import stealth_mode

with stealth_mode() as browser:
    page = browser.goto('https://example.com')
    print(page.title())
```

## 🛠️ 常用场景

### 网站信息采集
```python
from browser_interface import create_browser

def get_website_info(url):
    with create_browser() as browser:
        page = browser.goto(url)
        return {
            'title': page.title(),
            'url': page.url()
        }
```

### 百度搜索自动化
```python
from browser_interface import create_browser

def baidu_search(keyword):
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        page.fill('#kw', keyword)
        page.click('#su')
        return page.title()
```

### 批量网站截图
```python
from browser_interface import create_browser

def screenshot_websites(urls):
    with create_browser() as browser:
        for url in urls:
            page = browser.goto(url)
            filename = f'{url.replace("https://", "").replace("/", "_")}.png'
            page.screenshot(filename)
```

## 🔒 安全使用规范

### ✅ 正确方式
```python
# 只能这样导入
from browser_interface import create_browser, quick_test, stealth_mode

# 安全的使用
with create_browser() as browser:
    page = browser.goto('https://example.com')
    print(page.title())
```

### ❌ 禁止方式
```python
# 这些都会被安全系统阻止
from playwright.sync_api import sync_playwright     # ❌ 禁止
from camoufox import NewBrowser                    # ❌ 禁止
from selenium import webdriver                     # ❌ 禁止
from libs.browser import CamoufoxBrowser           # ❌ 禁止
```

## 📋 API 快速参考

| 函数 | 描述 | 示例 |
|------|------|------|
| `create_browser()` | 创建标准浏览器 | `with create_browser() as browser:` |
| `quick_test()` | 快速测试 | `quick_test()` |
| `stealth_mode()` | 隐匿模式 | `with stealth_mode() as browser:` |
| `headless_mode()` | 无头模式 | `with headless_mode() as browser:` |

### 浏览器方法
| 方法 | 描述 | 示例 |
|------|------|------|
| `goto(url)` | 导航到URL | `page = browser.goto('https://baidu.com')` |
| `new_page()` | 创建新页面 | `page = browser.new_page()` |
| `get_status()` | 获取状态 | `status = browser.get_status()` |

### 页面方法
| 方法 | 描述 | 示例 |
|------|------|------|
| `title()` | 获取标题 | `title = page.title()` |
| `click(selector)` | 点击元素 | `page.click('#button')` |
| `fill(selector, text)` | 填写输入框 | `page.fill('#input', 'text')` |
| `screenshot(filename)` | 截图 | `page.screenshot('screenshot.png')` |
| `evaluate(script)` | 执行JS | `result = page.evaluate('1+1')` |

## 🎯 学习路径

### 初级用户（1天）
1. 阅读 [快速开始指南](docs/QUICK_START.md)
2. 运行基础示例代码
3. 理解安全使用原则

### 中级用户（3天）
1. 学习 [用户指南](docs/USER_GUIDE.md)
2. 查看 [API 文档](docs/API_REFERENCE.md)
3. 运行高级示例代码

### 高级用户（1周）
1. 理解 [架构设计](docs/ARCHITECTURE.md)
2. 开发完整项目
3. 优化性能和资源管理

## 🚨 重要提醒

### 安全第一
- **只能通过 `browser_interface.py` 导入**
- **禁止直接访问底层库**
- **使用上下文管理器确保资源清理**

### 最佳实践
- **使用内置配置而非自定义复杂参数**
- **及时处理异常和错误**
- **定期检查和安全验证**

### 性能优化
- **无头模式适合自动化任务**
- **复用浏览器实例而非频繁创建**
- **合理设置超时和等待时间**

## 🔗 相关资源

### GitHub 仓库
- **主仓库**: [webauto/browser](https://github.com/webauto/browser)
- **问题反馈**: [GitHub Issues](https://github.com/webauto/browser/issues)
- **讨论区**: [GitHub Discussions](https://github.com/webauto/browser/discussions)

### 依赖项目
- **[Camoufox](https://github.com/daijro/camoufox)** - 反检测浏览器
- **[Playwright](https://playwright.dev/)** - 自动化框架

### 在线文档
- **在线文档**: https://docs.webauto.dev
- **API 参考**: https://api.webauto.dev
- **示例集合**: https://examples.webauto.dev

---

## 🎉 开始你的浏览器自动化之旅！

通过这个完整的文档体系，你现在可以：

- ✅ **5分钟快速上手** - 快速开始指南
- ✅ **深入理解架构** - 架构设计文档  
- ✅ **掌握所有功能** - 完整 API 参考
- ✅ **解决常见问题** - 故障排除指南
- ✅ **学习最佳实践** - 丰富使用示例
- ✅ **确保安全使用** - 三层安全防护

**🚀 现在就开始你的第一个浏览器自动化项目吧！**
