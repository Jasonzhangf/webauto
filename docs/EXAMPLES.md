# WebAuto 浏览器模块 - 使用示例

## 📖 目录

- [1. 基础示例](#1-基础示例)
- [2. 进阶示例](#2-进阶示例)
- [3. 实战项目](#3-实战项目)
- [4. 最佳实践](#4-最佳实践)

## 1. 基础示例

### 1.1 快速开始

```python
from browser_interface import quick_test

# 一行代码测试百度
quick_test()

# 自定义测试
quick_test(url='https://weibo.com', wait_time=3)
```

### 1.2 基础浏览器操作

```python
from browser_interface import create_browser
def basic_browsing():
    """基础浏览器操作"""
    with create_browser() as browser:
        # 访问百度
        page = browser.goto('https://www.baidu.com')
        print(f'页面标题: {page.title()}')
        
        # 填写搜索框
        page.fill('#kw', 'Python 自动化')
        
        # 点击搜索按钮
        page.click('#su')
        
        # 等待结果
        import time
        time.sleep(2)
        
        print(f'搜索结果: {page.title()}')

basic_browsing()
```

### 1.3 多页面操作

```python
from browser_interface import create_browser
def multi_page_operations():
    """多页面操作"""
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
        
        # 回到页面1并搜索
        page1.click('#su')
        print(f'搜索完成: {page1.title()}')

multi_page_operations()
```

## 2. 进阶示例

### 2.1 隐匿模式爬取

```python
from browser_interface import stealth_mode
import time
import json

def stealth_scraping(url):
    """隐匿模式爬取"""
    with stealth_mode() as browser:
        page = browser.goto(url)
        
        # 模拟人类行为
        page.mouse.move(100, 100)
        time.sleep(1)
        
        page.evaluate('window.scrollBy(0, 200)')
        time.sleep(1)
        
        # 获取页面信息
        info = {
            'title': page.title(),
            'url': page.url(),
            'user_agent': page.evaluate('navigator.userAgent'),
            'has_webdriver': page.evaluate('navigator.webdriver !== undefined'),
            'timestamp': time.time()
        }
        
        return info

# 使用
result = stealth_scraping('https://bot.sannysoft.com')
print(f'隐匿模式结果: {result}')
```

### 2.2 无头模式批量处理

```python
from browser_interface import headless_mode
def batch_processing(urls):
    """批量处理多个URL"""
    results = []
    
    with headless_mode() as browser:
        for i, url in enumerate(urls, 1):
            try:
                page = browser.goto(url)
                
                result = {
                    'index': i,
                    'url': url,
                    'title': page.title(),
                    'success': True
                }
                
                print(f'{i}. {url} - {page.title()}')
                
            except Exception as e:
                result = {
                    'index': i,
                    'url': url,
                    'error': str(e),
                    'success': False
                }
                
                print(f'{i}. {url} - 失败: {e}')
            
            results.append(result)
    
    return results

# 使用
sites = [
    'https://www.baidu.com',
    'https://weibo.com',
    'https://www.zhihu.com'
]

results = batch_processing(sites)
successful = len([r for r in results if r['success']])
print(f'成功处理: {successful}/{len(sites)} 个网站')
```

### 2.3 自定义配置使用

```python
from browser_interface import create_browser
def custom_config_example():
    """自定义配置示例"""
    # 自定义配置
    config = {
        'headless': False,
        'locale': 'zh-CN',
        'args': [
            '--lang=zh-CN',
            '--window-size=1920,1080',
            '--disable-gpu',
            '--no-sandbox',
            '--force-charset=UTF-8'
        ]
    }
    
    with create_browser(config=config) as browser:
        page = browser.goto('https://www.baidu.com')
        
        # 检查配置效果
        info = page.evaluate('{'
            user_agent: navigator.userAgent,
            language: navigator.language,
            charset: document.characterSet
        }')
        
        print(f'页面标题: {page.title()}')
        print(f'浏览器信息: {info}')
        
        # 截图
        page.screenshot('custom_config_test.png', full_page=True)

custom_config_example()
```

## 3. 实战项目

### 3.1 百度搜索爬虫

```python
from browser_interface import create_browser
import time
import json

class BaiduSpider:
    """百度搜索爬虫"""
    
    def __init__(self):
        self.results = []
    
    def search(self, keyword, max_pages=3):
        """搜索关键词"""
        with create_browser() as browser:
            page = browser.goto('https://www.baidu.com')
            
            # 填写搜索框
            page.fill('#kw', keyword)
            page.click('#su')
            
            # 等待搜索结果
            time.sleep(2)
            
            # 爬取多页结果
            for page_num in range(max_pages):
                try:
                    self._extract_results(page, page_num + 1)
                    
                    if page_num < max_pages - 1:
                        # 点击下一页
                        page.click('.n:contains("下一页")')
                        time.sleep(2)
                        
                except Exception as e:
                    print(f'第{page_num + 1}页提取失败: {e}')
                    break
        
        return self.results
    
    def _extract_results(self, page, page_num):
        """提取搜索结果"""
        try:
            # 获取所有结果项
            results = page.query_selector_all('.result')
            
            for i, result in enumerate(results):
                try:
                    title_elem = result.query_selector('h3 a')
                    if title_elem:
                        title = title_elem.text_content()
                        href = title_elem.get_attribute('href')
                        
                        # 获取摘要
                        summary_elem = result.query_selector('.c-abstract')
                        summary = summary_elem.text_content() if summary_elem else ''
                        
                        self.results.append({
                            'page': page_num,
                            'position': i + 1,
                            'title': title.strip(),
                            'url': href,
                            'summary': summary.strip()
                        })
                        
                except Exception as e:
                    print(f'提取第{i+1}个结果失败: {e}')
                    continue
        
        except Exception as e:
            print(f'页面{page_num}结果提取失败: {e}')
    
    def save_results(self, filename='baidu_search_results.json'):
        """保存结果"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, ensure_ascii=False, indent=2)
        print(f'结果已保存到: {filename}')

# 使用示例
spider = BaiduSpider()
results = spider.search('Python 自动化', max_pages=2)
spider.save_results()

print(f'总共提取到 {len(results)} 个搜索结果')
```

### 3.2 网站信息采集器

```python
from browser_interface import create_browser, stealth_mode
import time
import json
from datetime import datetime

class WebsiteInfoCollector:
    """网站信息采集器"""
    
    def __init__(self, use_stealth=False):
        self.use_stealth = use_stealth
    
    def collect_single(self, url):
        """采集单个网站信息"""
        try:
            if self.use_stealth:
                browser_creator = stealth_mode
            else:
                browser_creator = create_browser
            
            with browser_creator() as browser:
                page = browser.goto(url)
                
                # 基础信息
                info = {
                    'url': url,
                    'title': page.title(),
                    'final_url': page.url(),
                    'timestamp': datetime.now().isoformat(),
                    'success': True
                }
                
                # 技术信息
                tech_info = page.evaluate('{'
                    language: document.documentElement.lang,
                    charset: document.characterSet,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    user_agent: navigator.userAgent
                }')
                info.update(tech_info)
                
                # SEO 信息
                try:
                    description = page.text_content('meta[name="description"]')
                    keywords = page.text_content('meta[name="keywords"]')
                    
                    if description:
                        info['description'] = description.strip()
                    if keywords:
                        info['keywords'] = keywords.strip()
                except:
                    pass
                
                # 截图
                screenshot_name = f'{url.replace("https://", "").replace("/", "_")}.png'
                page.screenshot(screenshot_name)
                info['screenshot'] = screenshot_name
                
                return info
                
        except Exception as e:
            return {
                'url': url,
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def collect_batch(self, urls, delay=2):
        """批量采集网站信息"""
        results = []
        
        for i, url in enumerate(urls, 1):
            print(f'采集 {i}/{len(urls)}: {url}')
            
            result = self.collect_single(url)
            results.append(result)
            
            if i < len(urls):
                print(f'等待 {delay} 秒...')
                time.sleep(delay)
        
        return results
    
    def generate_report(self, results, filename='website_report.html'):
        """生成HTML报告"""
        html = '<html><head><meta charset="UTF-8"><title>网站信息报告</title></head><body>'
        html += '<h1>网站信息采集报告</h1>'
        html += f'<p>采集时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>'
        html += f'<p>总计: {len(results)} 个网站</p>'
        html += '<table border="1" style="border-collapse: collapse; width: 100%;">'
        html += '<tr><th>URL</th><th>标题</th><th>语言</th><th>状态</th></tr>'
        
        for result in results:
            status = '成功' if result['success'] else '失败'
            title = result.get('title', '未知')
            language = result.get('language', '未知')
            url = result['url']
            
            html += f'<tr><td>{url}</td><td>{title}</td><td>{language}</td><td>{status}</td></tr>'
        
        html += '</table></body></html>'
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f'报告已保存到: {filename}')

# 使用示例
collector = WebsiteInfoCollector(use_stealth=True)

sites = [
    'https://www.baidu.com',
    'https://weibo.com',
    'https://www.zhihu.com',
    'https://github.com'
]

# 采集信息
results = collector.collect_batch(sites, delay=2)

# 生成报告
collector.generate_report(results)

# 保存JSON数据
with open('website_data.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f'采集完成，成功: {len([r for r in results if r["success"]])}/{len(sites)}')
```

### 3.3 价格监控工具

```python
from browser_interface import headless_mode
import time
import json
from datetime import datetime

class PriceMonitor:
    """价格监控工具"""
    
    def __init__(self, config_file='price_config.json'):
        self.config_file = config_file
        self.load_config()
    
    def load_config(self):
        """加载配置"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
        except FileNotFoundError:
            # 创建默认配置
            self.config = {
                'products': [
                    {
                        'name': '示例商品',
                        'url': 'https://example.com/product/1',
                        'price_selector': '.price',
                        'name_selector': '.product-name',
                        'target_price': 100.0
                    }
                ],
                'check_interval': 3600,  # 1小时
                'notification': {
                    'email': 'your@email.com',
                    'enabled': False
                }
            }
            self.save_config()
    
    def save_config(self):
        """保存配置"""
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, ensure_ascii=False, indent=2)
    
    def check_prices(self):
        """检查价格"""
        results = []
        
        with headless_mode() as browser:
            for product in self.config['products']:
                try:
                    result = self._check_single_product(browser, product)
                    results.append(result)
                    
                    if result['price_drop']:
                        self._notify_price_drop(result)
                        
                except Exception as e:
                    results.append({
                        'name': product['name'],
                        'success': False,
                        'error': str(e),
                        'timestamp': datetime.now().isoformat()
                    })
        
        return results
    
    def _check_single_product(self, browser, product):
        """检查单个商品价格"""
        page = browser.goto(product['url'])
        
        # 等待页面加载
        time.sleep(2)
        
        # 获取商品名称
        name = page.text_content(product['name_selector'])
        
        # 获取价格
        price_text = page.text_content(product['price_selector'])
        price = self._extract_price(price_text)
        
        # 检查价格变化
        target_price = product['target_price']
        price_drop = price and price <= target_price
        
        return {
            'name': name,
            'url': product['url'],
            'price': price,
            'price_text': price_text,
            'target_price': target_price,
            'price_drop': price_drop,
            'success': True,
            'timestamp': datetime.now().isoformat()
        }
    
    def _extract_price(self, price_text):
        """从价格文本中提取数值"""
        if not price_text:
            return None
        
        import re
        
        # 移除非数字字符，保留小数点
        price_clean = re.sub(r'[^0-9.]', '', price_text)
        
        try:
            return float(price_clean)
        except ValueError:
            return None
    
    def _notify_price_drop(self, result):
        """通知价格下降"""
        message = f"价格下降通知: {result['name']}\n"
        message += f"当前价格: {result['price']}\n"
        message += f"目标价格: {result['target_price']}\n"
        message += f"商品链接: {result['url']}"
        
        print(f"🔔 价格下降通知:\n{message}")
        
        # 这里可以添加邮件通知等
        if self.config['notification']['enabled']:
            # send_email_notification(message)
            pass
    
    def run_monitor(self, run_once=False):
        """运行监控"""
        print(f"价格监控启动，检查间隔: {self.config['check_interval']}秒")
        
        while True:
            print(f"开始检查价格... {datetime.now()}")
            
            results = self.check_prices()
            
            # 保存检查结果
            with open('price_check_log.json', 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            
            print(f"价格检查完成，检查了 {len(results)} 个商品")
            
            if run_once:
                break
            
            print(f"下次检查时间: {datetime.fromtimestamp(time.time() + self.config['check_interval'])}")
            time.sleep(self.config['check_interval'])

# 使用示例
monitor = PriceMonitor()

# 运行一次测试
monitor.run_monitor(run_once=True)

# 持续监控
# monitor.run_monitor()
```

## 4. 最佳实践

### 4.1 资源管理

```python
from browser_interface import create_browser

def resource_management_example():
    """资源管理最佳实践"""
    
    # ✅ 推荐：使用上下文管理器
    with create_browser() as browser:
        page = browser.goto('https://www.baidu.com')
        # 浏览器自动关闭
    
    # ❌ 不推荐：手动管理
    browser = create_browser()
    try:
        page = browser.new_page()
        page.goto('https://www.baidu.com')
    finally:
        browser.close()  # 容易忘记
```

### 4.2 错误处理

```python
from browser_interface import create_browser, SecurityError
import logging

def error_handling_example():
    """错误处理最佳实践"""
    
    # 设置日志
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    try:
        with create_browser() as browser:
            page = browser.goto('https://www.baidu.com')
            logger.info(f'页面加载成功: {page.title()}')
            
    except SecurityError as e:
        logger.error(f'安全错误: {e}')
        # 只能使用正确的导入方式
        
    except Exception as e:
        logger.error(f'操作失败: {e}')
        # 其他错误处理
```

### 4.3 性能优化

```python
from browser_interface import headless_mode
import time

def performance_optimization_example():
    """性能优化最佳实践"""
    
    # 批量处理，复用浏览器实例
    urls = ['https://www.baidu.com', 'https://weibo.com', 'https://www.zhihu.com']
    
    with headless_mode() as browser:  # 无头模式提升性能
        for url in urls:
            try:
                page = browser.goto(url)
                print(f'处理完成: {url} - {page.title()}')
                
                # 及时释放页面资源
                # page.close()  # 如果需要
                
            except Exception as e:
                print(f'处理失败: {url} - {e}')
                continue
```

### 4.4 配置管理

```python
from browser_interface import create_browser, get_stealth_config, get_headless_config

def configuration_management_example():
    """配置管理最佳实践"""
    
    # 使用内置配置
    stealth_config = get_stealth_config()
    headless_config = get_headless_config()
    
    print(f'隐匿配置参数: {len(stealth_config["args"])}个')
    print(f'无头模式: {headless_config["headless"]}')
    
    # 自定义配置
    custom_config = {
        'headless': False,
        'locale': 'zh-CN',
        'args': [
            '--lang=zh-CN',
            '--window-size=1920,1080',
            '--disable-gpu'
        ]
    }
    
    with create_browser(config=custom_config) as browser:
        page = browser.goto('https://www.baidu.com')
        print(f'自定义配置测试: {page.title()}')
```

---

## 总结

通过这些示例，你应该能够：

- ✅ 掌握基础的浏览器操作
- ✅ 实现复杂的爬取任务
- ✅ 开发实用的监控工具
- ✅ 遵循最佳实践和性能优化

**开始你的第一个 WebAuto 项目吧！**

## 相关文档

- [快速入门指南](QUICK_START.md) - 5分钟上手
- [用户指南](USER_GUIDE.md) - 详细使用说明
- [API 参考文档](API_REFERENCE.md) - 完整API文档
- [架构设计文档](ARCHITECTURE.md) - 理解抽象层设计
- [故障排除指南](TROUBLESHOOTING.md) - 常见问题解决
