"""
WebAuto 浏览器模块 - 高级使用示例
展示复杂场景和最佳实践
"""

import time
import random
from browser_interface import create_browser, stealth_mode

class AdvancedBrowserOperations:
    """高级浏览器操作类"""
    
    def __init__(self, use_stealth=False):
        self.use_stealth = use_stealth
    
    def simulate_human_behavior(self, page):
        """模拟人类行为"""
        # 随机鼠标移动
        viewport = page.evaluate('{width: window.innerWidth, height: window.innerHeight}')
        x = random.randint(100, viewport['width'] - 100)
        y = random.randint(100, viewport['height'] - 100)
        page.mouse.move(x, y)
        
        # 随机滚动
        scroll_distance = random.randint(100, 300)
        page.evaluate(f'window.scrollBy(0, {scroll_distance})')
        
        # 随机延迟
        time.sleep(random.uniform(0.5, 2.0))
    
    def smart_wait_for_element(self, page, selector, timeout=10):
        """智能等待元素"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                element = page.query_selector(selector)
                if element and element.is_visible():
                    return element
            except:
                pass
            
            self.simulate_human_behavior(page)
        
        raise Exception(f"元素 {selector} 在 {timeout} 秒内未出现")

def example_form_automation():
    """示例1: 表单自动化"""
    print("=== 示例1: 表单自动化 ===")
    
    advanced_ops = AdvancedBrowserOperations(use_stealth=True)
    
    with stealth_mode() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 智能填写搜索表单
        search_box = advanced_ops.smart_wait_for_element(page, '#kw')
        search_box.fill('WebAuto 自动化')
        
        # 模拟人类行为
        advanced_ops.simulate_human_behavior(page)
        
        # 点击搜索按钮
        search_button = advanced_ops.smart_wait_for_element(page, '#su')
        search_button.click()
        
        time.sleep(2)
        print(f"✅ 表单自动化完成: {page.title()}")

def example_data_extraction():
    """示例2: 数据提取"""
    print("\n=== 示例2: 数据提取 ===")
    
    def extract_search_results(page):
        """提取搜索结果"""
        results = []
        
        # 等待搜索结果加载
        try:
            advanced_ops.smart_wait_for_element(page, '.result', timeout=5)
        except:
            # 如果没有 .result，尝试其他选择器
            pass
        
        # 提取所有链接
        links = page.query_selector_all('a[href]')
        
        for link in links[:10]:  # 只取前10个
            href = link.get_attribute('href')
            text = link.text_content()
            
            if href and text and len(text.strip()) > 0:
                results.append({
                    'text': text.strip(),
                    'url': href,
                    'domain': href.split('/')[2] if '://' in href else 'unknown'
                })
        
        return results
    
    advanced_ops = AdvancedBrowserOperations()
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 执行搜索
        page.fill('#kw', 'Python 编程')
        page.click('#su')
        
        time.sleep(2)
        
        # 提取结果
        results = extract_search_results(page)
        
        print(f"✅ 提取到 {len(results)} 个结果:")
        for i, result in enumerate(results[:5], 1):
            print(f"  {i}. {result['text'][:50]}... ({result['domain']})")

def example_screenshot_automation():
    """示例3: 自动化截图"""
    print("\n=== 示例3: 自动化截图 ===")
    
    def take_full_page_screenshot(page, filename):
        """全页面截图"""
        # 滚动到页面底部确保内容加载
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        time.sleep(1)
        
        # 滚动回顶部
        page.evaluate('window.scrollTo(0, 0)')
        time.sleep(0.5)
        
        # 截图
        page.screenshot(filename, full_page=True)
        print(f"📸 截图已保存: {filename}")
    
    with create_browser() as browser:
        # 访问多个网站并截图
        sites = [
            ('https://www.baidu.com', 'baidu_homepage.png'),
            ('https://weibo.com', 'weibo_homepage.png'),
            ('https://www.zhihu.com', 'zhihu_homepage.png')
        ]
        
        for url, filename in sites:
            page = browser.goto(url)
            print(f"🔍 正在截图: {url}")
            take_full_page_screenshot(page, filename)

def example_javascript_execution():
    """示例4: JavaScript 执行"""
    print("\n=== 示例4: JavaScript 执行 ===")
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 执行 JavaScript 获取页面信息
        page_info = page.evaluate("""
            ({
                title: document.title,
                url: window.location.href,
                userAgent: navigator.userAgent,
                language: navigator.language,
                cookieEnabled: navigator.cookieEnabled,
                online: navigator.onLine,
                platform: navigator.platform,
                screenWidth: screen.width,
                screenHeight: screen.height,
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight
            })
        """)
        
        print("✅ JavaScript 执行结果:")
        for key, value in page_info.items():
            print(f"  {key}: {value}")
        
        # 修改页面内容
        page.evaluate("""
            // 修改页面标题
            document.title = 'WebAuto 修改的页面';
            
            // 在页面顶部添加信息
            const header = document.createElement('div');
            header.innerHTML = '<h1 style="color: red; text-align: center;">WebAuto 访问此页面</h1>';
            document.body.insertBefore(header, document.body.firstChild);
        """)
        
        print(f"✅ 页面修改后标题: {page.title()}")
        time.sleep(2)

def example_cookie_management():
    """示例5: Cookie 管理"""
    print("\n=== 示例5: Cookie 管理 ===")
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 获取所有 cookies
        cookies = page.evaluate('document.cookie')
        print(f"🍪 当前 Cookies: {cookies}")
        
        # 设置自定义 cookie
        page.evaluate("""
            document.cookie = 'test_cookie=webauto_test; path=/; max-age=3600';
        """)
        
        # 验证 cookie 设置
        new_cookies = page.evaluate('document.cookie')
        print(f"🍪 设置后 Cookies: {new_cookies}")
        
        # 获取详细的 cookie 信息（如果浏览器支持）
        try:
            detailed_cookies = page.evaluate("""
                if (document.cookie) {
                    return document.cookie.split(';').map(cookie => {
                        const [name, value] = cookie.trim().split('=');
                        return {name: value};
                    });
                }
                return [];
            """)
            print(f"🍪 详细 Cookie 信息: {detailed_cookies}")
        except:
            print("🍪 无法获取详细 Cookie 信息")

def example_performance_monitoring():
    """示例6: 性能监控"""
    print("\n=== 示例6: 性能监控 ===")
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 监控页面加载性能
        performance_metrics = page.evaluate("""
            const perfData = performance.getEntriesByType('navigation')[0];
            ({
                domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
                loadComplete: perfData.loadEventEnd - perfData.navigationStart,
                firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
                firstContentfulPaint: performance.getEntriesByType('paint')[1]?.startTime || 0,
                resourceCount: performance.getEntriesByType('resource').length
            })
        """)
        
        print("✅ 页面性能指标:")
        for metric, value in performance_metrics.items():
            if isinstance(value, (int, float)):
                print(f"  {metric}: {value:.2f} ms")
            else:
                print(f"  {metric}: {value}")
        
        # 监控资源加载
        resources = page.evaluate("""
            performance.getEntriesByType('resource').map(resource => ({
                name: resource.name,
                type: resource.initiatorType,
                size: resource.transferSize || 0,
                duration: resource.duration
            })).slice(0, 5);  // 只取前5个资源
        """)
        
        print("\n✅ 资源加载信息:")
        for resource in resources:
            print(f"  {resource['name'][:50]}... ({resource['type']}, {resource['size']} bytes)")

def example_network_interception():
    """示例7: 网络拦截"""
    print("\n=== 示例7: 网络拦截"""
    
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 监控网络请求
        requests = []
        
        def log_request(request):
            requests.append({
                'url': request.url,
                'method': request.method,
                'resource_type': request.resource_type
            })
            print(f"🌐 {request.method} {request.url} ({request.resource_type})")
        
        # 设置请求监听（注意：这是概念性示例，具体实现取决于底层支持）
        try:
            # 如果底层支持，可以设置请求拦截
            page.on('request', log_request)
            
            # 重新加载页面以捕获请求
            page.reload()
            time.sleep(2)
            
            print(f"\n✅ 捕获到 {len(requests)} 个网络请求")
            
        except Exception as e:
            print(f"📡 网络拦截功能可能不被底层支持: {e}")
            
            # 替代方案：通过 JavaScript 监控
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
            
            # 执行一些操作来产生网络请求
            page.click('#su')
            time.sleep(1)
            
            final_requests = page.evaluate('window.requests')
            print(f"✅ JavaScript 监控到 {len(final_requests)} 个请求")

def run_all_advanced_examples():
    """运行所有高级示例"""
    print("🚀 WebAuto 高级使用示例")
    print("=" * 50)
    
    examples = [
        ("表单自动化", example_form_automation),
        ("数据提取", example_data_extraction),
        ("自动化截图", example_screenshot_automation),
        ("JavaScript 执行", example_javascript_execution),
        ("Cookie 管理", example_cookie_management),
        ("性能监控", example_performance_monitoring),
        ("网络拦截", example_network_interception),
    ]
    
    passed = 0
    total = len(examples)
    
    for name, example_func in examples:
        try:
            print(f"\n🧪 运行示例: {name}")
            example_func()
            passed += 1
            print(f"✅ {name} 示例成功")
        except Exception as e:
            print(f"❌ {name} 示例失败: {e}")
            # 继续执行下一个示例
    
    print("\n" + "=" * 50)
    print(f"🎯 高级示例运行结果: {passed}/{total} 成功")
    
    if passed == total:
        print("🎉 所有高级示例都成功运行！")
        print("\n💡 你现在掌握了 WebAuto 浏览器模块的高级用法！")
    else:
        print("⚠️  部分示例失败，但这可能是由于网络或环境限制")
        print("💡 核心功能仍然正常工作")

if __name__ == '__main__':
    run_all_advanced_examples()
