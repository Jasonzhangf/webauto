"""
WebAuto 浏览器服务API
提供RESTful API接口供应用层调用
"""

import json
import asyncio
from typing import Dict, Any, Optional
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import threading
import time

from services.browser_service_interface import (
    BrowserProfile, PageAction, PageTemplate, BrowserActionType, AntiDetectionLevel
)
from services.browser_service import BrowserService, BrowserServiceError

# 创建Flask应用
app = Flask(__name__)
CORS(app)

# 全局浏览器服务实例
browser_service = BrowserService()

class BrowserAPIError(Exception):
    """浏览器API错误"""
    pass

def create_error_response(message: str, code: int = 400) -> Response:
    """创建错误响应"""
    return jsonify({
        "success": False,
        "error": message,
        "timestamp": time.time()
    }), code

def create_success_response(data: Dict[str, Any]) -> Response:
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
            timezone=profile_data.get('timezone'),
            locale=profile_data.get('locale'),
            fingerprint=profile_data.get('fingerprint'),
            cookies_enabled=profile_data.get('cookies_enabled', True),
            anti_detection_level=AntiDetectionLevel(
                profile_data.get('anti_detection_level', 'enhanced')
            )
        )
        
        session_id = browser_service.create_session(profile)
        
        return create_success_response({
            "session_id": session_id,
            "message": "会话创建成功"
        })
        
    except Exception as e:
        return create_error_response(f"创建会话异常: {str(e)}")

@app.route('/api/v1/sessions', methods=['GET'])
def list_sessions():
    """列出当前所有浏览器会话（用于一键脚本等上层管理）"""
    try:
        sessions_data = []
        # 直接访问服务内部的会话映射
        for session_id, session in browser_service.sessions.items():  # type: ignore[attr-defined]
            sessions_data.append({
                "session_id": session_id,
                "profile_id": getattr(session.profile, "profile_id", "default"),
                "status": session.status,
                "created_at": session.created_at,
                "last_activity": session.last_activity,
                "page_count": session.page_count,
                "cookie_count": session.cookie_count,
            })
        return create_success_response({"sessions": sessions_data})
    except Exception as e:
        return create_error_response(f"获取会话列表异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>', methods=['GET'])
def get_session(session_id: str):
    """获取会话信息"""
    try:
        session = browser_service.get_session(session_id)
        
        if session:
            return create_success_response({
                "session": {
                    "session_id": session.session_id,
                    "profile": session.profile.__dict__,
                    "status": session.status,
                    "created_at": session.created_at,
                    "last_activity": session.last_activity,
                    "page_count": session.page_count,
                    "cookie_count": session.cookie_count
                }
            })
        else:
            return create_error_response("会话不存在", 404)
            
    except Exception as e:
        return create_error_response(f"获取会话异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/status', methods=['GET'])
def get_session_status(session_id: str):
    """获取会话状态"""
    try:
        status = browser_service.get_session_status(session_id)
        return create_success_response(status)
        
    except Exception as e:
        return create_error_response(f"获取会话状态异常: {str(e)}")

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

# 浏览器控制API
@app.route('/api/v1/sessions/<session_id>/navigate', methods=['POST'])
def navigate(session_id: str):
    """页面导航"""
    try:
        data = request.json or {}
        url = data.get('url')
        
        if not url:
            return create_error_response("缺少URL参数")
        
        action = PageAction(
            action_type=BrowserActionType.NAVIGATE,
            value=url
        )
        
        result = browser_service.execute_action(session_id, action)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "导航失败"))
            
    except Exception as e:
        return create_error_response(f"导航异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/click', methods=['POST'])
def click(session_id: str):
    """点击操作"""
    try:
        data = request.json or {}
        selector = data.get('selector')
        coordinates = data.get('coordinates')
        
        if not selector and not coordinates:
            return create_error_response("必须提供selector或coordinates参数")
        
        action = PageAction(
            action_type=BrowserActionType.CLICK,
            selector=selector,
            coordinates=coordinates
        )
        
        result = browser_service.execute_action(session_id, action)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "点击失败"))
            
    except Exception as e:
        return create_error_response(f"点击异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/input', methods=['POST'])
def input_text(session_id: str):
    """输入文本"""
    try:
        data = request.json or {}
        selector = data.get('selector')
        text = data.get('text')
        
        if not selector or text is None:
            return create_error_response("必须提供selector和text参数")
        
        action = PageAction(
            action_type=BrowserActionType.INPUT,
            selector=selector,
            value=text
        )
        
        result = browser_service.execute_action(session_id, action)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "输入失败"))
            
    except Exception as e:
        return create_error_response(f"输入异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/screenshot', methods=['POST'])
def screenshot(session_id: str):
    """截图操作"""
    try:
        data = request.json or {}
        options = data.get('options', {})
        
        action = PageAction(
            action_type=BrowserActionType.SCREENSHOT,
            options=options
        )
        
        result = browser_service.execute_action(session_id, action)
        
        if result.get("success"):
            # 返回截图数据
            screenshot_data = result.get("screenshot")
            if screenshot_data:
                return Response(
                    screenshot_data,
                    mimetype='image/png',
                    headers={
                        'Content-Disposition': 'attachment; filename=screenshot.png'
                    }
                )
            else:
                return create_error_response("截图数据为空")
        else:
            return create_error_response(result.get("error", "截图失败"))
            
    except Exception as e:
        return create_error_response(f"截图异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/highlight', methods=['POST'])
def highlight_element(session_id: str):
    """高亮元素"""
    try:
        data = request.json or {}
        selector = data.get('selector')
        options = data.get('options', {})
        
        if not selector:
            return create_error_response("必须提供selector参数")
        
        action = PageAction(
            action_type=BrowserActionType.HIGHLIGHT,
            selector=selector,
            options=options
        )
        
        result = browser_service.execute_action(session_id, action)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "高亮失败"))
            
    except Exception as e:
        return create_error_response(f"高亮异常: {str(e)}")

# Cookie管理API
@app.route('/api/v1/sessions/<session_id>/cookies/load', methods=['POST'])
def load_cookies(session_id: str):
    """加载Cookie"""
    try:
        data = request.json or {}
        cookie_source = data.get('cookie_source', 'default')
        
        result = browser_service.load_cookies(session_id, cookie_source)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "加载Cookie失败"))
            
    except Exception as e:
        return create_error_response(f"加载Cookie异常: {str(e)}")

@app.route('/api/v1/sessions/<session_id>/cookies/save', methods=['POST'])
def save_cookies(session_id: str):
    """保存Cookie"""
    try:
        data = request.json or {}
        cookie_target = data.get('cookie_target', 'default')
        
        result = browser_service.save_cookies(session_id, cookie_target)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "保存Cookie失败"))
            
    except Exception as e:
        return create_error_response(f"保存Cookie异常: {str(e)}")

# 指纹管理API
@app.route('/api/v1/sessions/<session_id>/fingerprint', methods=['PUT'])
def update_fingerprint(session_id: str):
    """更新浏览器指纹"""
    try:
        data = request.json or {}
        fingerprint_config = data.get('fingerprint_config', {})
        
        result = browser_service.update_fingerprint(session_id, fingerprint_config)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "更新指纹失败"))
            
    except Exception as e:
        return create_error_response(f"更新指纹异常: {str(e)}")

# 页面模板API
@app.route('/api/v1/sessions/<session_id>/template', methods=['POST'])
def execute_template(session_id: str):
    """执行页面模板"""
    try:
        data = request.json or {}
        template_data = data.get('template')
        url = data.get('url')
        
        if not template_data or not url:
            return create_error_response("必须提供template和url参数")
        
        # 构建页面模板
        template = PageTemplate(
            template_id=template_data.get('template_id', 'default'),
            name=template_data.get('name', 'Default Template'),
            url_pattern=template_data.get('url_pattern', '.*'),
            selectors=template_data.get('selectors', {}),
            actions=[
                PageAction(
                    action_type=BrowserActionType(action.get('action_type', 'navigate')),
                    selector=action.get('selector'),
                    value=action.get('value'),
                    coordinates=action.get('coordinates'),
                    wait_time=action.get('wait_time'),
                    options=action.get('options')
                )
                for action in template_data.get('actions', [])
            ],
            metadata=template_data.get('metadata')
        )
        
        result = browser_service.execute_template(session_id, template, url)
        
        if result.get("success"):
            return create_success_response(result)
        else:
            return create_error_response(result.get("error", "执行模板失败"))
            
    except Exception as e:
        return create_error_response(f"执行模板异常: {str(e)}")

# 健康检查API
@app.route('/api/v1/health', methods=['GET'])
def health_check():
    """健康检查"""
    return create_success_response({
        "status": "healthy",
        "service": "browser_service",
        "timestamp": time.time()
    })

# 错误处理
@app.errorhandler(404)
def not_found(error):
    return create_error_response("API端点不存在", 404)

@app.errorhandler(500)
def internal_error(error):
    return create_error_response("服务器内部错误", 500)

# 启动函数
def start_browser_api(host: str = "0.0.0.0", port: int = 8888, debug: bool = False):
    """启动浏览器服务API"""
    print(f"🚀 启动WebAuto浏览器服务API...")

    # 确保核心浏览器服务已启动（避免出现“服务未运行，无法创建会话”）
    try:
        status = browser_service.get_service_status()
        if status.get("status") != "running":
            print("🔧 浏览器核心服务未运行，正在在 API 层启动...")
            result = browser_service.start_service({
                "cookie_dir": "./cookies",
                "fingerprint_dir": "./fingerprints",
                "max_sessions": 10,
            })
            if result.get("success"):
                print("✅ 浏览器核心服务已在 API 层启动")
            else:
                print(f"❌ 浏览器核心服务启动失败: {result.get('error', '未知错误')}")
    except Exception as e:
        print(f"❌ 初始化浏览器核心服务异常: {e}")

    print(f"📡 服务地址: http://{host}:{port}")
    print(f"📋 API文档: http://{host}:{port}/api/v1/health")

    app.run(host=host, port=port, debug=debug)

if __name__ == "__main__":
    start_browser_api()
