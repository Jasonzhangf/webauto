"""
WebAuto 浏览器服务启动器
一键启动后台浏览器服务
"""

import argparse
import sys
import signal
import threading
import time
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from services.browser_api import start_browser_api
from services.browser_service import BrowserService

def signal_handler(sig, frame):
    """信号处理函数"""
    print("\n🛑 收到停止信号，正在优雅关闭服务...")
    
    # 停止浏览器服务
    if hasattr(signal_handler, 'browser_service'):
        result = signal_handler.browser_service.stop_service()
        if result["success"]:
            print("✅ 浏览器服务已停止")
        else:
            print(f"❌ 停止服务失败: {result.get('error', '未知错误')}")
    
    print("👋 服务已关闭")
    sys.exit(0)

def print_banner():
    """打印启动横幅"""
    banner = """
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║    🚀 WebAuto 浏览器服务 (Browser Service)                                   ║
║                                                                              ║
║    提供完整的浏览器自动化服务，包括：                                        ║
║    • 🍪 自动Cookie管理                                                       ║
║    • 🛡️ 指纹更新和风控处理                                                   ║
║    • 🌐 RESTful API接口                                                      ║
║    • 📱 浏览器控制接口                                                       ║
║    • 🎯 页面模板和标注操作                                                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    """
    print(banner)

def print_usage_examples():
    """打印使用示例"""
    examples = """
📖 使用示例:

1️⃣ 启动服务:
   python services/browser_launcher.py

2️⃣ 指定端口启动:
   python services/browser_launcher.py --port 9999

3️⃣ 调试模式启动:
   python services/browser_launcher.py --debug

4️⃣ 后台模式启动:
   python services/browser_launcher.py --daemon

🔌 API端点:
   • POST /api/v1/service/start          - 启动服务
   • POST /api/v1/sessions               - 创建会话
   • POST /api/v1/sessions/{id}/navigate - 页面导航
   • POST /api/v1/sessions/{id}/click    - 点击操作
   • POST /api/v1/sessions/{id}/input    - 输入文本
   • POST /api/v1/sessions/{id}/screenshot - 截图
   • GET  /api/v1/health                 - 健康检查

📋 完整API文档将启动后显示在控制台
    """
    print(examples)

def start_background_service(host: str, port: int, debug: bool = False):
    """启动后台浏览器服务"""
    print("🔧 初始化浏览器服务...")
    
    # 创建浏览器服务实例
    browser_service = BrowserService()
    signal_handler.browser_service = browser_service
    
    # 启动服务
    print("🚀 启动浏览器服务核心...")
    result = browser_service.start_service({
        "cookie_dir": "./cookies",
        "fingerprint_dir": "./fingerprints",
        "max_sessions": 10
    })
    
    if result["success"]:
        print("✅ 浏览器服务核心启动成功")
        print(f"   📊 状态: {result['status']}")
        print(f"   📁 Cookie目录: {result.get('config', {}).get('cookie_dir', './cookies')}")
    else:
        print(f"❌ 浏览器服务核心启动失败: {result.get('error', '未知错误')}")
        return False
    
    # 启动API服务
    print(f"\n🌐 启动API服务...")
    print(f"   📡 地址: http://{host}:{port}")
    print(f"   🔧 调试模式: {'开启' if debug else '关闭'}")
    
    try:
        # 在新线程中启动Flask应用
        api_thread = threading.Thread(
            target=start_browser_api,
            args=(host, port, debug),
            daemon=True
        )
        api_thread.start()
        
        print("✅ API服务启动成功")
        
        # 打印API文档
        print_api_documentation(host, port)
        
        return True
        
    except Exception as e:
        print(f"❌ API服务启动失败: {e}")
        return False

def print_api_documentation(host: str, port: int):
    """打印API文档"""
    api_docs = f"""
📚 API文档:

🎯 服务管理:
   • GET  http://{host}:{port}/api/v1/service/status  - 服务状态
   • POST http://{host}:{port}/api/v1/service/start  - 启动服务
   • POST http://{host}:{port}/api/v1/service/stop   - 停止服务

🔑 会话管理:
   • POST http://{host}:{port}/api/v1/sessions       - 创建会话
   • GET  http://{host}:{port}/api/v1/sessions/{{id}} - 获取会话
   • DEL  http://{host}:{port}/api/v1/sessions/{{id}} - 关闭会话

🌐 浏览器控制:
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/navigate  - 页面导航
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/click     - 点击元素
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/input     - 输入文本
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/screenshot - 截图
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/highlight - 高亮元素

🍪 Cookie管理:
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/cookies/load - 加载Cookie
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/cookies/save - 保存Cookie

🛡️ 指纹管理:
   • PUT  http://{host}:{port}/api/v1/sessions/{{id}}/fingerprint - 更新指纹

📋 页面模板:
   • POST http://{host}:{port}/api/v1/sessions/{{id}}/template - 执行模板

💚 健康检查:
   • GET  http://{host}:{port}/api/v1/health - 健康检查

🔧 测试命令:
   curl -X POST http://{host}:{port}/api/v1/sessions \\
        -H "Content-Type: application/json" \\
        -d '{{"profile": {{"profile_id": "test", "anti_detection_level": "enhanced"}}}}'
    """
    print(api_docs)

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='WebAuto 浏览器服务启动器')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='服务绑定地址')
    parser.add_argument('--port', type=int, default=8888, help='服务端口')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--daemon', action='store_true', help='后台模式运行')
    
    args = parser.parse_args()
    
    # 打印横幅
    print_banner()
    
    # 注册信号处理
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 启动服务
    if start_background_service(args.host, args.port, args.debug):
        print("\n🎉 WebAuto 浏览器服务启动完成！")
        print("\n⏹️  按 Ctrl+C 停止服务")
        
        if not args.daemon:
            try:
                # 保持主线程运行
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                signal_handler(signal.SIGINT, None)
        else:
            print("👻 后台模式运行中...")
            # 在后台模式下，创建PID文件
            pid_file = Path("browser_service.pid")
            pid_file.write_text(str(os.getpid()))
            
            try:
                while True:
                    time.sleep(10)
                    # 检查服务状态
                    status = browser_service.get_service_status()
                    if status["status"] != "running":
                        print("⚠️  服务状态异常，正在重启...")
                        browser_service.start_service()
            except KeyboardInterrupt:
                signal_handler(signal.SIGINT, None)
            finally:
                if pid_file.exists():
                    pid_file.unlink()
    else:
        print("\n❌ 服务启动失败")
        sys.exit(1)

if __name__ == "__main__":
    main()