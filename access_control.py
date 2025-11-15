"""
访问控制模块
完全禁止直接访问底层浏览器实现
"""

import sys
import os
import inspect
import importlib.util
from typing import Set, List, Dict, Any

class AccessController:
    """访问控制器"""
    
    # 禁止的模块和类
    FORBIDDEN_IMPORTS = {
        'playwright',
        'camoufox',
        'selenium',
        'undetected_chromedriver',
        'chromedriver_autoinstaller',
        'webdriver_manager'
    }
    
    FORBIDDEN_CLASSES = {
        'sync_playwright',
        'async_playwright',
        'NewBrowser',
        'CamoufoxBrowser',
        'WebDriver',
        'Chrome',
        'Firefox',
        'Edge',
        'Safari'
    }
    
    FORBIDDEN_FUNCTIONS = {
        'webdriver',
        'ChromeDriverManager',
        'GeckoDriverManager',
        'install',
        'download'
    }
    
    # 允许的模块（白名单）
    ALLOWED_MODULES = {
        'abstract_browser',
        'access_control',
        'builtins',
        'typing',
        'os',
        'sys',
        'time',
        'json',
        'datetime',
        'pathlib'
    }
    
    # 安全检查缓存
    _checked_files: Set[str] = set()
    _safe_files: Set[str] = set()
    _unsafe_files: Set[str] = set()
    
    @classmethod
    def validate_file_access(cls, filepath: str) -> bool:
        """验证文件访问权限"""
        if filepath in cls._safe_files:
            return True
        
        if filepath in cls._unsafe_files:
            return False
        
        is_safe = cls._check_file_safety(filepath)
        
        if is_safe:
            cls._safe_files.add(filepath)
        else:
            cls._unsafe_files.add(filepath)
        
        return is_safe
    
    @classmethod
    def _check_file_safety(cls, filepath: str) -> bool:
        """检查文件安全性"""
        if not os.path.exists(filepath):
            return True  # 不存在的文件跳过检查
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            return True  # 读取失败跳过检查
        
        # 检查禁止的导入
        for module in cls.FORBIDDEN_IMPORTS:
            patterns = [
                f'import {module}',
                f'from {module} import',
                f'from {module}\n'
            ]
            for pattern in patterns:
                if pattern in content:
                    return False
        
        # 检查禁止的类使用
        for cls_name in cls.FORBIDDEN_CLASSES:
            patterns = [
                f'{cls_name}(',
                f'{cls_name} '  # 类型注解
            ]
            for pattern in patterns:
                if pattern in content:
                    return False
        
        # 检查禁止的函数调用
        for func in cls.FORBIDDEN_FUNCTIONS:
            if f'{func}(' in content:
                return False
        
        # 检查是否通过抽象层访问
        if not any(
            allowed in content for allowed in ['abstract_browser', 'create_browser']
        ) and any(
            forbidden in content for forbidden in ['playwright', 'camoufox', 'selenium']
        ):
            return False
        
        return True
    
    @classmethod
    def check_call_stack(cls) -> bool:
        """检查调用栈安全性"""
        stack = inspect.stack()
        
        for frame_info in stack[1:]:  # 跳过当前帧
            frame = frame_info[0]
            filename = frame.f_globals.get('__file__', '')
            module_name = frame.f_globals.get('__name__', '')
            
            # 检查文件安全性
            if not cls.validate_file_access(filename):
                return False
            
            # 检查模块名
            if not cls._validate_module_name(module_name):
                return False
        
        return True
    
    @classmethod
    def _validate_module_name(cls, module_name: str) -> bool:
        """验证模块名安全性"""
        # 检查是否在允许的模块中
        if module_name in cls.ALLOWED_MODULES:
            return True
        
        # 检查是否是内部模块（以__开头）
        if module_name.startswith('__'):
            return True
        
        # 检查是否是项目内部模块
        if module_name.startswith('abstract_browser') or module_name.startswith('access_control'):
            return True
        
        return False
    
    @classmethod
    def enforce_security(cls):
        """强制执行安全检查"""
        if not cls.check_call_stack():
            stack = inspect.stack()
            caller_frame = stack[1][0]
            caller_file = caller_frame.f_globals.get('__file__', 'unknown')
            caller_module = caller_frame.f_globals.get('__name__', 'unknown')
            
            raise SecurityViolationError(
                "🚫 禁止访问底层浏览器实现！\n"
                f"📁 违规文件: {caller_file}\n"
                f"📦 违规模块: {caller_module}\n"
                "\n✅ 正确使用方式:\n"
                "   from browser_interface import create_browser, quick_test\n"
                "   browser = create_browser()\n"
          接口层文档"
            )
    
    @classmethod
    def clear_cache(cls):
        """清理缓存"""
        cls._checked_files.clear()
        cls._safe_files.clear()
        cls._unsafe_files.clear()
    
    @classmethod
    def get_safety_report(cls, directory: str = '.') -> Dict[str, Any]:
        """获取目录安全报告"""
        import glob
        
        report = {
            'total_files': 0,
            'safe_files': 0,
            'unsafe_files': 0,
            'unsafe_files_list': [],
            'safe_files_list': []
        }
        
        py_files = glob.glob(os.path.join(directory, '**', '*.py'), recursive=True)
        
        for filepath in py_files:
            if '__pycache__' in filepath or 'node_modules' in filepath:
                continue
            
            report['total_files'] += 1
            
            if cls.validate_file_access(filepath):
                report['safe_files'] += 1
                report['safe_files_list'].append(filepath)
            else:
                report['unsafe_files'] += 1
                report['unsafe_files_list'].append(filepath)
        
        return report

class SecurityViolationError(Exception):
    """安全违规异常"""
    pass

# 装饰器版本的安全检查
def security_check(func):
    """安全检查装饰器"""
    def wrapper(*args, **kwargs):
        AccessController.enforce_security()
        return func(*args, **kwargs)
    return wrapper

def secure_method(func):
    """安全方法装饰器"""
    def wrapper(self, *args, **kwargs):
        AccessController.enforce_security()
        return func(self, *args, **kwargs)
    return wrapper

class SecurityContext:
    """安全上下文管理器"""
    
    def __enter__(self):
        AccessController.enforce_security()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

if __name__ == '__main__':
    """测试访问控制"""
    print('=== 测试访问控制系统 ===')
    
    # 生成安全报告
    report = AccessController.get_safety_report('.')
    
    print(f'\n📊 安全报告:')
    print(f'总文件数: {report["total_files"]}')
    print(f'安全文件: {report["safe_files"]}')
    print(f'不安全文件: {report["unsafe_files"]}')
    
    if report['unsafe_files_list']:
        print(f'\n⚠️  不安全文件列表:')
        for file in report['unsafe_files_list']:
            print(f'  🚫 {file}')
    
    if report['safe_files_list']:
        print(f'\n✅ 安全文件列表 (前10个):')
        for file in report['safe_files_list'][:10]:
            print(f'  ✅ {file}')
        
        if len(report['safe_files_list']) > 10:
            print(f'  ... 还有 {len(report["safe_files_list"]) - 10} 个安全文件')
    
    保护系统...')
