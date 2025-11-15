# WebAuto 浏览器模块 - 故障排除指南

## 📖 目录

- [1. 常见问题]\(#1-常见问题\)
- [2. 安装问题]\(#2-安装问题\)
- [3. 运行时问题]\(#3-运行时问题\)
- [4. 安全问题]\(#4-安全问题\)
- [5. 性能问题]\(#5-性能问题\)
- [6. 平台特定问题]\(#6-平台特定问题\)
- [7. 调试技巧]\(#7-调试技巧\)
- [8. 获取帮助]\(#8-获取帮助\)

## 1. 常见问题

### 1.1 ImportError: No module named 'browser_interface'

#### 问题描述
```python
from browser_interface import create_browser
# ImportError: No module named 'browser_interface'
```

#### 原因分析
1. `browser_interface.py` 文件不在当前目录
2. Python 路径配置问题
3. 文件名错误或文件损坏

#### 解决方案

**方案1：检查文件位置**
```bash
# 确保在项目根目录
ls -la browser_interface.py

# 如果不在当前目录，找到正确路径
find . -name 'browser_interface.py'
```

**方案2：添加路径**
```python
import sys
import os

# 添加项目根目录到 Python 路径
project_root = os.path.dirname\(os.path.abspath\(__file__\)\)
sys.path.insert\(0, project_root\)

from browser_interface import create_browser
```

**方案3：使用相对导入**
```python
# 如果在子目录中
from ..browser_interface import create_browser
```

### 1.2 SecurityViolationError: 禁止访问底层浏览器实现

#### 问题描述
```python
SecurityViolationError: 禁止访问底层浏览器实现!
违规文件: your_file.py
违规模块: your_module
```

#### 原因分析
1. 尝试导入被禁止的模块（playwright、camoufox 等）
2. 直接使用底层浏览器类
3. 文件包含禁止的导入语句

#### 解决方案

**正确使用方式：**
```python
# ✅ 正确：只能这样导入
from browser_interface import create_browser, quick_test, stealth_mode

# ❌ 错误：这些都会被阻止
from playwright.sync_api import sync_playwright     # 禁止
from camoufox import NewBrowser                    # 禁止
from selenium import webdriver                     # 禁止
from libs.browser import CamoufoxBrowser           # 禁止
```

**违规文件修复：**
```python
# 删除所有这些导入
# from playwright.sync_api import sync_playwright
# from camoufox import NewBrowser
# from selenium import webdriver

# 替换为安全的方式
from browser_interface import create_browser

# 替换现有代码
# playwright = sync_playwright\(\).start\(\)
# browser = NewBrowser\(playwright=playwright\)

# 改为
with create_browser\(\) as browser:
    # 你的代码
    pass
```

### 1.3 浏览器启动失败

#### 问题描述
```python
# 浏览器启动后立即关闭
# 或者报错：浏览器启动失败
```

#### 原因分析
1. Camoufox 未正确安装
2. 浏览器二进制文件缺失
3. 系统权限问题
4. 网络连接问题

#### 解决方案

**方案1：检查安装**
```bash
# 检查 Camoufox 安装
pip list | grep camoufox

# 重新安装
pip uninstall camoufox
pip install camoufox playwright

# 下载浏览器二进制文件
python3 -m camoufox fetch
```

**方案2：使用无头模式**
```python
from browser_interface import headless_mode

# 使用无头模式避免显示问题
with headless_mode\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    print\(f'无头模式成功: {page.title\(\)}'\)
```

**方案3：检查权限**
```bash
# macOS/Linux
chmod +x ~/.local/share/camoufox/Camoufox.app/Contents/MacOS/camoufox

# 或使用 sudo 运行（不推荐）
# sudo python your_script.py
```

### 1.4 元素操作失败

#### 问题描述
```python
# 元素找不到或点击失败
# TimeoutError: 元素等待超时
```

#### 原因分析
1. 页面未完全加载
2. 元素选择器错误
3. 元素被隐藏或不存在
4. 等待时间不够

#### 解决方案

**方案1：增加等待时间**
```python
import time
from browser_interface import create_browser

with create_browser\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    
    # 等待页面加载
    time.sleep\(2\)
    
    # 或使用更长的超时时间
    page.click\('#su', timeout=30000\)  # 30秒
```

**方案2：使用正确的选择器**
```python
# 检查元素选择器
with create_browser\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    
    # 使用开发者工具确认选择器
    # 百度搜索框：#kw
    # 百度搜索按钮：#su
    
    # 如果不确定，可以使用更通用的选择器
    page.fill\('input[name="wd"]', '搜索内容'\)
    page.click\('input[type="submit"]'\)
```

**方案3：使用智能等待**
```python
# 自定义等待函数
def wait_for_element\(page, selector, timeout=10\):
    import time
    start_time = time.time\(\)
    
    while time.time\(\) - start_time < timeout:
        try:
            element = page.query_selector\(selector\)
            if element and element.is_visible\(\):
                return element
        except:
            pass
        time.sleep\(0.5\)
    
    raise Exception\(f'元素 {selector} 在 {timeout} 秒内未出现'\)

# 使用
with create_browser\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    search_input = wait_for_element\(page, '#kw'\)
    search_input.fill\('Python'\)
```

## 2. 安装问题

### 2.1 Camoufox 安装失败

#### 问题描述
```bash
pip install camoufox
# ERROR: Could not install packages due to EnvironmentError
```

#### 解决方案

**方案1：使用管理员权限**
```bash
# macOS/Linux
sudo pip install camoufox

# Windows（以管理员身份运行 PowerShell）
pip install camoufox
```

**方案2：使用用户安装**
```bash
pip install --user camoufox
```

**方案3：升级 pip 和 setuptools**
```bash
pip install --upgrade pip setuptools
pip install camoufox
```

**方案4：使用国内镜像**
```bash
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple camoufox
```

### 2.2 Playwright 安装问题

#### 问题描述
```bash
pip install playwright
# 需要手动安装浏览器
playwright install
# 下载失败或很慢
```

#### 解决方案

**方案1：手动安装浏览器**
```bash
playwright install chromium
playwright install firefox
```

**方案2：使用国内镜像**
```bash
# 设置环境变量
export PLAYWRIGHT_DOWNLOAD_HOST=https://playwright.azureedge.net

# 然后安装
playwright install
```

**方案3：跳过浏览器安装**
```bash
# 如果使用 Camoufox，可以跳过 Playwright 浏览器安装
pip install playwright --no-deps
```

## 3. 运行时问题

### 3.1 网络连接问题

#### 问题描述
```python
# 访问网站失败
# ConnectionError: Failed to establish connection
```

#### 解决方案

**方案1：检查网络连接**
```bash
ping www.baidu.com
curl -I https://www.baidu.com
```

**方案2：使用代理**
```python
# 如果需要代理，可以配置浏览器参数
config = {
    'args': [
        '--proxy-server=http://proxy-server:port',
        '--proxy-bypass-list=localhost,127.0.0.1'
    ]
}

with create_browser\(config=config\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
```

**方案3：增加超时时间**
```python
# 在浏览器配置中设置更长的超时
config = {
    'args': [
        '--timeout=60000'  # 60秒超时
    ]
}

with create_browser\(config=config\) as browser:
    # 设置页面超时
    page.set_default_timeout\(60000\)
    page.goto\('https://www.baidu.com'\)
```

### 3.2 内存不足问题

#### 问题描述
```python
# 程序运行一段时间后内存占用过高
# 系统变慢或崩溃
```

#### 解决方案

**方案1：使用无头模式**
```python
from browser_interface import headless_mode

# 无头模式占用更少内存
with headless_mode\(\) as browser:
    # 你的操作
    pass
```

**方案2：定期重启浏览器**
```python
from browser_interface import create_browser

def batch_process\(urls, batch_size=10\):
    results = []
    
    for i in range\(0, len\(urls\), batch_size\):
        batch = urls[i:i + batch_size]
        
        with create_browser\(\) as browser:
            for url in batch:
                try:
                    page = browser.goto\(url\)
                    results.append\({'url': url, 'success': True}\)
                except Exception as e:
                    results.append\({'url': url, 'success': False, 'error': str\(e\)}\)
        
        # 浏览器自动关闭，释放内存
    
    return results
```

**方案3：优化内存配置**
```python
config = {
    'args': [
        '--disable-gpu',                    # 禁用GPU
        '--no-sandbox',                    # 禁用沙盒
        '--disable-dev-shm-usage',         # 优化共享内存
        '--disable-software-rasterizer',    # 禁用软件光栅化
        '--disable-background-timer-throttling',  # 禁用后台定时器限制
    ]
}

with create_browser\(config=config\) as browser:
    # 你的操作
    pass
```

### 3.3 中文字符显示问题

#### 问题描述
```python
# 页面中文字符显示为方框或乱码
# 中文输入不正常
```

#### 解决方案

**方案1：检查系统字体**
```bash
# macOS
fc-list :lang=zh

# 如果没有中文字体，安装
# brew install font-source-han-sans
```

**方案2：强制中文配置**
```python
config = {
    'locale': 'zh-CN',
    'args': [
        '--lang=zh-CN',
        '--force-charset=UTF-8',
        '--font-family="PingFang SC", "Microsoft YaHei", sans-serif'
    ]
}

with create_browser\(config=config\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    print\(f'中文测试: {page.title\(\)}'\)  # 应该正确显示中文
```

**方案3：注入 CSS 确保字体**
```python
with create_browser\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    
    # 注入中文字体 CSS
    page.add_style_tag\(content="""
        html, body, * {
            font-family: "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif !important;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
        }
    """\)
```

## 4. 安全问题

### 4.1 安全检查过于严格

#### 问题描述
```python
# 合理的代码也被安全检查阻止
# SecurityViolationError: 禁止访问底层浏览器实现
```

#### 解决方案

**方案1：检查代码合规性**
```python
# 确保只从正确位置导入
from browser_interface import create_browser  # ✅

# 不要在任何地方导入这些
# from playwright import sync_playwright    # ❌
# from camoufox import NewBrowser           # ❌
```

**方案2：检查文件内容**
```python
# 运行安全检查报告
from access_control_fixed import AccessController

report = AccessController.get_safety_report\('.'\)
print\(f'不安全文件: {report["unsafe_files_list"]}'\)
```

**方案3：使用函数式编程**
```python
# ✅ 推荐：使用函数式，避免直接导入
from browser_interface import quick_test, stealth_mode

# ❌ 避免：复杂的导入和实例化
```

### 4.2 动态导入问题

#### 问题描述
```python
# 动态导入导致安全检查失败
# 动态创建浏览器实例被阻止
```

#### 解决方案

**方案1：避免动态导入**
```python
# ✅ 推荐：静态导入
from browser_interface import create_browser

with create_browser\(\) as browser:
    pass

# ❌ 避免：动态导入
import importlib
module = importlib.import_module\('browser_interface'\)  # 可能触发安全检查
```

**方案2：使用工厂模式**
```python
# ✅ 使用内置的工厂函数
from browser_interface import create_browser, stealth_mode, headless_mode

def get_browser\(mode='standard'\):
    if mode == 'stealth':
        return stealth_mode\(\)
    elif mode == 'headless':
        return headless_mode\(\)
    else:
        return create_browser\(\)
```

## 5. 性能问题

### 5.1 启动速度慢

#### 问题描述
```python
# 浏览器启动时间很长
# 每次创建浏览器都需要等待
```

#### 解决方案

**方案1：复用浏览器实例**
```python
from browser_interface import create_browser

class BrowserManager:
    def __init__\(self\):
        self.browser = None
    
    def get_browser\(self\):
        if self.browser is None:
            self.browser = create_browser\(\)
        return self.browser
    
    def close\(self\):
        if self.browser:
            self.browser.close\(\)
            self.browser = None

# 使用
manager = BrowserManager\(\)
browser = manager.get_browser\(\)
# 多次使用同一个浏览器实例
```

**方案2：预热浏览器**
```python
# 在程序启动时预热浏览器
from browser_interface import headless_mode

def preload_browser\(\):
    try:
        with headless_mode\(\) as browser:
            browser.new_page\(\)  # 预热
    except:
        pass

# 在程序启动时调用
preload_browser\(\)
```

**方案3：优化启动参数**
```python
config = {
    'args': [
        '--disable-extensions',             # 禁用扩展
        '--disable-images',                # 禁用图片
        '--disable-javascript',             # 禁用JS（如果不需要）
        '--disable-web-security',           # 禁用安全检查
        '--no-first-run',                  # 跳过首次运行
        '--disable-default-apps',           # 禁用默认应用
    ]
}

with create_browser\(config=config\) as browser:
    # 你的操作
    pass
```

### 5.2 页面加载慢

#### 问题描述
```python
# 页面加载时间很长
# 操作响应慢
```

#### 解决方案

**方案1：禁用不必要的功能**
```python
config = {
    'args': [
        '--disable-extensions',             # 禁用扩展
        '--disable-images',                # 禁用图片
        '--disable-css',                  # 禁用CSS（如果不需要）
        '--disable-javascript-harmony-shim',  # 禁用JS兼容层
    ]
}

with create_browser\(config=config\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
```

**方案2：设置页面加载策略**
```python
with create_browser\(\) as browser:
    page = browser.new_page\(\)
    
    # 等待最小内容加载
    page.goto\('https://www.baidu.com', wait_until='domcontentloaded'\)
    
    # 或者只等待页面开始加载
    # page.goto\('https://www.baidu.com', wait_until='commit'\)
```

**方案3：并行处理**
```python
import concurrent.futures
from browser_interface import create_browser

def process_url\(url\):
    with create_browser\(\) as browser:
        page = browser.goto\(url\)
        return {'url': url, 'title': page.title\(\)}

urls = ['https://www.baidu.com', 'https://weibo.com', 'https://www.zhihu.com']

# 并行处理
with concurrent.futures.ThreadPoolExecutor\(max_workers=3\) as executor:
    futures = [executor.submit\(process_url, url\) for url in urls]
    results = [future.result\(\) for future in concurrent.futures.as_completed\(futures\)]

print\(results\)
```

## 6. 平台特定问题

### 6.1 macOS 问题

#### 问题描述
```python
# macOS 上的权限问题
# 浏览器无法启动或崩溃
```

#### 解决方案

**方案1：授予权限**
```bash
# 1. 给予完整磁盘访问权限
# 系统偏好设置 > 安全性与隐私 > 隐私 > 完整磁盘访问权限
# 添加 Terminal 或 Python

# 2. 给予辅助功能权限
# 系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能
# 添加 Terminal 或 Python
```

**方案2：使用无沙盒模式**
```python
config = {
    'args': [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security'
    ]
}

with create_browser\(config=config\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
```

### 6.2 Linux 问题

#### 问题描述
```python
# Linux 上的显示问题
# 无头模式无法运行
```

#### 解决方案

**方案1：安装依赖**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    libgbm-dev \
    libxss1 \
    libgconf-2-4 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2
```

**方案2：使用 xvfb**
```bash
# 安装 xvfb
sudo apt-get install xvfb

# 使用 xvfb 运行
xvfb-run python your_script.py
```

### 6.3 Windows 问题

#### 问题描述
```python
# Windows 上的路径问题
# 浏览器二进制文件找不到
```

#### 解决方案

**方案1：使用正确的路径分隔符**
```python
import os

# 路径使用 os.path.join
cache_path = os.path.join\(os.path.expanduser\('~'\), '.cache', 'camoufox'\)
```

**方案2：设置环境变量**
```python
import os

os.environ['TEMP'] = 'C:\\temp'
os.environ['TMP'] = 'C:\\tmp'
```

## 7. 调试技巧

### 7.1 启用调试模式

```python
import logging

# 启用详细日志
logging.basicConfig\(
    level=logging.DEBUG,
    format='%\(asctime\)s - %\(name\)s - %\(levelname\)s - %\(message\)s'
\)

from browser_interface import create_browser

with create_browser\(\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
```

### 7.2 使用开发者工具

```python
from browser_interface import create_browser

config = {
    'args': [
        '--auto-open-devtools-for-tabs',  # 自动打开开发者工具
        '--start-maximized'              # 最大化窗口
    ]
}

with create_browser\(config=config\) as browser:
    page = browser.goto\('https://www.baidu.com'\)
    
    # 在开发者工具中调试
    import time
    time.sleep\(10\)  # 留时间调试
```

### 7.3 截图调试

```python
from browser_interface import create_browser
import time
import os

def debug_screenshots\(url, filename_prefix='debug'\):
    with create_browser\(\) as browser:
        page = browser.goto\(url\)
        
        # 不同步骤的截图
        screenshot_dir = 'debug_screenshots'
        os.makedirs\(screenshot_dir, exist_ok=True\)
        
        # 初始状态
        page.screenshot\(f'{screenshot_dir}/{filename_prefix}_01_initial.png'\)
        
        # 操作后状态
        page.fill\('#kw', 'Python'\)
        page.screenshot\(f'{screenshot_dir}/{filename_prefix}_02_filled.png'\)
        
        page.click\('#su'\)
        time.sleep\(2\)
        page.screenshot\(f'{screenshot_dir}/{filename_prefix}_03_clicked.png'\)

# 使用
debug_screenshots\('https://www.baidu.com', 'baidu_search'\)
```

### 7.4 错误日志记录

```python
import logging
import traceback
from datetime import datetime

def setup_error_logging\(\):
    # 设置错误日志
    error_log = 'browser_errors.log'
    
    logging.basicConfig\(
        level=logging.ERROR,
        format='%\(asctime\)s - %\(levelname\)s - %\(message\)s',
        handlers=[
            logging.FileHandler\(error_log\),
            logging.StreamHandler\(\)
        ]
    \)

def safe_browser_operation\(url\):
    try:
        from browser_interface import create_browser
        
        with create_browser\(\) as browser:
            page = browser.goto\(url\)
            return {'success': True, 'title': page.title\(\)}
            
    except Exception as e:
        error_msg = f"操作失败: {url} - {str\(e\)}\n{traceback.format_exc\(\)}"
        logging.error\(error_msg\)
        
        return {
            'success': False, 
            'error': str\(e\),
            'timestamp': datetime.now\(\).isoformat\(\)
        }

# 使用
setup_error_logging\(\)
result = safe_browser_operation\('https://www.baidu.com'\)
print\(result\)
```

## 8. 获取帮助

### 8.1 社区支持

- **GitHub Issues**: [提交问题]\(https://github.com/webauto/browser/issues\)
- **讨论区**: [GitHub Discussions]\(https://github.com/webauto/browser/discussions\)
- **文档**: [在线文档]\(https://docs.webauto.dev\)

### 8.2 常用命令

```bash
# 检查安装状态
python -c "from browser_interface import create_browser; print\('安装正常'\)"

# 运行安全检查
python -m access_control_fixed

# 测试浏览器功能
python -m browser_interface

# 查看版本信息
python -c "from browser_interface import __version__; print\(__version__\)"
```

### 8.3 问题报告模板

```markdown
## 问题描述

### 复现步骤
1. 执行代码：
```python
# 你的代码
```

2. 预期结果：

3. 实际结果：

### 环境信息
- 操作系统：
- Python 版本：
- 浏览器模块版本：
- Camoufox 版本：
- Playwright 版本：

### 错误信息
```
错误堆栈信息
```

### 附加信息
- 是否在虚拟环境中：
- 是否使用代理：
- 其他相关信息：
```

---

## 总结

通过本故障排除指南，你应该能够解决大部分常见的使用问题。如果问题仍然存在，请：

1. 查阅 [用户指南]\(USER_GUIDE.md\) 获取更多详细信息
2. 查看 [API 文档]\(API_REFERENCE.md\) 了解正确用法
3. 参考 [使用示例]\(EXAMPLES.md\) 学习最佳实践
4. 在 GitHub 上提交 Issue 寻求社区帮助

**记住：始终通过 `browser_interface` 进行所有浏览器操作！**
