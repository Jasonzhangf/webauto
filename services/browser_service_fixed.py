"""
WebAuto 浏览器服务实现
提供后台服务，完全抽象底层浏览器操作
"""

import asyncio
import json
import time
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import asdict
import threading
from concurrent.futures import ThreadPoolExecutor

from services.browser_service_interface import (
    BrowserProfile, PageAction, PageTemplate, BrowserActionType, AntiDetectionLevel
)
# from services.browser_service import BrowserService, BrowserServiceError
from services import container_registry
# 使用现有的Cookie管理功能
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# 导入现有的Cookie管理器（Node 侧实现不可直接在 Python 中使用，这里做最佳努力降级）
try:
    from libs.browser.cookie_manager import CookieManager as ExistingCookieManager  # type: ignore
except Exception:
    class ExistingCookieManager:  # 简化占位实现，仅保存目录信息
        def __init__(self, cookie_dir: str = "./cookies"):
            self.cookie_dir = cookie_dir

class BrowserAPIError(Exception):
    """浏览器API错误"""
    pass

# 创建Flask应用
app = Flask(__name__)
CORS(app)

# 全局浏览器服务实例
browser_service = BrowserService()

def create_error_response(message: str, code: int = 400) -> Dict[str, Any]:
    """创建错误响应"""
    return jsonify({
        "success": False,
        "error": message,
        "timestamp": time.time()
    }), code

def create_success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """创建成功响应"""
    return jsonify({
        "success": True,
        "data": data,
        "timestamp": time.time()
    })

# 服务管理API
@app.route('/api/v1/service/start', methods=['POST'])
def start_service():
    """启动浏览器服务"""
    try:
        config = request.json or {}
        result = browser_service.start_service(config)

        if result["success"]:
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "服务启动失败"))

    except Exception as e:
        return create_error_response(f"启动服务异常: {str(e)}")

@app.route('/api/v1/service/stop', methods=['POST'])
def stop_service():
    """停止浏览器服务"""
    try:
        result = browser_service.stop_service()

        if result["success"]:
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "服务停止失败"))

    except Exception as e:
        return create_error_response(f"停止服务异常: {str(e)}")

@app.route('/api/v1/service/status', methods=['GET'])
def get_service_status():
    """获取服务状态"""
    try:
        status = browser_service.get_service_status()
        return create_success_response(status)

    except Exception as e:
        return create_error_response(f"获取服务状态异常: {str(e)}")

# 会话管理API
@app.route('/api/v1/sessions', methods=['POST'])
def create_session():
    """创建浏览器会话"""
    try:
        data = request.json or {}

        # 构建浏览器配置文件
        profile_data = data.get('profile', {})
        profile = BrowserProfile(
            profile_id=profile_data.get('profile_id', 'default'),
            user_agent=profile_data.get('user_agent'),
            viewport=profile_data.get('viewport'),
            timezone=profile_data.get('timezone')
        )

        result = browser_service.create_session(profile, auto_restore=True)

        if result["success"]:
            return create_success_response({"session_id": result})
        else:
            return create_error_response(result.get("error", "会话创建失败"))

    except Exception as e:
        return create_error_response(f"创建会话异常: {str(e)}")

@app.route('/api/v1/sessions', methods=['GET'])
def list_sessions():
    """列出所有会话"""
    try:
        sessions = browser_service.get_all_sessions()
        session_list = []

        for session_id, session in sessions.items():
            session_list.append({
                "session_id": session_id,
                "profile": asdict(session.profile),
                "status": session.status,
                "created_at": session.created_at,
                "last_activity": session.last_activity,
                "page_count": session.page_count,
                "cookie_count": session.cookie_count
            })

        return create_success_response({"sessions": session_list})

    except Exception as e:
        return create_error_response(f"获取会话列表异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>', methods=['GET'])
def get_session(session_id: str):
    """获取会话信息"""
    try:
        session = browser_service.get_session(session_id)
        if session:
            return create_success_response({
                "session_id": session_id,
                "profile": asdict(session.profile),
                "status": session.status,
                "created_at": session.created_at,
                "last_activity": session.last_activity,
                "page_count": session.page_count,
                "cookie_count": session.cookie_count
            })
        else:
            return create_error_response("会话不存在", 404)

    except Exception as e:
        return create_error_response(f"获取会话异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>', methods=['DELETE'])
def close_session(session_id: str):
    """关闭浏览器会话"""
    try:
        result = browser_service.close_session(session_id)

        if result["success"]:
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "关闭会话失败"))

    except Exception as e:
        return create_error_response(f"关闭会话异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/status', methods=['GET'])
def get_session_status(session_id: str):
    """获取会话状态"""
    try:
        status = browser_service.get_session_status(session_id)
        return create_success_response(status)

    except Exception as e:
        return create_error_response(f"获取会话状态异常: {str(e)}")

# 页面操作API
@app.route('/api/v1/sessions/<session_id>/actions', methods=['POST'])
def execute_page_action(session_id: str):
    """执行页面操作"""
    try:
        action_data = request.json or {}
        action_type = action_data.get('type')

        controller = browser_service.get_controller(session_id)
        if not controller:
            return create_error_response("会话控制器不存在", 404)

        result = {"success": False}

        if action_type == "navigate":
            url = action_data.get('url')
            result = controller.navigate(url)
        elif action_type == "execute_script":
            script = action_data.get('script')
            result = controller.execute_script(script)
        elif action_type == "inspect_dom":
            selector = action_data.get('selector')
            result = controller.inspect_dom(selector)
        elif action_type == "screenshot":
            filename = action_data.get('filename', f'screenshot_{int(time.time())}.png')
            result = controller.take_screenshot(filename)
        else:
            return create_error_response(f"不支持的操作类型: {action_type}")

        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "操作失败"))

    except Exception as e:
        return create_error_response(f"执行页面操作异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/info', methods=['GET'])
def get_page_info_api(session_id: str):
    """获取页面信息"""
    try:
        controller = browser_service.get_controller(session_id)
        if not controller:
            return create_error_response("会话控制器不存在", 404)

        result = controller.get_page_info()
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "获取页面信息失败"))

    except Exception as e:
        return create_error_response(f"获取页面信息异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/cookies', methods=['GET'])
def get_cookies_api(session_id: str):
    """获取Cookies"""
    try:
        result = browser_service.get_cookies(session_id)
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "获取Cookies失败"))

    except Exception as e:
        return create_error_response(f"获取Cookies异常: {str(e)}")

# 容器管理 API（简化版本，为 DOM 选取创建容器提供后端支持）
@app.route('/api/v1/containers', methods=['GET'])
def list_containers_for_url():
    """根据 URL 返回对应站点下的容器定义"""
    try:
        url = request.args.get('url', '')
        if not url:
            return create_error_response("缺少 url 参数")

        containers = container_registry.get_containers_for_url(url)
        return create_success_response({"containers": containers})

    except Exception as e:
        return create_error_response(f"获取容器失败: {str(e)}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8888, debug=False)