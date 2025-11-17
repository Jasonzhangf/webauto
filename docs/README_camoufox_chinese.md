# Camoufox 中文配置指南

## 问题解决

经过多次测试，发现 Camoufox 中文乱码问题的根源是配置过于复杂。正确的解决方案是使用最小化但有效的配置。

## 核心配置

**成功的配置只需要两个参数：**

```python
{
    'locale': 'zh-CN',      # 设置浏览器语言环境
    'args': ['--lang=zh-CN']  # 设置浏览器语言
}
```

## 使用方法

### 方式1：函数式（推荐）

```python
from camoufox_final_setup import launch_camoufox_chinese

# 启动浏览器
playwright, browser = launch_camoufox_chinese(headless=False)

try:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(page.title())  # 输出：百度一下，你就知道
finally:
    browser.close()
    playwright.stop()
```

### 方式2：类式（自动管理资源）

```python
from camoufox_final_setup import CamoufoxChineseBrowser

# 使用上下文管理器
with CamoufoxChineseBrowser(headless=False) as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(page.title())
```

### 方式3：快速测试

```python
from camoufox_final_setup import CamoufoxChineseBrowser

browser = CamoufoxChineseBrowser(headless=False)
browser.start()
try:
    browser.quick_test('https://www.baidu.com', wait_time=3)
finally:
    browser.stop()
```

## 配置文件说明

- `camoufox_final_setup.py` - **最终版本**，使用最小化有效配置
- `camoufox_minimal_chinese.py` - 最小化配置测试版本
- `camoufox_chinese_setup.py` - 早期版本（配置过于复杂）
- `camoufox_browser.py` - 功能完整但配置复杂的版本

## 关键发现

1. **最小配置原则**：只需要 `locale='zh-CN'` 和 `args=['--lang=zh-CN']`
2. **避免过度配置**：过多的参数可能导致冲突
3. **系统字体支持**：macOS 系统自带中文字体支持良好
4. **UTF-8 自动处理**：浏览器会自动处理 UTF-8 编码

## 测试结果验证

成功的测试输出：
```
页面标题: 百度一下，你就知道
字符集: UTF-8, 语言: zh-CN
```

## 注意事项

- 确保系统有中文字体支持（macOS 默认支持）
- 避免添加不必要的参数
- 使用 `with` 语句确保资源正确释放
- 无头模式设置 `headless=True`

## 故障排除

如果仍有问题：
1. 检查系统字体：`fc-list :lang=zh`
2. 测试其他中文网站
3. 确认使用的是 `camoufox_final_setup.py` 中的配置

## 高级问题：中文变成「口口口」方框

在部分版本的 Camoufox 中，浏览器会通过指纹系统动态修改字体列表（`update_fonts`），某些随机组合可能会 **去掉 CJK 字体**，导致页面编码是 UTF-8，标题也是中文，但页面上所有汉字渲染成「口口口」方框。

### 现象特征

- `document.characterSet == 'UTF-8'`
- `page.title()` 输出正常中文
- 页面绝大部分正文/链接文字显示为方框（尤其是百度首页）

### WebAuto 中的解决方案

在 `browser_interface.py` 中已经内置了专门的修复逻辑：

- 启动时：
  - 禁用 Camoufox 默认扩展下载与路径校验；
  - Monkey patch `camoufox.utils.update_fonts`，**不再改动系统字体列表**，避免指纹算法把中文字体移除。
- 页面级别：
  - 在每次 `goto()` 后注入一段 CSS，强制使用常见中文字体栈：

    ```python
    html, body, * {
        font-family: "PingFang SC", "Microsoft YaHei", "SimHei",
                     system-ui, -apple-system, BlinkMacSystemFont,
                     sans-serif !important;
    }
    ```

只要通过统一入口使用浏览器，即可自动避开字体指纹带来的中文方框问题：

```python
from browser_interface import create_browser

with create_browser({'headless': False}) as browser:
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(page.title())
```

### 使用建议

- **不要** 在业务代码里直接调用 `camoufox.launch_options` / `update_fonts` / `custom_fonts_only` 等底层 API。
- 始终通过 `browser_interface.create_browser` 创建 Camoufox 实例，让字体与语言配置由统一入口托管。
- 如遇到旧 profile 仍然出现方框，可尝试关闭所有 Camoufox 进程后使用全新 profile 再次启动。
