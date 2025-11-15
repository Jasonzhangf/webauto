"""
简单测试浏览器模块
"""

import sys
sys.path.append('libs')

from browser import BrowserConfig

def test_configs_only():
    """只测试配置，不启动浏览器"""
    print('=== 测试配置系统 ===')
    
    # 默认配置
    default = BrowserConfig.get_default_config()
    print(f'默认配置: {default}')
    
    # 隐匿配置
    stealth = BrowserConfig.get_stealth_config()
    print(f'隐匿配置 args 数量: {len(stealth.get("args", []))}')
    
    # 无头配置
    headless = BrowserConfig.get_headless_config()
    print(f'无头模式: {headless["headless"]}')
    
    # 合并配置
    merged = BrowserConfig.merge_configs(
        default,
        {'custom_param': 'test'}
    )
    print(f'合并配置: {merged}')
    
    print('✓ 所有配置测试通过')

if __name__ == '__main__':
    test_configs_only()
    print('\n配置系统验证完成！')
