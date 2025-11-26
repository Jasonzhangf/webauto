#!/usr/bin/env python3
"""
测试WebSocket连接
"""

import asyncio
import websockets

async def test_websocket_connection():
    try:
        uri = "ws://127.0.0.1:8765"
        print(f"🔗 连接到 {uri}...")

        async with websockets.connect(uri, timeout=5) as websocket:
            print("✅ WebSocket连接成功")

            # 发送一个ping消息
            await websocket.send("ping")
            print("📤 已发送ping消息")

            # 等待响应
            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            print(f"📥 收到响应: {response}")

    except Exception as e:
        print(f"❌ 连接失败: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket_connection())