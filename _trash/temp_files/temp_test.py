
import requests
import time
import json

print('🎯 开始完整测试...')

try:
    # 1. 创建会话
    response = requests.post('http://localhost:8888/api/v1/sessions', 
                             json={'profile': {'profile_id': 'weibo-test', 'viewport': {'width': 1440, 'height': 900}, 'timezone': 'Asia/Shanghai'}})
    data = response.json()
    if data.get('success'):
        session_id = data['data']['session_id']
        print(f'✅ 会话创建成功: {session_id}')
        
        # 2. 导航到微博
        nav_response = requests.post(f'http://localhost:8888/api/v1/sessions/{session_id}/actions',
                                json={'type': 'navigate', 'url': 'https://weibo.com'})
        nav_data = nav_response.json()
        if nav_data.get('success'):
            print('✅ 导航成功')
        else:
            print(f'❌ 导航失败: {nav_data.get("error")}')
            sys.exit(1)
            
        # 3. 等待页面加载（带截图）
        print('⏱️ 等待页面加载并截图...')
        time.sleep(10)
        
        # 4. 截图验证页面到达
        screenshot_response = requests.post(f'http://localhost:8888/api/v1/sessions/{session_id}/actions',
                                       json={'type': 'screenshot', 'filename': 'step3-weibo-arrival.png'})
        if screenshot_response.get('success'):
            print('📸 页面到达验证截图成功')
        else:
            print(f'❌ 截图失败: {screenshot_response.get("error")}')
            sys.exit(1)
            
        # 5. 等待60秒后截图
        print('⏱️ 等待60秒后再次截图...')
        time.sleep(60)
        
        # 6. 60秒后截图
        final_screenshot_response = requests.post(f'http://localhost:8888/api/v1/sessions/{session_id}/actions',
                                            json={'type': 'screenshot', 'filename': 'step4-weibo-60seconds.png'})
        if final_screenshot_response.get('success'):
            print('📸 60秒后截图成功')
        else:
            print(f'❌ 60秒后截图失败: {final_screenshot_response.get("error")}')
            sys.exit(1)
            
        print('
🎯 测试完成！')
        print('📝 CLI工具基本功能验证通过')
        print('📸 所有截图已保存到screenshots/目录')
        
    except Exception as e:
        print(f'❌ 测试异常: {str(e)}')
        sys.exit(1)
