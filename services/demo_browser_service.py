"""
WebAuto 页面模板和标注操作示例
演示如何使用浏览器服务进行页面模板操作和标注
"""

import json
import time
import requests
from typing import Dict, Any, List

class BrowserServiceDemo:
    """浏览器服务演示类"""
    
    def __init__(self, base_url: str = "http://localhost:8888"):
        self.base_url = base_url
        self.session_id = None
    
    def start_service(self) -> Dict[str, Any]:
        """启动浏览器服务"""
        print("🚀 启动浏览器服务...")
        
        response = requests.post(
            f"{self.base_url}/api/v1/service/start",
            json={
                "cookie_dir": "./cookies",
                "fingerprint_dir": "./fingerprints",
                "max_sessions": 10
            }
        )
        
        result = response.json()
        if result["success"]:
            print("✅ 浏览器服务启动成功")
        else:
            print(f"❌ 服务启动失败: {result.get('error', '未知错误')}")
        
        return result
    
    def create_session(self, profile_config: Dict[str, Any] = None, auto_restore: bool = True) -> str:
        """创建浏览器会话"""
        print("\n🔑 创建浏览器会话...")
        
        profile_config = profile_config or {
            "profile_id": "demo_session",
            "anti_detection_level": "enhanced",
            "locale": "zh-CN",
            "cookies_enabled": True
        }
        
        response = requests.post(
            f"{self.base_url}/api/v1/sessions",
            json={"profile": profile_config}
        )
        
        result = response.json()
        if result["success"]:
            self.session_id = result["data"]["session_id"]
            print(f"✅ 会话创建成功: {self.session_id}")
        else:
            print(f"❌ 会话创建失败: {result.get('error', '未知错误')}")
        
        return self.session_id
    
    def create_1688_template(self) -> PageTemplate:
        """创建1688页面模板"""
        print("\n📋 创建1688页面模板...")
        
        template = {
            "template_id": "1688_search_template",
            "name": "1688搜索页面模板",
            "url_pattern": "https://s.1688.com/.*",
            "selectors": {
                "search_box": "input[placeholder*='搜索']",
                "search_button": "button[type='submit']",
                "product_items": ".sm-offer-item",
                "product_title": ".sm-offer-item .offer-title",
                "product_price": ".sm-offer-item .price",
                "product_company": ".sm-offer-item .company-name",
                "next_page": ".pagination-next"
            },
            "actions": [
                {
                    "action_type": "wait",
                    "wait_time": 3000,
                    "options": {"description": "等待页面加载"}
                },
                {
                    "action_type": "highlight",
                    "selector": ".sm-offer-item",
                    "options": {"color": "#FF6B6B", "duration": 2000}
                },
                {
                    "action_type": "extract",
                    "options": {
                        "selectors": {
                            "product_count": ".sm-offer-item",
                            "page_title": "title",
                            "search_keyword": "input[placeholder*='搜索']"
                        }
                    }
                }
            ],
            "metadata": {
                "platform": "1688",
                "type": "search_page",
                "version": "1.0"
            }
        }
        
        print("✅ 1688页面模板创建完成")
        return template
    
    def create_weibo_template(self) -> PageTemplate:
        """创建微博页面模板"""
        print("\n📋 创建微博页面模板...")
        
        template = {
            "template_id": "weibo_homepage_template",
            "name": "微博首页模板",
            "url_pattern": "https://weibo.com/.*",
            "selectors": {
                "username": ".username",
                "post_content": ".content",
                "post_time": ".time",
                "like_button": ".like-button",
                "comment_button": ".comment-button",
                "share_button": ".share-button"
            },
            "actions": [
                {
                    "action_type": "wait",
                    "wait_time": 5000,
                    "options": {"description": "等待微博内容加载"}
                },
                {
                    "action_type": "scroll",
                    "options": {"direction": "down", "amount": 500}
                },
                {
                    "action_type": "highlight",
                    "selector": ".content",
                    "options": {"color": "#4ECDC4", "duration": 1500}
                }
            ],
            "metadata": {
                "platform": "weibo",
                "type": "homepage",
                "version": "1.0"
            }
        }
        
        print("✅ 微博页面模板创建完成")
        return template
    
    def demo_navigation_and_highlight(self):
        """演示导航和高亮操作"""
        print(f"\n🌐 演示导航和高亮操作...")
        
        # 导航到百度
        print("1️⃣ 导航到百度...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/navigate",
            json={"url": "https://www.baidu.com"}
        )
        
        nav_result = response.json()
        if nav_result["success"]:
            data = nav_result["data"]
            print(f"   ✅ 导航成功: {data.get('title', '未知标题')}")
            print(f"   📍 当前URL: {data.get('url', '未知URL')}")
        else:
            print(f"   ❌ 导航失败: {nav_result.get('error', '未知错误')}")
            return
        
        # 高亮搜索框
        print("2️⃣ 高亮搜索框...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/highlight",
            json={
                "selector": "#kw",
                "options": {
                    "color": "#FF6B6B",
                    "duration": 3000
                }
            }
        )
        
        highlight_result = response.json()
        if highlight_result["success"]:
            print("   ✅ 搜索框高亮成功")
        else:
            print(f"   ❌ 高亮失败: {highlight_result.get('error', '未知错误')}")
        
        # 输入搜索词
        print("3️⃣ 输入搜索词...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/input",
            json={
                "selector": "#kw",
                "text": "WebAuto浏览器服务"
            }
        )
        
        input_result = response.json()
        if input_result["success"]:
            print("   ✅ 输入成功")
        else:
            print(f"   ❌ 输入失败: {input_result.get('error', '未知错误')}")
        
        # 截图
        print("4️⃣ 截图...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/screenshot",
            json={
                "options": {
                    "full_page": True,
                    "quality": 80
                }
            }
        )
        
        if response.status_code == 200:
            # 保存截图
            screenshot_path = f"demo_screenshot_{int(time.time())}.png"
            with open(screenshot_path, 'wb') as f:
                f.write(response.content)
            print(f"   ✅ 截图保存成功: {screenshot_path}")
        else:
            print(f"   ❌ 截图失败: {response.text}")
    
    def demo_page_template(self):
        """演示页面模板功能"""
        print(f"\n📄 演示页面模板功能...")
        
        # 创建模板
        template = self.create_1688_template()
        
        # 执行模板（这里用百度代替，因为1688需要登录）
        print("1️⃣ 执行页面模板...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/template",
            json={
                "template": template,
                "url": "https://www.baidu.com"
            }
        )
        
        template_result = response.json()
        if template_result["success"]:
            results = template_result["data"]["results"]
            print(f"   ✅ 模板执行成功，共{len(results)}个操作")
            
            for i, result in enumerate(results, 1):
                action = result["action"]
                action_result = result["result"]
                status = "✅" if action_result.get("success") else "❌"
                print(f"   {i}. {status} {action}: {action_result.get('message', '完成')}")
        else:
            print(f"   ❌ 模板执行失败: {template_result.get('error', '未知错误')}")
    
    def demo_cookie_management(self):
        """演示Cookie管理功能"""
        print(f"\n🍪 演示Cookie管理功能...")
        
        # 保存Cookie
        print("1️⃣ 保存当前Cookie...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/cookies/save",
            json={
                "cookie_target": "demo_cookies.json"
            }
        )
        
        save_result = response.json()
        if save_result["success"]:
            print("   ✅ Cookie保存成功")
        else:
            print(f"   ❌ Cookie保存失败: {save_result.get('error', '未知错误')}")
        
        # 加载Cookie
        print("2️⃣ 加载Cookie...")
        response = requests.post(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/cookies/load",
            json={
                "cookie_source": "demo_cookies.json"
            }
        )
        
        load_result = response.json()
        if load_result["success"]:
            print("   ✅ Cookie加载成功")
        else:
            print(f"   ❌ Cookie加载失败: {load_result.get('error', '未知错误')}")
    
    def demo_fingerprint_update(self):
        """演示指纹更新功能"""
        print(f"\n🛡️ 演示指纹更新功能...")
        
        fingerprint_config = {
            "anti_detection_level": "maximum",
            "auto_rotate": True,
            "custom_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        response = requests.put(
            f"{self.base_url}/api/v1/sessions/{self.session_id}/fingerprint",
            json={"fingerprint_config": fingerprint_config}
        )
        
        fingerprint_result = response.json()
        if fingerprint_result["success"]:
            print("   ✅ 指纹更新成功")
        else:
            print(f"   ❌ 指纹更新失败: {fingerprint_result.get('error', '未知错误')}")
    
    def run_full_demo(self):
        """运行完整演示"""
        print("🎬 开始WebAuto浏览器服务完整演示")
        print("=" * 60)
        
        try:
            # 1. 启动服务
            self.start_service()
            
            # 2. 创建会话
            self.create_session()
            
            if not self.session_id:
                print("❌ 无法创建会话，演示终止")
                return
            
            # 3. Cookie管理演示
            self.demo_cookie_management()
            
            # 4. 指纹更新演示
            self.demo_fingerprint_update()
            
            # 5. 导航和高亮演示
            self.demo_navigation_and_highlight()
            
            # 6. 页面模板演示
            self.demo_page_template()
            
            print("\n🎉 完整演示完成！")
            print("\n📊 演示总结:")
            print("- ✅ 服务启动和管理")
            print("- ✅ 会话创建和管理")
            print("- ✅ Cookie自动加载和保存")
            print("- ✅ 指纹更新和风控处理")
            print("- ✅ 浏览器控制接口（导航、点击、输入、截图、高亮）")
            print("- ✅ 页面模板执行")
            print("- ✅ 完整的RESTful API接口")
            
        except Exception as e:
            print(f"\n❌ 演示过程中出现错误: {e}")
        
        finally:
            # 清理会话
            if self.session_id:
                print(f"\n🧹 清理会话: {self.session_id}")
                response = requests.delete(f"{self.base_url}/api/v1/sessions/{self.session_id}")
                if response.json().get("success"):
                    print("   ✅ 会话清理成功")
                else:
                    print("   ⚠️  会话清理失败")
            
            # 停止服务
            print("\n⏹️  停止浏览器服务...")
            response = requests.post(f"{self.base_url}/api/v1/service/stop")
            if response.json().get("success"):
                print("   ✅ 服务停止成功")
            else:
                print("   ⚠️  服务停止失败")
            
            print("\n👋 演示结束，感谢使用WebAuto浏览器服务！")

if __name__ == "__main__":
    # 运行演示
    demo = BrowserServiceDemo()
    demo.run_full_demo()