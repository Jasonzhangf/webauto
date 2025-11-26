"""
WebAuto 浏览器模块 - 完整示例项目
网站信息采集器
"""

import json
import time
from datetime import datetime
from browser_interface import create_browser, stealth_mode

class WebsiteScraper:
    """网站信息采集器"""
    
    def __init__(self, headless=False, use_stealth=False):
        self.headless = headless
        self.use_stealth = use_stealth
        self.results = []
    
    def scrape_single_site(self, url: str) -> dict:
        """采集单个网站信息"""
        result = {
            'url': url,
            'timestamp': datetime.now().isoformat(),
            'status': 'pending',
            'error': None
        }
        
        try:
            # 选择浏览器模式
            if self.use_stealth:
                browser_creator = stealth_mode
            else:
                browser_creator = create_browser
            
            with browser_creator(headless=self.headless) as browser:
                print(f"🔍 正在访问: {url}")
                page = browser.goto(url)
                
                # 采集基本信息
                result.update({
                    'title': page.title(),
                    'final_url': page.url(),
                    'status': 'success'
                })
                
                # 采集页面信息
                page_info = self._extract_page_info(page)
                result.update(page_info)
                
                # 截图
                screenshot_name = f"screenshot_{url.replace('https://', '').replace('/', '_')}.png"
                page.screenshot(screenshot_name)
                result['screenshot'] = screenshot_name
                
                print(f"✅ 采集成功: {result['title']}")
                
        except Exception as e:
            result.update({
                'status': 'failed',
                'error': str(e)
            })
            print(f"❌ 采集失败: {url} - {e}")
        
        return result
    
    def _extract_page_info(self, page) -> dict:
        """提取页面详细信息"""
        info = {}
        
        try:
            # 尝试获取页面描述
            description = page.text_content('meta[name="description"]')
            if description:
                info['description'] = description.strip()
        except:
            pass
        
        try:
            # 尝试获取页面关键词
            keywords = page.text_content('meta[name="keywords"]')
            if keywords:
                info['keywords'] = keywords.strip()
        except:
            pass
        
        try:
            # 获取页面语言
            lang = page.evaluate('document.documentElement.lang')
            if lang:
                info['language'] = lang
        except:
            pass
        
        try:
            # 获取字符编码
            charset = page.evaluate('document.characterSet')
            if charset:
                info['charset'] = charset
        except:
            pass
        
        try:
            # 获取页面大小
            size = page.evaluate('{width: document.body.scrollWidth, height: document.body.scrollHeight}')
            info['page_size'] = size
        except:
            pass
        
        return info
    
    def scrape_multiple_sites(self, urls: list, delay: int = 2) -> list:
        """采集多个网站信息"""
        print(f"🚀 开始批量采集 {len(urls)} 个网站...")
        
        for i, url in enumerate(urls, 1):
            print(f"\n[{i}/{len(urls)}] 采集: {url}")
            
            result = self.scrape_single_site(url)
            self.results.append(result)
            
            # 延迟避免过于频繁的请求
            if i < len(urls):
                print(f"⏳ 等待 {delay} 秒...")
                time.sleep(delay)
        
        return self.results
    
    def save_results(self, filename: str = 'scraping_results.json'):
        """保存采集结果"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, ensure_ascii=False, indent=2)
        print(f"💾 结果已保存到: {filename}")
    
    def generate_report(self) -> str:
        """生成采集报告"""
        total = len(self.results)
        successful = len([r for r in self.results if r['status'] == 'success'])
        failed = total - successful
        
        report = f"""
📊 网站信息采集报告
====================
📅 采集时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
🌐 总网站数: {total}
✅ 成功采集: {successful}
❌ 采集失败: {failed}
📈 成功率: {(successful/total*100):.1f}%

📋 详细结果:
"""
        
        for i, result in enumerate(self.results, 1):
            status_emoji = "✅" if result['status'] == 'success' else "❌"
            title = result.get('title', '未知')
            url = result['url']
            
            report += f"\n{i}. {status_emoji} {title}\n   📎 {url}"
            
            if result['status'] == 'success':
                if 'description' in result:
                    report += f"\n   📝 {result['description'][:100]}..."
                if 'language' in result:
                    report += f"\n   🌍 语言: {result['language']}"
                if 'charset' in result:
                    report += f"\n   🔤 编码: {result['charset']}"
            else:
                report += f"\n   ⚠️  错误: {result['error']}"
            
            report += "\n"
        
        return report

def main():
    """主函数 - 演示完整项目"""
    print("🌐 WebAuto 网站信息采集器")
    print("=" * 40)
    
    # 配置采集器
    scraper = WebsiteScraper(
        headless=False,    # 显示浏览器界面
        use_stealth=True   # 使用隐匿模式
    )
    
    # 目标网站列表
    target_sites = [
        'https://www.baidu.com',
        'https://weibo.com',
        'https://www.zhihu.com',
        'https://github.com',
        'https://www.stackoverflow.com'
    ]
    
    try:
        # 开始采集
        results = scraper.scrape_multiple_sites(target_sites, delay=2)
        
        # 生成报告
        report = scraper.generate_report()
        print(report)
        
        # 保存结果
        scraper.save_results('website_scraping_results.json')
        
        print("\n🎉 采集任务完成！")
        
    except KeyboardInterrupt:
        print("\n⏹️  用户中断采集")
    except Exception as e:
        print(f"\n💥 采集过程中发生错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
