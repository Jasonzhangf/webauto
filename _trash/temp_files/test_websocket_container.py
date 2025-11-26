#!/usr/bin/env python3
"""
直接测试WebSocket服务器的容器匹配功能
"""

import asyncio
import json
import websockets

async def test_container_matching():
    """测试容器匹配功能"""
    uri = "ws://127.0.0.1:8765"

    try:
        print("🔗 连接到WebSocket服务器...")
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket连接成功")

            # 1. 创建会话
            print("\n📱 创建新会话...")
            session_request = {
                "type": "command",
                "session_id": "test_session",
                "data": {
                    "command_type": "session_control",
                    "action": "create",
                    "capabilities": ["dom"]
                },
                "timestamp": 0
            }

            await websocket.send(json.dumps(session_request))
            print("📤 已发送会话创建请求")

            # 等待响应
            response = await asyncio.wait_for(websocket.recv(), timeout=10)
            session_response = json.loads(response)
            print(f"📥 会话创建响应: {session_response}")

            if not session_response.get('data', {}).get('success'):
                print("❌ 会话创建失败")
                return

            session_id = session_response['data'].get('session_id', 'test_session')
            print(f"🎯 会话ID: {session_id}")

            # 2. 测试容器匹配
            print("\n🔍 测试容器匹配...")
            container_request = {
                "type": "command",
                "session_id": session_id,
                "data": {
                    "command_type": "container_operation",
                    "action": "match_root",
                    "page_context": {
                        "url": "https://weibo.com",
                        "domain": "weibo.com",
                        "path": "/"
                    }
                },
                "timestamp": 0
            }

            await websocket.send(json.dumps(container_request))
            print("📤 已发送容器匹配请求")

            # 等待响应
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=30)
                container_response = json.loads(response)
                print(f"📥 容器匹配响应: {json.dumps(container_response, indent=2, ensure_ascii=False)}")

                if container_response.get('data', {}).get('success'):
                    print("✅ 容器匹配成功!")
                    match_data = container_response['data']
                    print(f"   🎯 匹配容器: {match_data.get('data', {}).get('container', {}).get('name')}")
                    print(f"   📊 置信度: {match_data.get('confidence', 0):.3f}")
                    print(f"   🔗 选择器: {match_data.get('data', {}).get('container', {}).get('matched_selector')}")
                else:
                    print("❌ 容器匹配失败")
                    print(f"   错误: {container_response.get('data', {}).get('error')}")

            except asyncio.TimeoutError:
                print("⏰ 容器匹配请求超时")

    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🧪 WebSocket容器匹配测试")
    print("=" * 40)
    asyncio.run(test_container_matching())