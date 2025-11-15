"""
WebAuto 浏览器服务包
提供完整的浏览器自动化服务
"""

# 服务接口
from .browser_service_interface import (
    AbstractBrowserService,
    AbstractBrowserController,
    BrowserProfile,
    BrowserSession,
    PageAction,
    PageTemplate,
    BrowserActionType,
    AntiDetectionLevel
)

# 服务实现
from .browser_service import (
    BrowserService,
    BrowserController,
    BrowserServiceError
)

# 指纹管理
from .fingerprint_manager import (
    FingerprintManager,
    AntiDetectionManager
)

# API接口
from .browser_api import (
    start_browser_api,
    app as browser_api_app
)

# 启动器
from .browser_launcher import (
    main as start_browser_service
)

# 版本信息
__version__ = "2.0.0"
__author__ = "WebAuto Team"
__description__ = "WebAuto 浏览器服务 - 提供完整的浏览器自动化能力"

# 导出主要组件
__all__ = [
    # 接口
    "AbstractBrowserService",
    "AbstractBrowserController", 
    "BrowserProfile",
    "BrowserSession",
    "PageAction",
    "PageTemplate",
    "BrowserActionType",
    "AntiDetectionLevel",
    
    # 实现
    "BrowserService",
    "BrowserController",
    "BrowserServiceError",
    
    # 指纹管理
    "FingerprintManager",
    "AntiDetectionManager",
    
    # API
    "start_browser_api",
    "browser_api_app",
    
    # 启动器
    "start_browser_service",
    
    # 版本
    "__version__",
    "__author__",
    "__description__"
]