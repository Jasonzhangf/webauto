"""
浏览器架构分析
"""

import os
import re

def analyze_browser_usage():
    """分析当前浏览器使用情况"""
    
    # 查找所有Python文件
    py_files = []
    for root, dirs, files in os.walk('.'):
        if '__pycache__' in root or 'node_modules' in root:
            continue
        for file in files:
            if file.endswith('.py'):
                py_files.append(os.path.join(root, file))
    
    print(f'=== 浏览器架构分析 ===')
    print(f'总共找到 {len(py_files)} 个 Python 文件')
    
    # 分析浏览器相关文件
    browser_files = []
    browser_imports = set()
    
    for file in py_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # 检查是否包含浏览器相关导入
                imports = re.findall(r'(from|import)\s+.*(camoufox|playwright)', content)
                if imports:
                    browser_files.append(file)
                    browser_imports.update(imports)
                    
        except Exception as e:
            print(f'读取文件 {file} 失败: {e}')
    
    print(f'\n=== 浏览器相关文件 ({len(browser_files)} 个) ===')
    for file in sorted(browser_files):
        print(f'  {file}')
    
    print(f'\n=== 浏览器导入语句 ({len(browser_imports)} 种) ===')
    for imp in sorted(browser_imports):
        print(f'  {imp}')
    
    # 分析重复文件模式
    test_files = [f for f in browser_files if 'test' in f.lower()]
    config_files = [f for f in browser_files if 'config' in f.lower() or 'setup' in f.lower()]
    
    print(f'\n=== 文件分类 ===')
    print(f'测试文件: {len(test_files)} 个')
    for f in sorted(test_files):
        print(f'  {f}')
    
    print(f'\n配置文件: {len(config_files)} 个')
    for f in sorted(config_files):
        print(f'  {f}')
    
    # 分析 libs/browser 模块
    if os.path.exists('libs/browser'):
        lib_files = []
        for root, dirs, files in os.walk('libs/browser'):
            for file in files:
                if file.endswith('.py'):
                    lib_files.append(os.path.join(root, file))
        
        print(f'\n=== libs/browser 模块 ({len(lib_files)} 个文件) ===')
        for f in sorted(lib_files):
            print(f'  {f}')
    
    return {
        'total_files': len(py_files),
        'browser_files': browser_files,
        'test_files': test_files,
        'config_files': config_files,
        'browser_imports': list(browser_imports)
    }

if __name__ == '__main__':
    result = analyze_browser_usage()
    
    print(f'\n=== 问题总结 ===')
    print(f'1. 存在 {len(result["browser_files"])} 个浏览器相关文件')
    print(f'2. 有 {len(result["test_files"])} 个测试文件，存在重复')
    print(f'3. 有 {len(result["config_files"])} 个配置文件，需要统一')
    print(f'4. libs/browser 模块是正确的架构方向')
    
    print(f'\n=== 解决方案 ===')
    print('1. 以 libs/browser 为核心模块')
    print('2. 创建全局浏览器管理器')
    print('3. 统一所有浏览器调用')
    print('4. 清理重复的测试和配置文件')
